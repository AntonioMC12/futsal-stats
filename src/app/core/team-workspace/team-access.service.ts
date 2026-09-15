import { inject, Injectable, signal } from '@angular/core';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

@Injectable({ providedIn: 'root' })
export class TeamAccessService {
  private readonly config = inject(CLOUD_CONFIG);
  private readonly supabase = inject(SupabaseClientService);
  private loadedTeamId: string | null = null;
  readonly role = signal<WorkspaceRole>(this.config.mode === 'local' ? 'owner' : 'viewer');
  readonly canWrite = signal(this.config.mode === 'local');

  async load(teamId: string): Promise<void> {
    if (this.loadedTeamId === teamId) return;
    this.loadedTeamId = teamId;
    if (this.config.mode === 'local') {
      this.role.set('owner');
      this.canWrite.set(true);
      return;
    }
    try {
      const { data, error } = await this.supabase
        .requireClient()
        .rpc('get_my_team_role', { p_team_id: teamId });
      if (error) throw error;
      const role: WorkspaceRole = data === 'owner' || data === 'editor' ? data : 'viewer';
      this.role.set(role);
      this.canWrite.set(role !== 'viewer');
    } catch {
      this.role.set('viewer');
      this.canWrite.set(false);
    }
  }
}
