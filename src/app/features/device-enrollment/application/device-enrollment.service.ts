import { inject, Injectable } from '@angular/core';
import { SupabaseClientService } from '../../../core/cloud/supabase-client.service';

export type TeamRole = 'owner' | 'editor' | 'viewer';

export interface TeamDevice {
  authUserId: string;
  role: TeamRole;
  deviceName: string;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export interface TeamInvitation {
  id: string;
  token: string;
  expiresAt: string;
  role: TeamRole;
}

export interface EnrollmentResult {
  teamId: string;
  teamName: string;
  role: TeamRole;
}

@Injectable({ providedIn: 'root' })
export class DeviceEnrollmentService {
  private readonly supabase = inject(SupabaseClientService);

  async listDevices(teamId: string): Promise<TeamDevice[]> {
    const { data, error } = await this.supabase.requireClient().rpc('list_team_devices', {
      p_team_id: teamId,
    });
    if (error) throw enrollmentError(error);
    return ((data ?? []) as DeviceRow[]).map((row) => ({
      authUserId: row.auth_user_id,
      role: row.role,
      deviceName: row.device_name ?? '',
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      isCurrent: row.is_current,
    }));
  }

  async createInvitation(
    teamId: string,
    role: TeamRole,
    ttlMinutes: number,
  ): Promise<TeamInvitation> {
    const { data, error } = await this.supabase.requireClient().rpc('create_team_invite', {
      p_team_id: teamId,
      p_role: role,
      p_ttl_minutes: ttlMinutes,
    });
    if (error) throw enrollmentError(error);
    const row = (data as InvitationRow[] | null)?.[0];
    if (!row) throw new Error('El servidor no ha devuelto la invitación.');
    return { id: row.invite_id, token: row.token, expiresAt: row.expires_at, role: row.role };
  }

  async consumeInvitation(token: string, deviceName: string): Promise<EnrollmentResult> {
    const { data, error } = await this.supabase.requireClient().rpc('consume_team_invite', {
      p_token: normalizeInviteCode(token),
      p_device_name: deviceName.trim() || null,
    });
    if (error) throw enrollmentError(error);
    const row = (data as EnrollmentRow[] | null)?.[0];
    if (!row) throw new Error('No se ha podido completar la incorporación.');
    return { teamId: row.team_id, teamName: row.team_name, role: row.role };
  }

  async updateDevice(
    teamId: string,
    authUserId: string,
    role: TeamRole,
    deviceName: string,
  ): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('update_team_device', {
      p_team_id: teamId,
      p_auth_user_id: authUserId,
      p_role: role,
      p_device_name: deviceName.trim() || null,
    });
    if (error) throw enrollmentError(error);
  }

  async revokeDevice(teamId: string, authUserId: string): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('revoke_team_device', {
      p_team_id: teamId,
      p_auth_user_id: authUserId,
    });
    if (error) throw enrollmentError(error);
  }
}

export function normalizeInviteCode(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-f]/g, '');
}

export function formatInviteCode(value: string): string {
  return normalizeInviteCode(value)
    .toUpperCase()
    .replace(/(.{6})(?=.)/g, '$1-');
}

function enrollmentError(error: { message?: string }): Error {
  const message = error.message ?? '';
  if (/invalid, expired or already used/i.test(message)) {
    return new Error('La invitación no es válida, ha caducado o ya se ha usado.');
  }
  if (/already belongs/i.test(message))
    return new Error('Este dispositivo ya pertenece al equipo.');
  if (/at least one owner|last owner/i.test(message)) {
    return new Error('El equipo debe conservar al menos un dispositivo OWNER.');
  }
  if (/only an owner/i.test(message)) {
    return new Error('Solo un dispositivo OWNER puede gestionar accesos.');
  }
  return new Error(message || 'No se ha podido completar la operación de acceso.');
}

interface DeviceRow {
  auth_user_id: string;
  role: TeamRole;
  device_name: string | null;
  created_at: string;
  last_seen_at: string;
  is_current: boolean;
}

interface InvitationRow {
  invite_id: string;
  token: string;
  expires_at: string;
  role: TeamRole;
}

interface EnrollmentRow {
  team_id: string;
  team_name: string;
  role: TeamRole;
}
