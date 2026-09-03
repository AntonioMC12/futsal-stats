import { inject, Injectable } from '@angular/core';
import { ACTIVE_MATCH_STATUSES, isMatchActive, Match } from '../../../shared/models/match';
import { MatchRepository } from '../ports/match.repository';
import { FutsalStatsDb } from './futsal-stats.db';
import { fromLocalMatchRecord, toLocalMatchRecord } from './local-record-mappers';
import { assertMatchReferences } from './local-reference-validation';

@Injectable()
export class DexieMatchRepository implements MatchRepository {
  private readonly db = inject(FutsalStatsDb);

  async findActive(): Promise<Match | null> {
    const matches = (await this.db.matches.orderBy('updatedAt').reverse().toArray()).map(
      fromLocalMatchRecord,
    );
    return matches.find(isMatchActive) ?? null;
  }

  async list(): Promise<Match[]> {
    return (await this.db.matches.orderBy('updatedAt').reverse().toArray()).map(
      fromLocalMatchRecord,
    );
  }

  async listByTeam(teamId: string): Promise<Match[]> {
    return (await this.db.matches.where('teamId').equals(teamId).toArray())
      .map(fromLocalMatchRecord)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async get(id: string): Promise<Match | undefined> {
    const record = await this.db.matches.get(id);
    return record ? fromLocalMatchRecord(record) : undefined;
  }

  async put(match: Match): Promise<string> {
    return this.db.transaction('rw', this.db.teams, this.db.players, this.db.matches, async () => {
      await assertMatchReferences(this.db, match);
      const previous = await this.db.matches.get(match.id);
      return this.db.matches.put(toLocalMatchRecord(match, previous));
    });
  }

  async addIfNoActive(match: Match): Promise<boolean> {
    return this.db.transaction('rw', this.db.teams, this.db.players, this.db.matches, async () => {
      await assertMatchReferences(this.db, match);
      const active = await this.db.matches
        .where('status')
        .anyOf([...ACTIVE_MATCH_STATUSES])
        .first();
      if (active) return false;
      await this.db.matches.add(toLocalMatchRecord(match));
      return true;
    });
  }

  async delete(matchId: string): Promise<void> {
    await this.db.transaction('rw', this.db.matches, this.db.events, async () => {
      await this.db.events.where('matchId').equals(matchId).delete();
      await this.db.matches.delete(matchId);
    });
  }
}
