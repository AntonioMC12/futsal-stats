import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CLOUD_CONFIG } from '../../../core/cloud/cloud.config';
import { CloudFoundationService } from '../../../core/cloud/cloud-foundation.service';
import { OfflineSyncService } from '../../../core/sync/offline-sync.service';
import { TeamAccessService } from '../../../core/team-workspace/team-access.service';
import { TeamRecoveryService } from '../../../core/team-workspace/team-recovery.service';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';

@Component({
  selector: 'app-team-access-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './team-access-page.html',
  styleUrl: './team-access-page.scss',
})
export class TeamAccessPage {
  protected readonly auth = inject(AuthService);
  protected readonly config = inject(CLOUD_CONFIG);
  private readonly cloud = inject(CloudFoundationService);
  private readonly sync = inject(OfflineSyncService);
  private readonly access = inject(TeamAccessService);
  private readonly recovery = inject(TeamRecoveryService);
  private readonly workspace = inject(TeamWorkspaceContext);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    key: ['', Validators.required],
    deviceName: ['', Validators.maxLength(80)],
  });

  constructor() {
    void this.auth.initialize();
  }

  protected async retry(): Promise<void> {
    await this.auth.retry();
    if (this.auth.authenticated()) {
      await this.cloud.initialize();
      await this.sync.initialize();
      await this.workspace.refresh();
    }
  }

  protected async recover(): Promise<void> {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.initialize();
      if (!this.auth.authenticated()) throw new Error('Este dispositivo no tiene conexión.');
      const { key, deviceName } = this.form.getRawValue();
      const teamId = await this.recovery.recover(key, deviceName);
      this.form.controls.key.setValue('');
      this.access.invalidate();
      await this.sync.refreshAfterAccessChange();
      await this.workspace.refresh(teamId);
      if (!(await this.workspace.selectTeam(teamId))) {
        throw new Error('Acceso recuperado. Vuelve a conectarte para descargar el equipo.');
      }
      await this.router.navigate(['/dashboard']);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'No se ha podido recuperar el equipo.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
