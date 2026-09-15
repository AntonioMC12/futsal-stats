import { inject, Injectable } from '@angular/core';
import { PlayerProfile } from '../../../shared/models/player-profile';
import { SupabaseClientService } from '../../cloud/supabase-client.service';
import { PlayerProfileRepository } from '../ports/player-profile.repository';
import { playerProfileFromCloud, playerProfileToCloud } from './cloud-record-mappers';

@Injectable()
export class SupabasePlayerProfileRepository implements PlayerProfileRepository {
  private readonly client = inject(SupabaseClientService).requireClient();

  async get(playerId: string): Promise<PlayerProfile | undefined> {
    const { data, error } = await this.client
      .from('player_profiles')
      .select('*')
      .eq('player_id', playerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data ? playerProfileFromCloud(data) : undefined;
  }

  async listByTeam(teamId: string): Promise<PlayerProfile[]> {
    const { data, error } = await this.client
      .from('player_profiles')
      .select('*')
      .eq('team_id', teamId)
      .is('deleted_at', null);
    if (error) throw error;
    return (data ?? []).map(playerProfileFromCloud);
  }

  async put(profile: PlayerProfile): Promise<string> {
    const { error } = await this.client.rpc('upsert_player_profile', {
      p_profile: playerProfileToCloud(profile),
    });
    if (error) throw error;
    return profile.playerId;
  }
}
