import { inject, Injectable } from '@angular/core';
import { SupabaseClientService } from '../../cloud/supabase-client.service';
import { Player } from '../../../shared/models/player';
import { PlayerRepository } from '../ports/player.repository';
import { playerFromCloud, playerToCloud } from './cloud-record-mappers';

@Injectable()
export class SupabasePlayerRepository implements PlayerRepository {
  private readonly client = inject(SupabaseClientService).requireClient();

  async listActiveByTeam(teamId: string): Promise<Player[]> {
    return (await this.listByTeam(teamId)).filter((player) => player.active);
  }

  async listByTeam(teamId: string): Promise<Player[]> {
    const { data, error } = await this.client
      .from('players')
      .select('*')
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .order('number');
    if (error) throw error;
    return (data ?? []).map(playerFromCloud);
  }

  async countActiveByTeamIds(teamIds: readonly string[]): Promise<Map<string, number>> {
    if (teamIds.length === 0) return new Map();
    const { data, error } = await this.client
      .from('players')
      .select('team_id')
      .in('team_id', [...teamIds])
      .eq('active', true)
      .is('deleted_at', null);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const row of data ?? []) counts.set(row.team_id, (counts.get(row.team_id) ?? 0) + 1);
    return counts;
  }

  async listByIds(playerIds: readonly string[]): Promise<Player[]> {
    if (playerIds.length === 0) return [];
    const { data, error } = await this.client
      .from('players')
      .select('*')
      .in('id', [...playerIds])
      .is('deleted_at', null);
    if (error) throw error;
    return (data ?? []).map(playerFromCloud);
  }

  async put(player: Player): Promise<string> {
    const { error } = await this.client.rpc('upsert_player', { p_player: playerToCloud(player) });
    if (error) throw error;
    return player.id;
  }
}
