import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { CLOUD_CONFIG } from '../../../core/cloud/cloud.config';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import {
  DeviceEnrollmentService,
  formatInviteCode,
  TeamDevice,
  TeamInvitation,
  TeamRole,
} from '../application/device-enrollment.service';

@Component({
  selector: 'app-devices-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './devices-page.html',
  styleUrl: './devices-page.scss',
})
export class DevicesPage {
  private readonly enrollment = inject(DeviceEnrollmentService);
  private readonly workspace = inject(TeamWorkspaceContext);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly cloudConfig = inject(CLOUD_CONFIG);

  protected readonly devices = signal<readonly TeamDevice[]>([]);
  protected readonly loading = signal(false);
  protected readonly busyUserId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly invitation = signal<TeamInvitation | null>(null);
  protected readonly qrDataUrl = signal<string | null>(null);
  protected readonly activeTeam = this.workspace.activeTeam;
  protected readonly invitationCode = computed(() => {
    const token = this.invitation()?.token;
    return token ? formatInviteCode(token) : '';
  });
  protected readonly invitationUrl = computed(() => {
    const token = this.invitation()?.token;
    if (!token) return '';
    return new URL(
      `/join?code=${encodeURIComponent(token)}`,
      globalThis.location?.origin ?? 'http://localhost',
    ).href;
  });

  protected readonly inviteForm = this.formBuilder.nonNullable.group({
    role: 'editor' as TeamRole,
    ttlMinutes: 15,
  });

  constructor() {
    if (this.cloudConfig.mode === 'cloud') void this.loadDevices();
  }

  protected asRole(value: string): TeamRole {
    return value === 'owner' || value === 'viewer' ? value : 'editor';
  }

  protected roleLabel(role: TeamRole): string {
    return role.toUpperCase();
  }

  protected async createInvitation(): Promise<void> {
    const teamId = this.activeTeam()?.id;
    if (!teamId || this.loading()) return;
    this.startOperation();
    try {
      const { role, ttlMinutes } = this.inviteForm.getRawValue();
      const invitation = await this.enrollment.createInvitation(teamId, role, Number(ttlMinutes));
      this.invitation.set(invitation);
      const qr = await QRCode.toDataURL(this.invitationUrl(), {
        width: 280,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      this.qrDataUrl.set(qr);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected closeInvitation(): void {
    this.invitation.set(null);
    this.qrDataUrl.set(null);
  }

  protected async copyCode(): Promise<void> {
    try {
      await globalThis.navigator.clipboard.writeText(this.invitationCode());
      this.notice.set('Código copiado.');
    } catch {
      this.error.set('No se ha podido copiar. Selecciona el código manualmente.');
    }
  }

  protected async saveDevice(device: TeamDevice, name: string, roleValue: string): Promise<void> {
    const teamId = this.activeTeam()?.id;
    if (!teamId || this.busyUserId()) return;
    this.busyUserId.set(device.authUserId);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.enrollment.updateDevice(teamId, device.authUserId, this.asRole(roleValue), name);
      await this.loadDevices();
      this.notice.set('Dispositivo actualizado.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busyUserId.set(null);
    }
  }

  protected async revokeDevice(device: TeamDevice): Promise<void> {
    const teamId = this.activeTeam()?.id;
    if (!teamId || this.busyUserId()) return;
    const label = device.deviceName || 'este dispositivo';
    if (!globalThis.confirm(`¿Revocar el acceso de ${label}? El cambio es inmediato.`)) return;
    this.busyUserId.set(device.authUserId);
    this.error.set(null);
    try {
      await this.enrollment.revokeDevice(teamId, device.authUserId);
      await this.workspace.refresh();
      if (this.workspace.activeTeamId() === teamId) await this.loadDevices();
      this.notice.set('Acceso revocado.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busyUserId.set(null);
    }
  }

  private async loadDevices(): Promise<void> {
    const teamId = this.activeTeam()?.id;
    if (!teamId) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.devices.set(await this.enrollment.listDevices(teamId));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private startOperation(): void {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.closeInvitation();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se ha podido completar la operación.';
}
