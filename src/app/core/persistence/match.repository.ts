import { inject, Injectable } from '@angular/core';
import { ACTIVE_MATCH_STATUSES, isMatchActive, Match } from '../../shared/models/match';
import { FutsalStatsDb } from './futsal-stats.db';

@Injectable({ providedIn: 'root' })
export class MatchRepository {
  private readonly db = inject(FutsalStatsDb);

  async findActive(): Promise<Match | null> {
    const matches = await this.db.matches.orderBy('updatedAt').reverse().toArray();
    const match = matches.find(isMatchActive);
    return match ? normalizeMatch(match) : null;
  }

  async list(): Promise<Match[]> {
    const matches = await this.db.matches.orderBy('updatedAt').reverse().toArray();
    return matches.map(normalizeMatch);
  }

  async get(id: string): Promise<Match | undefined> {
    const match = await this.db.matches.get(id);
    return match ? normalizeMatch(match) : undefined;
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
      if (active) {
        return false;
      }
      await this.db.matches.add(match);
      return true;
    });
  }
}

export function normalizeMatch(match: Match): Match {
  const legacy = match as Match & { date?: Match['date']; description?: string };
  return {
    ...match,
    awayTeam: {
      ...match.awayTeam,
      name: match.awayTeam?.name ?? '',
      shortName: match.awayTeam?.shortName ?? '',
    },
    date: legacy.date ?? '',
    description: legacy.description ?? '',
    squadPlayerIds: match.squadPlayerIds ?? [],
    startingLineupPlayerIds: match.startingLineupPlayerIds ?? [],
  };
}
