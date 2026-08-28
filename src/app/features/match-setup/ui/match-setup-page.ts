import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Player } from '../../../shared/models/player';
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
  protected readonly lineupIds = signal<Set<string>>(new Set());
  protected readonly loadingPlayers = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedCount = computed(() => this.squadIds().size);
  protected readonly lineupCount = computed(() => this.lineupIds().size);

  protected readonly form = this.formBuilder.nonNullable.group({
    teamId: ['', Validators.required],
    awayTeamName: ['', [Validators.required, Validators.maxLength(60)]],
  });

  constructor() {
    void this.loadTeams();
  }

  protected async selectTeam(): Promise<void> {
    const teamId = this.form.controls.teamId.value;
    this.players.set([]);
    this.squadIds.set(new Set());
    this.lineupIds.set(new Set());
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
    const lineup = new Set(this.lineupIds());
    if (squad.has(playerId)) {
      squad.delete(playerId);
      lineup.delete(playerId);
    } else {
      squad.add(playerId);
    }
    this.squadIds.set(squad);
    this.lineupIds.set(lineup);
  }

  protected toggleLineup(playerId: string): void {
    if (!this.squadIds().has(playerId)) {
      return;
    }
    const lineup = new Set(this.lineupIds());
    if (lineup.has(playerId)) {
      lineup.delete(playerId);
    } else if (lineup.size < STARTING_LINEUP_SIZE) {
      lineup.add(playerId);
    }
    this.lineupIds.set(lineup);
  }

  protected isSelected(playerId: string): boolean {
    return this.squadIds().has(playerId);
  }

  protected isStarter(playerId: string): boolean {
    return this.lineupIds().has(playerId);
  }

  protected canSave(): boolean {
    return this.form.valid && this.selectedCount() >= 5 && this.lineupCount() === 5;
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.form.markAllAsTouched();
    if (!this.canSave()) {
      this.error.set('Completa los datos, convoca al menos 5 jugadores y elige 5 titulares.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.setup.createMatch({
        ...this.form.getRawValue(),
        squadPlayerIds: [...this.squadIds()],
        startingLineupPlayerIds: [...this.lineupIds()],
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
      this.teams.set(await this.setup.listTeams());
    } catch {
      this.loadFailed.set(true);
    }
  }
}
