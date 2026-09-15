import { computed, inject, Injectable, signal } from '@angular/core';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_PROFILE_REPOSITORY,
  PLAYER_PHOTO_REPOSITORY,
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
import { PlayerInput, updatePlayerRecord } from '../../teams/domain/roster';
import { DeletePlayerPhotoUseCase, UploadPlayerPhotoUseCase } from './player-photo.use-cases';
import { TeamAccessService } from '../../../core/team-workspace/team-access.service';

@Injectable()
export class PlayerProfileStore {
  private readonly players = inject(PLAYER_REPOSITORY);
  private readonly profiles = inject(PLAYER_PROFILE_REPOSITORY);
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly events = inject(MATCH_EVENT_REPOSITORY);
  private readonly photos = inject(PLAYER_PHOTO_REPOSITORY);
  private readonly uploadPhotoUseCase = inject(UploadPlayerPhotoUseCase);
  private readonly deletePhotoUseCase = inject(DeletePlayerPhotoUseCase);
  private readonly access = inject(TeamAccessService);
  readonly canWrite = this.access.canWrite;

  readonly player = signal<Player | null>(null);
  readonly profile = signal<PlayerProfile | null>(null);
  readonly records = signal<MatchWithEvents[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly photoBlob = signal<Blob | null>(null);
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
    this.photoBlob.set(null);
    this.season.set('all');
    try {
      const player = (await this.players.listByIds([playerId]))[0];
      if (!player) {
        this.error.set('El jugador no existe o ya no está disponible.');
        return;
      }
      await this.access.load(player.teamId);
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
      const profile = storedProfile ?? emptyPlayerProfile(player.id, player.teamId);
      this.profile.set(profile);
      if (profile.photoRef) this.photoBlob.set((await this.photos.get(profile.photoRef)) ?? null);
      this.records.set(records);
    } catch {
      this.error.set('No se ha podido cargar el perfil del jugador.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(
    input: PlayerProfileInput,
    playerInput?: Omit<PlayerInput, 'teamId'>,
  ): Promise<boolean> {
    if (!this.canWrite()) return false;
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
      if (playerInput && this.player() && playerChanged(this.player()!, playerInput)) {
        const player = this.player()!;
        const roster = await this.players.listByTeam(player.teamId);
        const playerResult = updatePlayerRecord(
          player,
          { ...playerInput, teamId: player.teamId },
          roster,
        );
        if (!playerResult.ok) {
          this.error.set(playerResult.error);
          return false;
        }
        await this.players.put(playerResult.value);
        this.player.set(playerResult.value);
      }
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

  async uploadPhoto(blob: Blob): Promise<boolean> {
    if (!this.canWrite()) return false;
    const profile = this.profile();
    if (!profile || this.saving()) return false;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const updated = await this.uploadPhotoUseCase.execute(profile, blob);
      this.profile.set(updated);
      this.photoBlob.set(blob);
      this.notice.set('Foto guardada.');
      return true;
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se ha podido guardar la foto.');
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async deletePhoto(): Promise<boolean> {
    if (!this.canWrite()) return false;
    const profile = this.profile();
    if (!profile || this.saving()) return false;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const updated = await this.deletePhotoUseCase.execute(profile);
      this.profile.set(updated);
      this.photoBlob.set(null);
      this.notice.set('Foto eliminada.');
      return true;
    } catch {
      this.error.set('No se ha podido eliminar la foto.');
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}

function playerChanged(player: Player, input: Omit<PlayerInput, 'teamId'>): boolean {
  return (
    Number(input.number) !== player.number ||
    input.name.trim() !== player.name ||
    (input.position?.trim() || undefined) !== player.position ||
    (input.active ?? player.active) !== player.active
  );
}
