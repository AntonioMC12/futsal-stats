import { inject, Injectable } from '@angular/core';
import { Team } from '../../../shared/models/team';
import { TeamRepository } from '../ports/team.repository';
import { FutsalStatsDb } from './futsal-stats.db';
import { fromLocalTeamRecord, toLocalTeamRecord } from './local-record-mappers';

@Injectable()
export class DexieTeamRepository implements TeamRepository {
  private readonly db = inject(FutsalStatsDb);

  async list(): Promise<Team[]> {
    return (await this.db.teams.orderBy('name').toArray()).map(fromLocalTeamRecord);
  }

  async get(id: string): Promise<Team | undefined> {
    const record = await this.db.teams.get(id);
    return record ? fromLocalTeamRecord(record) : undefined;
  }

  async put(team: Team): Promise<string> {
    return this.db.transaction('rw', this.db.teams, async () => {
      const previous = await this.db.teams.get(team.id);
      return this.db.teams.put(toLocalTeamRecord(team, previous));
    });
  }
}
