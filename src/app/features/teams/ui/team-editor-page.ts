import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TEAM_NAME_MAX_LENGTH, TEAM_SHORT_NAME_MAX_LENGTH } from '../domain/roster';
import { TeamsService } from '../application/teams.service';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';

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
  private readonly workspace = inject(TeamWorkspaceContext, { optional: true });

  readonly teamId = input<string>();
  readonly workspaceMode = input(false);
  private readonly resolvedTeamId = computed(
    () => this.teamId() ?? (this.workspaceMode() ? this.workspace?.activeTeamId() : null) ?? '',
  );

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly missing = signal(false);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(TEAM_NAME_MAX_LENGTH)]],
    shortName: ['', [Validators.maxLength(TEAM_SHORT_NAME_MAX_LENGTH)]],
  });

  constructor() {
    effect(() => {
      const id = this.resolvedTeamId();
      if (!id) {
        return;
      }
      void this.load(id);
    });
  }

  protected isEdit(): boolean {
    return Boolean(this.resolvedTeamId());
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
        ? await this.teams.updateTeam(this.resolvedTeamId(), input)
        : await this.teams.createTeam(input);

      if (!result.ok) {
        this.error.set(result.error);
        return;
      }

      await this.workspace?.refresh(result.value.id);
      await this.router.navigate(
        this.workspaceMode() ? ['/dashboard'] : ['/teams', result.value.id],
      );
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
