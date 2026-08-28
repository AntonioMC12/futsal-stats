import { inject, Injectable } from '@angular/core';
import { Team } from '../../shared/models/team';
import { FutsalStatsDb } from './futsal-stats.db';

@Injectable({ providedIn: 'root' })
export class TeamRepository {
  private readonly db = inject(FutsalStatsDb);

  list(): Promise<Team[]> {
    return this.db.teams.orderBy('name').toArray();
  }

  get(id: string): Promise<Team | undefined> {
    return this.db.teams.get(id);
  }

  put(team: Team): Promise<string> {
    return this.db.teams.put(team);
  }
}
