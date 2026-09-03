import { Team } from '../../../shared/models/team';

export interface TeamRepository {
  list(): Promise<Team[]>;
  get(id: string): Promise<Team | undefined>;
  put(team: Team): Promise<string>;
}
