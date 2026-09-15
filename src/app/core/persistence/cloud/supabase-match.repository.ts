import { inject, Injectable } from '@angular/core';
import { ACTIVE_MATCH_STATUSES, Match } from '../../../shared/models/match';
import { SupabaseClientService } from '../../cloud/supabase-client.service';
import { MatchRepository } from '../ports/match.repository';
import { matchFromCloud, matchToCloud } from './cloud-record-mappers';

const MATCH_SELECT = '*, match_players(player_id,in_squad,is_starter)';

@Injectable()
export class SupabaseMatchRepository implements MatchRepository {
  private readonly client = inject(SupabaseClientService).requireClient();

  async findActive(): Promise<Match | null> {
    const { data, error } = await this.client
      .from('matches')
      .select(MATCH_SELECT)
      .in('status', [...ACTIVE_MATCH_STATUSES])
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? matchFromCloud(data) : null;
  }

  async list(): Promise<Match[]> {
    return this.query();
  }

  async listByTeam(teamId: string): Promise<Match[]> {
    return this.query(teamId);
  }

  async get(id: string): Promise<Match | undefined> {
    const { data, error } = await this.client
      .from('matches')
      .select(MATCH_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? matchFromCloud(data) : undefined;
  }

  async put(match: Match): Promise<string> {
    const { error } = await this.client.rpc('upsert_match_snapshot', {
      p_match: matchToCloud(match),
      p_only_if_no_active: false,
    });
    if (error) throw error;
    return match.id;
  }

  async addIfNoActive(match: Match): Promise<boolean> {
    const { data, error } = await this.client.rpc('upsert_match_snapshot', {
      p_match: matchToCloud(match),
      p_only_if_no_active: true,
    });
    if (error) throw error;
    return data === true;
  }

  async delete(matchId: string): Promise<void> {
    const { error } = await this.client.rpc('delete_match_workspace', { p_match_id: matchId });
    if (error) throw error;
  }

  private async query(teamId?: string): Promise<Match[]> {
    let query = this.client.from('matches').select(MATCH_SELECT).is('deleted_at', null);
    if (teamId) query = query.eq('team_id', teamId);
    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(matchFromCloud);
  }
}
