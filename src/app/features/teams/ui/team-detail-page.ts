import { Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import { PLAYER_NAME_MAX_LENGTH } from '../domain/roster';
import { TeamsService } from '../application/teams.service';

@Component({
  selector: 'app-team-detail-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './team-detail-page.html',
  styleUrl: './team-detail-page.scss',
})
export class TeamDetailPage {
  private readonly teams = inject(TeamsService);
  private readonly formBuilder = inject(FormBuilder);

  readonly teamId = input.required<string>();

  protected readonly team = signal<Team | null>(null);
  protected readonly roster = signal<Player[]>([]);
  protected readonly selectedPlayerId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly missing = signal(false);
  protected readonly saving = signal(false);

  protected readonly playerForm = this.formBuilder.nonNullable.group({
    number: ['', [Validators.required, Validators.pattern(/^\d{1,2}$/)]],
    name: ['', [Validators.required, Validators.maxLength(PLAYER_NAME_MAX_LENGTH)]],
    position: [''],
  });

  constructor() {
    effect(() => {
      void this.load(this.teamId());
    });
  }

  protected editing(): boolean {
    return this.selectedPlayerId() !== null;
  }

  protected selectPlayer(player: Player): void {
    this.selectedPlayerId.set(player.id);
    this.error.set(null);
    this.playerForm.setValue({
      number: String(player.number),
      name: player.name,
      position: player.position ?? '',
    });
  }

  protected cancelEdit(): void {
    this.selectedPlayerId.set(null);
    this.error.set(null);
    this.playerForm.reset({ number: '', name: '', position: '' });
  }

  protected async savePlayer(): Promise<void> {
    if (this.saving()) {
      return;
    }

    const teamId = this.teamId();
    const values = this.playerForm.getRawValue();
    this.saving.set(true);
    this.error.set(null);

    try {
      const payload = {
        teamId,
        number: values.number,
        name: values.name,
        position: values.position,
      };
      const selectedId = this.selectedPlayerId();
      const result = selectedId
        ? await this.teams.updatePlayer(selectedId, payload)
        : await this.teams.addPlayer(payload);

      if (!result.ok) {
        this.error.set(result.error);
        return;
      }

      this.cancelEdit();
      await this.load(teamId);
    } catch {
      this.error.set('No se ha podido guardar el jugador.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async removePlayer(): Promise<void> {
    const playerId = this.selectedPlayerId();
    if (!playerId || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.teams.removePlayer(this.teamId(), playerId);
      if (!result.ok) {
        this.error.set(result.error);
        return;
      }

      this.cancelEdit();
      await this.load(this.teamId());
    } catch {
      this.error.set('No se ha podido quitar el jugador.');
    } finally {
      this.saving.set(false);
    }
  }

  private async load(teamId: string): Promise<void> {
    try {
      const team = await this.teams.getTeam(teamId);
      if (!team) {
        this.missing.set(true);
        return;
      }
      this.team.set(team);
      this.roster.set(await this.teams.listRoster(teamId));
    } catch {
      this.loadFailed.set(true);
    }
  }
}
