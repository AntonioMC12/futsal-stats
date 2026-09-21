import { inject, Injectable } from '@angular/core';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { MatchEventRepository } from '../ports/match-event.repository';
import { FutsalStatsDb } from './futsal-stats.db';
import {
  fromLocalMatchEventRecord,
  toLocalMatchEventRecord,
  toLocalMatchRecord,
  toLocalPlayerRecord,
} from './local-record-mappers';
import { assertEventReferences, assertMatchReferences } from './local-reference-validation';
import { saveFinalMatchSnapshot } from '../../sync/final-match-snapshot';

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
      this.db.matchIntegrity,
      async () => {
        await assertMatchReferences(this.db, match);
        await assertEventReferences(this.db, match, events);
        if (events.length > 0) {
          await this.db.events.bulkAdd(events.map(toLocalMatchEventRecord));
        }
        const previous = await this.db.matches.get(match.id);
        await this.db.matches.put(toLocalMatchRecord(match, previous));
        await saveFinalMatchSnapshot(this.db, match);
      },
    );
  }

  async updateEvent(match: Match, event: MatchEvent): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.matches,
      this.db.events,
      this.db.matchIntegrity,
      async () => {
        await assertEventReferences(this.db, match, [event]);
        const previous = await this.db.events.get(event.id);
        if (!previous || previous.matchId !== match.id) throw new Error('Match event not found');
        await this.db.events.put({
          ...toLocalMatchEventRecord(event),
          createdAt: previous.createdAt,
          updatedAt: Date.now(),
          revision: previous.revision + 1,
        });
        const previousMatch = await this.db.matches.get(match.id);
        await this.db.matches.put(toLocalMatchRecord(match, previousMatch));
        await saveFinalMatchSnapshot(this.db, match);
      },
    );
  }

  async importMatch(
    match: Match,
    events: readonly MatchEvent[],
    newPlayers: readonly Player[],
  ): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.teams,
      this.db.players,
      this.db.matches,
      this.db.events,
      this.db.matchIntegrity,
      async () => {
        if (!(await this.db.teams.get(match.teamId)))
          throw new Error('Import references missing team');
        if (newPlayers.length > 0) {
          await this.db.players.bulkPut(
            newPlayers.map((player) => toLocalPlayerRecord(player, Date.now())),
          );
        }
        await assertMatchReferences(this.db, match);
        await assertEventReferences(this.db, match, events);
        if (events.length > 0) await this.db.events.bulkAdd(events.map(toLocalMatchEventRecord));
        await this.db.matches.add(toLocalMatchRecord(match));
        await saveFinalMatchSnapshot(this.db, match);
      },
    );
  }
}

function compareEvents(left: MatchEvent, right: MatchEvent): number {
  return left.sequence - right.sequence || left.timestamp - right.timestamp;
}
