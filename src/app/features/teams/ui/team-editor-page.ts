import { Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  TEAM_NAME_MAX_LENGTH,
  TEAM_SHORT_NAME_MAX_LENGTH,
} from '../domain/roster';
import { TeamsService } from '../application/teams.service';

@Component({
  selector: 'app-team-editor-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './team-editor-page.html',
  styleUrl: './team-editor-page.scss',
})
export class TeamEditorPage {
  private readonly teams = inject(TeamsService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly teamId = input<string>();

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly missing = signal(false);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(TEAM_NAME_MAX_LENGTH)]],
    shortName: ['', [Validators.maxLength(TEAM_SHORT_NAME_MAX_LENGTH)]],
  });

  constructor() {
    effect(() => {
      const id = this.teamId();
      if (!id) {
        return;
      }
      void this.load(id);
    });
  }

  protected isEdit(): boolean {
    return Boolean(this.teamId());
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const input = this.form.getRawValue();
      const result = this.isEdit()
        ? await this.teams.updateTeam(this.teamId() ?? '', input)
        : await this.teams.createTeam(input);

      if (!result.ok) {
        this.error.set(result.error);
        return;
      }

      await this.router.navigate(['/teams', result.value.id]);
    } catch {
      this.error.set('No se ha podido guardar el equipo.');
    } finally {
      this.saving.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    const team = await this.teams.getTeam(id);
    if (!team) {
      this.missing.set(true);
      return;
    }
    this.form.setValue({ name: team.name, shortName: team.shortName });
  }
}
