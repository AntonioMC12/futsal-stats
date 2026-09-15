import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createMatchClock } from '../clock/match-clock';
import { Match } from '../../shared/models/match';
import { MatchEvent } from '../../shared/models/match-event';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import { enqueueSyncOperation, retryDelayMs } from './sync-queue';

describe('durable sync queue', () => {
  let db: FutsalStatsDb;

  beforeEach(async () => {
    await Dexie.delete('futsal-stats');
    db = new FutsalStatsDb();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete('futsal-stats');
  });

  it('compacts commits by match and removes duplicate event ids', async () => {
    const match = matchFixture();
    const first = eventFixture('event-1', 1);
    const second = eventFixture('event-2', 2);
    await enqueueSyncOperation(
      db.syncQueue,
      {
        kind: 'match-events-commit',
        teamId: match.teamId,
        entityId: match.id,
        match,
        events: [first],
      },
      10,
    );
    await enqueueSyncOperation(
      db.syncQueue,
      {
        kind: 'match-events-commit',
        teamId: match.teamId,
        entityId: match.id,
        match: { ...match, updatedAt: 20 },
        events: [first, second],
      },
      20,
    );

    const queued = await db.syncQueue.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.operation.kind).toBe('match-events-commit');
    if (queued[0]?.operation.kind === 'match-events-commit') {
      expect(queued[0].operation.events.map(({ id }) => id)).toEqual(['event-1', 'event-2']);
      expect(queued[0].operation.match.updatedAt).toBe(20);
    }
  });

  it('survives closing and reopening IndexedDB', async () => {
    const match = matchFixture();
    await enqueueSyncOperation(db.syncQueue, {
      kind: 'match-upsert',
      teamId: match.teamId,
      entityId: match.id,
      match,
      createOnly: true,
    });
    db.close();
    db = new FutsalStatsDb();
    await db.open();

    expect(await db.syncQueue.count()).toBe(1);
    expect((await db.syncQueue.toArray())[0]?.dedupeKey).toBe('match:match-1');
  });

  it('uses bounded exponential backoff', () => {
    expect([1, 2, 3, 20].map(retryDelayMs)).toEqual([1_000, 2_000, 4_000, 300_000]);
  });
});

function matchFixture(): Match {
  return {
    id: 'match-1',
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Local', shortName: 'LOC' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: '2026-09-09',
    description: '',
    status: 'firstHalf',
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: [],
    startingLineupPlayerIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

function eventFixture(id: string, sequence: number): MatchEvent {
  return {
    id,
    matchId: 'match-1',
    type: 'CLOCK_STOPPED',
    period: 1,
    gameClockMs: 1_000,
    timestamp: sequence,
    sequence,
    undone: false,
  };
}
