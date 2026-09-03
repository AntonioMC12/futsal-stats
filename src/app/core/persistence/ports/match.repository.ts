import { Match } from '../../../shared/models/match';

export interface MatchRepository {
  findActive(): Promise<Match | null>;
  list(): Promise<Match[]>;
  get(id: string): Promise<Match | undefined>;
  put(match: Match): Promise<string>;
  addIfNoActive(match: Match): Promise<boolean>;
  delete(matchId: string): Promise<void>;
}
