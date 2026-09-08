import { inject, Injectable } from '@angular/core';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { SupabaseClientService } from '../../cloud/supabase-client.service';
import { MatchEventRepository } from '../ports/match-event.repository';
import { eventFromCloud, eventToCloud, matchToCloud } from './cloud-record-mappers';

@Injectable()
export class SupabaseMatchEventRepository implements MatchEventRepository {
  private readonly client = inject(SupabaseClientService).requireClient();

  async listByMatch(matchId: string): Promise<MatchEvent[]> {
    const { data, error } = await this.client
      .from('match_events')
      .select('*, match_event_lineup_players(player_id,position)')
      .eq('match_id', matchId)
      .is('deleted_at', null)
      .order('sequence');
    if (error) throw error;
    return (data ?? []).map(eventFromCloud);
  }

  async commit(match: Match, events: readonly MatchEvent[]): Promise<void> {
    const { error } = await this.client.rpc('commit_match_events', {
      p_match: matchToCloud(match),
      p_events: events.map(eventToCloud),
    });
    if (error) throw error;
  }
}
