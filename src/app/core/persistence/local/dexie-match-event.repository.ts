import { inject, Injectable } from '@angular/core';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { MatchEventRepository } from '../ports/match-event.repository';
import { FutsalStatsDb } from './futsal-stats.db';
import {
  fromLocalMatchEventRecord,
  toLocalMatchEventRecord,
  toLocalMatchRecord,
} from './local-record-mappers';
import { assertEventReferences, assertMatchReferences } from './local-reference-validation';

@Injectable()
export class DexieMatchEventRepository implements MatchEventRepository {
  private readonly db = inject(FutsalStatsDb);

  async listByMatch(matchId: string): Promise<MatchEvent[]> {
    const events = (await this.db.events.where('matchId').equals(matchId).sortBy('sequence')).map(
      fromLocalMatchEventRecord,
    );
    return events.sort(compareEvents);
  }

  async commit(match: Match, events: readonly MatchEvent[]): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.teams,
      this.db.players,
      this.db.matches,
      this.db.events,
      async () => {
        await assertMatchReferences(this.db, match);
        await assertEventReferences(this.db, match, events);
        if (events.length > 0) {
          await this.db.events.bulkAdd(events.map(toLocalMatchEventRecord));
        }
        const previous = await this.db.matches.get(match.id);
        await this.db.matches.put(toLocalMatchRecord(match, previous));
      },
    );
  }
}

function compareEvents(left: MatchEvent, right: MatchEvent): number {
  return left.sequence - right.sequence || left.timestamp - right.timestamp;
}
