import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';

export interface MatchEventRepository {
  listByMatch(matchId: string): Promise<MatchEvent[]>;
  commit(match: Match, events: readonly MatchEvent[]): Promise<void>;
}
