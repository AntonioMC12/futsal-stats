import { inject, Injectable } from '@angular/core';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { MatchEventRepository } from '../ports/match-event.repository';
import { FutsalStatsDb } from './futsal-stats.db';

@Injectable()
export class DexieMatchEventRepository implements MatchEventRepository {
  private readonly db = inject(FutsalStatsDb);

  async listByMatch(matchId: string): Promise<MatchEvent[]> {
    const events = await this.db.events.where('matchId').equals(matchId).sortBy('sequence');
    return events.sort(compareEvents);
  }

  async commit(match: Match, events: readonly MatchEvent[]): Promise<void> {
    await this.db.transaction('rw', this.db.matches, this.db.events, async () => {
      if (events.length > 0) await this.db.events.bulkAdd([...events]);
      await this.db.matches.put(match);
    });
  }
}

function compareEvents(left: MatchEvent, right: MatchEvent): number {
  return left.sequence - right.sequence || left.timestamp - right.timestamp;
}
