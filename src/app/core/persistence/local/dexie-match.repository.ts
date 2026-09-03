import { inject, Injectable } from '@angular/core';
import { ACTIVE_MATCH_STATUSES, isMatchActive, Match } from '../../../shared/models/match';
import { MatchRepository } from '../ports/match.repository';
import { FutsalStatsDb } from './futsal-stats.db';

@Injectable()
export class DexieMatchRepository implements MatchRepository {
  private readonly db = inject(FutsalStatsDb);

  async findActive(): Promise<Match | null> {
    const matches = await this.db.matches.orderBy('updatedAt').reverse().toArray();
    return matches.find(isMatchActive) ?? null;
  }

  list(): Promise<Match[]> {
    return this.db.matches.orderBy('updatedAt').reverse().toArray();
  }

  get(id: string): Promise<Match | undefined> {
    return this.db.matches.get(id);
  }

  put(match: Match): Promise<string> {
    return this.db.matches.put(match);
  }

  async addIfNoActive(match: Match): Promise<boolean> {
    return this.db.transaction('rw', this.db.matches, async () => {
      const active = await this.db.matches
        .where('status')
        .anyOf([...ACTIVE_MATCH_STATUSES])
        .first();
      if (active) return false;
      await this.db.matches.add(match);
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
