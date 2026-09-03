import { Player } from '../../../shared/models/player';

export interface PlayerRepository {
  listActiveByTeam(teamId: string): Promise<Player[]>;
  countActiveByTeamIds(teamIds: readonly string[]): Promise<Map<string, number>>;
  listByIds(playerIds: readonly string[]): Promise<Player[]>;
  put(player: Player): Promise<string>;
}
