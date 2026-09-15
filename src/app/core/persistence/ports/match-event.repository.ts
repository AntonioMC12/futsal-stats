import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';

export interface MatchEventRepository {
  listByMatch(matchId: string): Promise<MatchEvent[]>;
  commit(match: Match, events: readonly MatchEvent[]): Promise<void>;
  updateEvent(match: Match, event: MatchEvent): Promise<void>;
  importMatch(
    match: Match,
    events: readonly MatchEvent[],
    newPlayers: readonly Player[],
  ): Promise<void>;
}
