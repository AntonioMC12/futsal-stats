import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CLOUD_CONFIG } from '../../../core/cloud/cloud.config';
import { CloudFoundationService } from '../../../core/cloud/cloud-foundation.service';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { DeviceEnrollmentService } from '../application/device-enrollment.service';
import { TeamAccessService } from '../../../core/team-workspace/team-access.service';
import { OfflineSyncService } from '../../../core/sync/offline-sync.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-join-team-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './join-team-page.html',
  styleUrl: './join-team-page.scss',
})
export class JoinTeamPage {
  private readonly enrollment = inject(DeviceEnrollmentService);
  private readonly workspace = inject(TeamWorkspaceContext);
  private readonly cloud = inject(CloudFoundationService);
  private readonly access = inject(TeamAccessService);
  private readonly sync = inject(OfflineSyncService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly cloudConfig = inject(CLOUD_CONFIG);
  protected readonly joining = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required]],
    deviceName: ['', [Validators.maxLength(80)]],
  });

  constructor() {
    const code = inject(ActivatedRoute).snapshot.queryParamMap.get('code');
    if (code) this.form.controls.code.setValue(code);
  }

  protected async join(): Promise<void> {
    if (this.form.invalid || this.joining() || this.cloudConfig.mode !== 'cloud') {
      this.form.markAllAsTouched();
      return;
    }
    this.joining.set(true);
    this.error.set(null);
    try {
      if (this.cloud.status() !== 'connected') await this.cloud.initialize();
      if (this.cloud.status() !== 'connected')
        throw new Error('No hay conexión con el servicio cloud.');
      const value = this.form.getRawValue();
      const result = await this.enrollment.consumeInvitation(value.code, value.deviceName);
      this.auth.markAccessRestored();
      this.access.invalidate();
      await this.sync.refreshAfterAccessChange();
      await this.workspace.refresh(result.teamId);
      if (!(await this.workspace.selectTeam(result.teamId))) {
        throw new Error('Acceso concedido. Vuelve a conectarte para descargar el equipo.');
      }
      await this.router.navigate(['/dashboard']);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'No se ha podido unir el dispositivo.',
      );
    } finally {
      this.joining.set(false);
    }
  }
}
