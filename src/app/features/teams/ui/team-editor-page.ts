import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TEAM_NAME_MAX_LENGTH, TEAM_SHORT_NAME_MAX_LENGTH } from '../domain/roster';
import { TeamsService } from '../application/teams.service';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { PwaUpdateService } from '../../../core/update/pwa-update.service';
import { PwaUpdateState } from '../../../core/update/pwa-update.models';
import { StoragePersistenceService } from '../../../core/storage/storage-persistence.service';

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
  protected readonly updates = inject(PwaUpdateService);
  protected readonly storage = inject(StoragePersistenceService);

  readonly teamId = input<string>();
  readonly workspaceMode = input(false);
  private readonly resolvedTeamId = computed(
    () => this.teamId() ?? (this.workspaceMode() ? this.workspace?.activeTeamId() : null) ?? '',
  );

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly missing = signal(false);
  protected readonly recoveryKey = signal<string | null>(null);
  protected readonly recoverySaved = signal(false);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(TEAM_NAME_MAX_LENGTH)]],
    shortName: ['', [Validators.maxLength(TEAM_SHORT_NAME_MAX_LENGTH)]],
  });

  constructor() {
    void this.storage.refresh();
    effect(() => {
      const id = this.resolvedTeamId();
      if (!id) {
        return;
      }
      void this.load(id);
    });
  }

  protected storageEstimate(): string {
    const estimate = this.storage.estimate();
    if (!estimate?.quota) return 'No disponible';
    return `${megabytes(estimate.usage)} MB usados de ${megabytes(estimate.quota)} MB`;
  }

  protected isEdit(): boolean {
    return Boolean(this.resolvedTeamId());
  }

  protected updateStatus(state: PwaUpdateState): string {
    if (!this.updates.isEnabled) {
      return 'Las actualizaciones PWA solo están disponibles en producción.';
    }
    switch (state.status) {
      case 'checking':
        return 'Buscando actualizaciones…';
      case 'available':
        return 'Nueva versión disponible.';
      case 'deferred':
        return 'Actualización pendiente hasta finalizar el partido.';
      case 'updating':
        return 'Aplicando actualización…';
      case 'error':
        return state.error ?? 'No se pudo comprobar.';
      case 'idle':
        return state.lastCheckOutcome === 'up-to-date'
          ? 'Ya tienes la última versión.'
          : 'Actualizado.';
    }
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
      const key = this.teams.createdRecoveryKey();
      if (!this.isEdit() && key) {
        this.recoveryKey.set(key);
        return;
      }
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

  protected async finishCreation(): Promise<void> {
    if (!this.recoverySaved()) return;
    this.recoveryKey.set(null);
    await this.router.navigate(['/dashboard']);
  }

  protected async copyRecoveryKey(key: string): Promise<void> {
    try {
      await globalThis.navigator.clipboard.writeText(key);
    } catch {
      this.error.set('Selecciona y copia la clave manualmente.');
    }
  }
}

function megabytes(bytes: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
}
