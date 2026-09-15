import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { TeamAccessService } from '../../../core/team-workspace/team-access.service';
import { Team } from '../../../shared/models/team';
import { GetSquadOverviewUseCase } from '../application/get-squad-overview.use-case';
import { SquadOverviewPreferences } from '../application/squad-overview-preferences';
import { TeamsService } from '../application/teams.service';
import { PLAYER_NAME_MAX_LENGTH } from '../domain/roster';
import { filterAndSortSquad, SquadOverview } from '../domain/squad-overview';

@Component({
  selector: 'app-team-detail-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './team-detail-page.html',
  styleUrl: './team-detail-page.scss',
})
export class TeamDetailPage implements OnDestroy {
  private readonly teams = inject(TeamsService);
  private readonly getOverview = inject(GetSquadOverviewUseCase);
  private readonly formBuilder = inject(FormBuilder);
  private readonly workspace = inject(TeamWorkspaceContext, { optional: true });
  protected readonly filters = inject(SquadOverviewPreferences);
  protected readonly access = inject(TeamAccessService);
  readonly teamId = input<string>();
  readonly workspaceMode = input(false);
  protected readonly resolvedTeamId = computed(
    () => this.teamId() ?? (this.workspaceMode() ? this.workspace?.activeTeamId() : null) ?? '',
  );
  protected readonly backLink = computed(() => (this.workspaceMode() ? '/dashboard' : '/teams'));
  protected readonly team = signal<Team | null>(null);
  protected readonly overview = signal<SquadOverview | null>(null);
  protected readonly photoUrls = signal(new Map<string, string>());
  protected readonly selectedPlayerId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly missing = signal(false);
  protected readonly saving = signal(false);
  protected readonly filteredPlayers = computed(() =>
    filterAndSortSquad(
      this.overview()?.players ?? [],
      this.filters.search(),
      this.filters.status(),
      this.filters.position(),
      this.filters.sort(),
    ),
  );
  protected readonly positions = computed(() =>
    [
      ...new Set(
        (this.overview()?.players ?? []).flatMap(({ position }) => (position ? [position] : [])),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es')),
  );
  protected readonly playerForm = this.formBuilder.nonNullable.group({
    number: ['', [Validators.required, Validators.pattern(/^\d{1,2}$/)]],
    name: ['', [Validators.required, Validators.maxLength(PLAYER_NAME_MAX_LENGTH)]],
    position: [''],
    active: [true],
  });

  constructor() {
    effect(() => {
      const id = this.resolvedTeamId();
      const season = this.filters.season();
      if (id) void this.load(id, season);
    });
  }
  ngOnDestroy(): void {
    this.revokePhotoUrls();
  }
  protected editing(): boolean {
    return this.selectedPlayerId() !== null;
  }
  protected selectPlayer(playerId: string): void {
    const player = this.overview()?.players.find(({ playerId: id }) => id === playerId);
    if (!player) return;
    this.selectedPlayerId.set(playerId);
    this.error.set(null);
    this.playerForm.setValue({
      number: String(player.number),
      name: player.name,
      position: player.position ?? '',
      active: player.active,
    });
    document
      .getElementById('player-editor')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  protected addPlayer(): void {
    this.cancelEdit();
    document
      .getElementById('player-editor')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  protected cancelEdit(): void {
    this.selectedPlayerId.set(null);
    this.error.set(null);
    this.playerForm.reset({ number: '', name: '', position: '', active: true });
  }
  protected async savePlayer(): Promise<void> {
    if (!this.access.canWrite()) return;
    this.playerForm.markAllAsTouched();
    if (this.saving() || this.playerForm.invalid) return;
    const values = this.playerForm.getRawValue();
    const teamId = this.resolvedTeamId();
    this.saving.set(true);
    this.error.set(null);
    try {
      const payload = {
        teamId,
        number: values.number,
        name: values.name,
        position: values.position,
        active: values.active,
      };
      const id = this.selectedPlayerId();
      const result = id
        ? await this.teams.updatePlayer(id, payload)
        : await this.teams.addPlayer(payload);
      if (!result.ok) {
        this.error.set(result.error);
        return;
      }
      this.cancelEdit();
      await this.load(teamId, this.filters.season());
    } catch {
      this.error.set('No se ha podido guardar el jugador.');
    } finally {
      this.saving.set(false);
    }
  }
  protected async removePlayer(): Promise<void> {
    if (!this.access.canWrite()) return;
    const id = this.selectedPlayerId();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.teams.removePlayer(this.resolvedTeamId(), id);
      if (!result.ok) {
        this.error.set(result.error);
        return;
      }
      this.cancelEdit();
      await this.load(this.resolvedTeamId(), this.filters.season());
    } catch {
      this.error.set('No se ha podido quitar el jugador.');
    } finally {
      this.saving.set(false);
    }
  }
  protected retry(): void {
    void this.load(this.resolvedTeamId(), this.filters.season());
  }
  protected minutes(ms: number): string {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(ms / 60_000);
  }
  protected decimal(value: number): string {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value);
  }
  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
  private async load(teamId: string, season: string): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.missing.set(false);
    try {
      const team = await this.teams.getTeam(teamId);
      if (!team) {
        this.missing.set(true);
        return;
      }
      await this.access.load(teamId);
      const result = await this.getOverview.execute(teamId, season);
      this.team.set(team);
      this.overview.set(result);
      this.revokePhotoUrls();
      const urls = new Map<string, string>();
      for (const player of result.players) {
        const blob = player.photoRef
          ? result.photoBlobs.get(player.photoRef.storageKey)
          : undefined;
        if (blob) urls.set(player.playerId, URL.createObjectURL(blob));
      }
      this.photoUrls.set(urls);
      if (season !== 'all' && !result.seasons.includes(season)) this.filters.season.set('all');
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
  private revokePhotoUrls(): void {
    for (const url of this.photoUrls().values()) URL.revokeObjectURL(url);
    this.photoUrls.set(new Map());
  }
}
