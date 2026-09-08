import { inject, Injectable } from '@angular/core';
import { SupabaseClientService } from '../../cloud/supabase-client.service';
import { Team } from '../../../shared/models/team';
import { TeamRepository } from '../ports/team.repository';
import { teamFromCloud, teamToCloud } from './cloud-record-mappers';

@Injectable()
export class SupabaseTeamRepository implements TeamRepository {
  private readonly client = inject(SupabaseClientService).requireClient();

  async list(): Promise<Team[]> {
    const { data, error } = await this.client
      .from('teams')
      .select('*')
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return (data ?? []).map(teamFromCloud);
  }

  async get(id: string): Promise<Team | undefined> {
    const { data, error } = await this.client
      .from('teams')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? teamFromCloud(data) : undefined;
  }

  async put(team: Team): Promise<string> {
    const { error } = await this.client.rpc('upsert_team_workspace', { p_team: teamToCloud(team) });
    if (error) throw error;
    return team.id;
  }
}
