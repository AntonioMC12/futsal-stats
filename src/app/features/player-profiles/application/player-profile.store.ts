import { computed, inject, Injectable, signal } from '@angular/core';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_PROFILE_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { Match, isMatchFinished, matchSeason } from '../../../shared/models/match';
import { Player } from '../../../shared/models/player';
import { emptyPlayerProfile, PlayerProfile } from '../../../shared/models/player-profile';
import {
  aggregatePlayerHistory,
  buildPlayerHistory,
  filterPlayerHistoryBySeason,
  MatchWithEvents,
} from '../domain/player-profile-statistics';
import { PlayerProfileInput, updatePlayerProfile } from '../domain/player-profile';

@Injectable()
export class PlayerProfileStore {
  private readonly players = inject(PLAYER_REPOSITORY);
  private readonly profiles = inject(PLAYER_PROFILE_REPOSITORY);
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly events = inject(MATCH_EVENT_REPOSITORY);

  readonly player = signal<Player | null>(null);
  readonly profile = signal<PlayerProfile | null>(null);
  readonly records = signal<MatchWithEvents[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly season = signal('all');

  readonly history = computed(() => buildPlayerHistory(this.player()?.id ?? '', this.records()));
  readonly seasons = computed(() =>
    [...new Set(this.history().map(({ match }) => matchSeason(match)))].sort((a, b) =>
      b.localeCompare(a, 'es'),
    ),
  );
  readonly filteredHistory = computed(() =>
    filterPlayerHistoryBySeason(this.history(), this.season()),
  );
  readonly statistics = computed(() => aggregatePlayerHistory(this.filteredHistory()));
  readonly careerStatistics = computed(() => aggregatePlayerHistory(this.history()));

  async load(playerId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.player.set(null);
    this.profile.set(null);
    this.records.set([]);
    this.season.set('all');
    try {
      const player = (await this.players.listByIds([playerId]))[0];
      if (!player) {
        this.error.set('El jugador no existe o ya no está disponible.');
        return;
      }
      const [storedProfile, matches] = await Promise.all([
        this.profiles.get(player.id),
        this.matches.listByTeam(player.teamId),
      ]);
      const relevantMatches = matches.filter(
        (match) => isMatchFinished(match) && match.squadPlayerIds.includes(player.id),
      );
      const records: MatchWithEvents[] = await Promise.all(
        relevantMatches.map(async (match: Match) => ({
          match,
          events: await this.events.listByMatch(match.id),
        })),
      );
      this.player.set(player);
      this.profile.set(storedProfile ?? emptyPlayerProfile(player.id, player.teamId));
      this.records.set(records);
    } catch {
      this.error.set('No se ha podido cargar el perfil del jugador.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(input: PlayerProfileInput): Promise<boolean> {
    const current = this.profile();
    if (!current || this.saving()) return false;
    const result = updatePlayerProfile(current, input, Date.now());
    if (!result.ok) {
      this.error.set(result.error);
      this.notice.set(null);
      return false;
    }
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.profiles.put(result.value);
      this.profile.set(result.value);
      this.notice.set('Perfil guardado.');
      return true;
    } catch {
      this.error.set('No se ha podido guardar el perfil. Los datos anteriores siguen disponibles.');
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
