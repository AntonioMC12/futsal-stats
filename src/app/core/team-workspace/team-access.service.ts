import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

@Injectable({ providedIn: 'root' })
export class TeamAccessService {
  private readonly config = inject(CLOUD_CONFIG);
  private readonly supabase = inject(SupabaseClientService);
  private readonly auth = inject(AuthService);
  private loadedScope: string | null = null;
  readonly role = signal<WorkspaceRole>(this.config.mode === 'local' ? 'owner' : 'viewer');
  readonly canWrite = signal(this.config.mode === 'local');

  async load(teamId: string): Promise<void> {
    if (this.config.mode === 'local') {
      this.role.set('owner');
      this.canWrite.set(true);
      return;
    }

    await this.auth.initialize();
    const userId = this.auth.user()?.id;
    const scope = userId ? `${userId}:${teamId}` : null;
    if (scope && this.loadedScope === scope) return;
    this.loadedScope = scope;

    if (!userId) {
      this.applyRole('viewer');
      return;
    }

    try {
      const { data, error } = await this.supabase
        .requireClient()
        .rpc('get_my_team_role', { p_team_id: teamId });
      if (error) throw error;
      const role: WorkspaceRole = data === 'owner' || data === 'editor' ? data : 'viewer';
      this.applyRole(role);
      writeCachedRole(userId, teamId, role);
    } catch {
      this.applyRole(readCachedRole(userId, teamId) ?? 'viewer');
    }
  }

  async assertCanWrite(teamId: string): Promise<void> {
    await this.load(teamId);
    if (!this.canWrite()) {
      throw new Error('No tienes permisos para modificar este equipo.');
    }
  }

  assumeCreatedTeam(teamId: string): void {
    if (this.config.mode === 'local') return;
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.loadedScope = `${userId}:${teamId}`;
    this.applyRole('owner');
    writeCachedRole(userId, teamId, 'owner');
  }

  reset(): void {
    this.loadedScope = null;
    this.applyRole(this.config.mode === 'local' ? 'owner' : 'viewer');
  }

  private applyRole(role: WorkspaceRole): void {
    this.role.set(role);
    this.canWrite.set(role !== 'viewer');
  }
}

function roleStorageKey(userId: string, teamId: string): string {
  return `futsal-stats.team-role.${userId}.${teamId}`;
}

function readCachedRole(userId: string, teamId: string): WorkspaceRole | null {
  try {
    const role = globalThis.localStorage?.getItem(roleStorageKey(userId, teamId));
    return role === 'owner' || role === 'editor' || role === 'viewer' ? role : null;
  } catch {
    return null;
  }
}

function writeCachedRole(userId: string, teamId: string, role: WorkspaceRole): void {
  try {
    globalThis.localStorage?.setItem(roleStorageKey(userId, teamId), role);
  } catch {
    // RLS remains authoritative when browser storage is unavailable.
  }
}
