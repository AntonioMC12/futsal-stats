import { PlayerProfile } from '../../../shared/models/player-profile';

export interface PlayerProfileRepository {
  get(playerId: string): Promise<PlayerProfile | undefined>;
  listByTeam(teamId: string): Promise<PlayerProfile[]>;
  put(profile: PlayerProfile): Promise<string>;
}
