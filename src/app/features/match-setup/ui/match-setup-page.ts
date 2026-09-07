import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Player } from '../../../shared/models/player';
import { localDateString } from '../../../shared/models/match';
import { MatchSetupService, MatchSetupTeam } from '../application/match-setup.service';
import { STARTING_LINEUP_SIZE } from '../domain/match-setup';

@Component({
  selector: 'app-match-setup-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './match-setup-page.html',
  styleUrl: './match-setup-page.scss',
})
export class MatchSetupPage {
  private readonly setup = inject(MatchSetupService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly teams = signal<MatchSetupTeam[]>([]);
  protected readonly players = signal<Player[]>([]);
  protected readonly squadIds = signal<Set<string>>(new Set());
  protected readonly loadingPlayers = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedCount = computed(() => this.squadIds().size);

  protected readonly form = this.formBuilder.nonNullable.group({
    teamId: ['', Validators.required],
    awayTeamShortName: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(6)],
    ],
    awayTeamName: ['', [Validators.required, Validators.maxLength(60)]],
    matchDate: [localDateString(), Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]],
  });
  protected readonly availablePlayers = computed(() => {
    const teamId = this.form.controls.teamId.value;
    return this.players().filter((player) => player.active && player.teamId === teamId);
  });
  protected readonly allPlayersSelected = computed(() => {
    const available = this.availablePlayers();
    const squad = this.squadIds();
    return available.length > 0 && available.every((player) => squad.has(player.id));
  });

  constructor() {
    void this.loadTeams();
  }

  protected async selectTeam(): Promise<void> {
    const teamId = this.form.controls.teamId.value;
    this.players.set([]);
    this.squadIds.set(new Set());
    this.error.set(null);
    if (!teamId) {
      return;
    }

    this.loadingPlayers.set(true);
    try {
      this.players.set(await this.setup.listPlayers(teamId));
    } catch {
      this.error.set('No se ha podido cargar la plantilla.');
    } finally {
      this.loadingPlayers.set(false);
    }
  }

  protected toggleSquad(playerId: string): void {
    const squad = new Set(this.squadIds());
    if (squad.has(playerId)) {
      squad.delete(playerId);
    } else {
      squad.add(playerId);
    }
    this.squadIds.set(squad);
  }

  protected toggleAllPlayers(): void {
    if (this.allPlayersSelected()) {
      this.squadIds.set(new Set());
      return;
    }

    this.squadIds.set(new Set(this.availablePlayers().map((player) => player.id)));
  }

  protected isSelected(playerId: string): boolean {
    return this.squadIds().has(playerId);
  }

  protected canSave(): boolean {
    return this.form.valid && this.selectedCount() >= STARTING_LINEUP_SIZE;
  }

  protected normalizeAbbreviation(): void {
    const control = this.form.controls.awayTeamShortName;
    control.setValue(control.value.trim().toUpperCase());
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.normalizeAbbreviation();
    this.form.markAllAsTouched();
    if (!this.canSave()) {
      this.error.set('Completa los datos y selecciona al menos 5 jugadores convocados.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.setup.createMatch({
        ...this.form.getRawValue(),
        squadPlayerIds: [...this.squadIds()],
      });
      if (!result.ok) {
        this.error.set(result.error);
        return;
      }
      await this.router.navigate(['/live', result.value.id]);
    } catch {
      this.error.set('No se ha podido crear el partido.');
    } finally {
      this.saving.set(false);
    }
  }

  private async loadTeams(): Promise<void> {
    try {
      const teams = await this.setup.listTeams();
      this.teams.set(teams);
      if (teams.length === 1) {
        this.form.controls.teamId.setValue(teams[0]!.team.id);
        await this.selectTeam();
      }
    } catch {
      this.loadFailed.set(true);
    }
  }
}
