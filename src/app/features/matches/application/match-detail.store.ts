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
import { deriveMatchState } from '../../live-match/domain/derived-match-state';
import { deriveMatchStatistics } from '../../live-match/domain/match-statistics';
import { createMatchTimeline } from '../../live-match/domain/match-timeline';

@Injectable()
export class MatchDetailStore {
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly eventsRepository = inject(MATCH_EVENT_REPOSITORY);
  private readonly playersRepository = inject(PLAYER_REPOSITORY);

  readonly match = signal<Match | null>(null);
  readonly events = signal<MatchEvent[]>([]);
  readonly players = signal<Player[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly derivedState = computed(() => {
    const match = this.match();
    return match ? deriveMatchState(match, this.events()) : null;
  });
  readonly score = computed(() => this.derivedState()?.score ?? { home: 0, away: 0 });
  readonly foulsByPeriod = computed(() => {
    const match = this.match();
    if (!match) return [];
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
    this.players()
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
    } catch {
      this.error.set('No se ha podido cargar el detalle del partido.');
    } finally {
      this.loading.set(false);
    }
  }
}
