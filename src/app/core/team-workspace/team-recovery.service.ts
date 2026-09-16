import { inject, Injectable } from '@angular/core';
import { SupabaseClientService } from '../cloud/supabase-client.service';
import { teamToCloud } from '../persistence/cloud/cloud-record-mappers';
import { Team } from '../../shared/models/team';
import { AuthService } from '../auth/auth.service';
import { OfflineSyncService } from '../sync/offline-sync.service';

@Injectable({ providedIn: 'root' })
export class TeamRecoveryService {
  private readonly client = inject(SupabaseClientService);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(OfflineSyncService, { optional: true });

  async createTeam(team: Team): Promise<string> {
    await this.auth.ensureValidDeviceIdentity();
    await this.sync?.isolateOrphanedIdentity();
    const { data, error } = await this.client.requireClient().rpc('create_team_with_recovery_key', {
      p_team: teamToCloud(team),
    });
    if (error) throw error;
    const key = (data as { recovery_key: string }[] | null)?.[0]?.recovery_key;
    if (!key) throw new Error('El servidor no ha devuelto la clave de recuperación.');
    this.auth.markAccessRestored();
    return formatRecoveryKey(key);
  }

  async hasKey(teamId: string): Promise<boolean> {
    const { data, error } = await this.client.requireClient().rpc('has_team_recovery_key', {
      p_team_id: teamId,
    });
    if (error) throw error;
    return data === true;
  }

  async rotate(teamId: string): Promise<string> {
    const { data, error } = await this.client.requireClient().rpc('rotate_team_recovery_key', {
      p_team_id: teamId,
    });
    if (error) throw error;
    if (typeof data !== 'string') throw new Error('El servidor no ha devuelto la nueva clave.');
    return formatRecoveryKey(data);
  }

  async recover(key: string, deviceName: string): Promise<string> {
    const { data, error } = await this.client.requireClient().rpc('recover_team_access', {
      p_recovery_key: key,
      p_device_name: deviceName.trim() || null,
    });
    if (error) throw new Error('No se ha podido recuperar el equipo. Inténtalo más tarde.');
    const teamId = (data as { team_id: string }[] | null)?.[0]?.team_id;
    if (!teamId)
      throw new Error(
        'Clave no válida o demasiados intentos. Espera 15 minutos si has probado varias veces.',
      );
    return teamId;
  }
}

export function formatRecoveryKey(value: string): string {
  return `FS-${
    value
      .toUpperCase()
      .match(/.{1,8}/g)
      ?.join('-') ?? value
  }`;
}
