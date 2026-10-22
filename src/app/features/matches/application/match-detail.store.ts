import { computed, inject, Injectable, signal } from '@angular/core';
import { projectRemaining } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { deriveMatchState, selectActiveEvents } from '../../live-match/domain/derived-match-state';
import { deriveDisciplinaryState } from '../../live-match/domain/discipline';
import { deriveMatchStatistics } from '../../live-match/domain/match-statistics';
import { createMatchTimeline } from '../../live-match/domain/match-timeline';
import { MatchIntegrityService } from '../../../core/sync/match-integrity.service';
import { MatchIntegrityReport } from '../../../core/sync/match-integrity.model';

@Injectable()
export class MatchDetailStore {
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly eventsRepository = inject(MATCH_EVENT_REPOSITORY);
  private readonly playersRepository = inject(PLAYER_REPOSITORY);
  private readonly integrity = inject(MatchIntegrityService, { optional: true });

  readonly match = signal<Match | null>(null);
  readonly events = signal<MatchEvent[]>([]);
  readonly players = signal<Player[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly integrityReport = signal<MatchIntegrityReport | null>(null);
  readonly integrityBusy = signal(false);
  readonly integrityError = signal<string | null>(null);

  readonly derivedState = computed(() => {
    const match = this.match();
    return match ? deriveMatchState(match, this.events()) : null;
  });
  readonly legacySnapshot = computed(() => this.match()?.importMetadata?.legacySnapshot ?? null);
  readonly score = computed(
    () =>
      this.legacySnapshot()?.observedScore ?? this.derivedState()?.score ?? { home: 0, away: 0 },
  );
  readonly legacyPlayerRows = computed(() => {
    const snapshots = new Map(
      this.legacySnapshot()?.players.map((item) => [item.playerId, item]) ?? [],
    );
    return this.players()
      .map((player) => ({ player, snapshot: snapshots.get(player.id) }))
      .filter((row) => row.snapshot !== undefined)
      .sort((left, right) => left.player.number - right.player.number);
  });
  readonly foulsByPeriod = computed(() => {
    const match = this.match();
    if (!match || this.legacySnapshot()) return [];
    const fouls = this.derivedState()?.foulsByPeriod ?? {};
    return Array.from({ length: match.periodCount }, (_, index) => ({
      period: index + 1,
      home: fouls[index + 1]?.home ?? 0,
      away: fouls[index + 1]?.away ?? 0,
    }));
  });
  readonly statistics = computed(() => {
    const match = this.match();
    if (!match) return { players: {}, lineups: [], playerStints: {} };
    return deriveMatchStatistics(match, this.events(), projectRemaining(match.clock, Date.now()));
  });
  readonly playerRows = computed(() =>
    this.legacySnapshot()
      ? []
      : this.players()
          .map((player) => ({ player, statistics: this.statistics().players[player.id] }))
          .filter((row) => row.statistics !== undefined)
          .sort((left, right) => left.player.number - right.player.number),
  );
  readonly timeline = computed(() =>
    createMatchTimeline(
      this.events(),
      Object.fromEntries(this.players().map((player) => [player.id, player.name])),
      Object.fromEntries(this.players().map((player) => [player.id, player.number])),
    ),
  );
  readonly discipline = computed(() => deriveDisciplinaryState(this.events(), 0));
  readonly summary = computed(() => {
    const rows = this.playerRows();
    const recorded = this.match()?.statisticsSchemaVersion === 2;
    const sum = (
      key: 'shotsTotal' | 'shotsOnTarget' | 'shotsOffTarget' | 'saves' | 'foulsReceived',
    ) => (recorded ? rows.reduce((total, row) => total + (row.statistics?.[key] ?? 0), 0) : null);
    const shots = sum('shotsTotal');
    const onTarget = sum('shotsOnTarget');
    const scorerGoals = rows.reduce((total, row) => total + (row.statistics?.goals ?? 0), 0);
    return {
      shots,
      onTarget,
      offTarget: sum('shotsOffTarget'),
      saves: sum('saves'),
      foulsReceived: sum('foulsReceived'),
      accuracy: shots ? Math.round((onTarget! / shots) * 100) : null,
      conversion: shots ? Math.round((scorerGoals / shots) * 100) : null,
      scorers: rows
        .filter((row) => row.statistics!.goals > 0)
        .sort(
          (a, b) => b.statistics!.goals - a.statistics!.goals || a.player.number - b.player.number,
        ),
      unattributedGoals: Math.max(0, this.score().home - scorerGoals),
    };
  });
  readonly periodSummary = computed(() => {
    const active = selectActiveEvents(this.events());
    return this.foulsByPeriod().map((period) => ({
      ...period,
      goalsFor: active.filter(
        (event) => event.period === period.period && event.type === 'GOAL_FOR',
      ).length,
      goalsAgainst: active.filter(
        (event) => event.period === period.period && event.type === 'GOAL_AGAINST',
      ).length,
    }));
  });
  readonly lineupRows = computed(() => {
    const players = new Map(this.players().map((player) => [player.id, player]));
    return [...this.statistics().lineups]
      .filter((lineup) => lineup.playedMs > 0)
      .sort((a, b) => b.playedMs - a.playedMs)
      .map((lineup) => ({
        ...lineup,
        label: lineup.playerIds
          .map((id) => {
            const player = players.get(id);
            return player ? `#${player.number} ${player.name}` : 'Jugador no disponible';
          })
          .join(' · '),
      }));
  });

  async load(matchId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.match.set(null);
    try {
      const match = await this.matches.get(matchId);
      if (!match) {
        this.error.set('El partido no existe o ya no está disponible.');
        return;
      }
      const [events, players] = await Promise.all([
        this.eventsRepository.listByMatch(match.id),
        this.playersRepository.listByIds(match.squadPlayerIds),
      ]);
      this.match.set(match);
      this.events.set(events);
      this.players.set(players);
      if (match.status === 'finished') void this.checkIntegrity();
    } catch {
      this.error.set('No se ha podido cargar el detalle del partido.');
    } finally {
      this.loading.set(false);
    }
  }

  async checkIntegrity(): Promise<void> {
    const match = this.match();
    if (!match || !this.integrity || this.integrityBusy()) return;
    this.integrityBusy.set(true);
    this.integrityError.set(null);
    try {
      this.integrityReport.set(await this.integrity.verify(match.id));
    } catch (error) {
      this.integrityError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.integrityBusy.set(false);
    }
  }

  async repairIntegrity(): Promise<void> {
    const match = this.match();
    if (!match || !this.integrity || this.integrityBusy()) return;
    this.integrityBusy.set(true);
    this.integrityError.set(null);
    try {
      this.integrityReport.set(await this.integrity.repair(match.id));
    } catch (error) {
      this.integrityError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.integrityBusy.set(false);
    }
  }
}
