import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { createMatchClock } from '../clock/match-clock';
import { Match } from '../../shared/models/match';
import { MatchEvent } from '../../shared/models/match-event';
import { DexieMatchEventRepository } from '../persistence/local/dexie-match-event.repository';
import { DexieMatchRepository } from '../persistence/local/dexie-match.repository';
import { DexiePlayerRepository } from '../persistence/local/dexie-player.repository';
import { DexieTeamRepository } from '../persistence/local/dexie-team.repository';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import { OfflineMatchEventRepository, OfflineMatchRepository } from './offline-repositories';
import { OfflineSyncService } from './offline-sync.service';
import { TeamAccessService } from '../team-workspace/team-access.service';

describe('offline-first match repositories', () => {
  let db: FutsalStatsDb;
  const requestSync = vi.fn();
  const assertCanWrite = vi.fn();

  beforeEach(async () => {
    await Dexie.delete('futsal-stats');
    requestSync.mockReset();
    assertCanWrite.mockReset();
    assertCanWrite.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        FutsalStatsDb,
        DexieTeamRepository,
        DexiePlayerRepository,
        DexieMatchRepository,
        DexieMatchEventRepository,
        OfflineMatchRepository,
        OfflineMatchEventRepository,
        { provide: OfflineSyncService, useValue: { requestSync } },
        { provide: TeamAccessService, useValue: { assertCanWrite } },
      ],
    });
    db = TestBed.inject(FutsalStatsDb);
    await TestBed.inject(DexieTeamRepository).put({
      id: 'team-1',
      name: 'Local',
      shortName: 'LOC',
      createdAt: 1,
      updatedAt: 1,
    });
  });

  afterEach(async () => {
    db.close();
    TestBed.resetTestingModule();
    await Dexie.delete('futsal-stats');
  });

  it('stores a match and its outbox operation atomically before network work', async () => {
    const repository = TestBed.inject(OfflineMatchRepository);
    const match = matchFixture();

    expect(await repository.addIfNoActive(match)).toBe(true);

    expect(await repository.get(match.id)).toEqual(match);
    expect(await db.syncQueue.where('dedupeKey').equals('match:match-1').count()).toBe(1);
    expect(requestSync).toHaveBeenCalledOnce();
  });

  it('persists events locally and compacts pending commits across a reload', async () => {
    const matches = TestBed.inject(OfflineMatchRepository);
    const events = TestBed.inject(OfflineMatchEventRepository);
    const match = matchFixture();
    await matches.addIfNoActive(match);
    const first = eventFixture('event-1', 1);
    const second = eventFixture('event-2', 2);
    await events.commit({ ...match, updatedAt: 2 }, [first]);
    await events.commit({ ...match, updatedAt: 3 }, [second]);

    expect((await events.listByMatch(match.id)).map(({ id }) => id)).toEqual([
      'event-1',
      'event-2',
    ]);
    const queued = await db.syncQueue.where('dedupeKey').equals('match-events:match-1').first();
    expect(queued?.operation.kind).toBe('match-events-commit');
    if (queued?.operation.kind === 'match-events-commit') {
      expect(queued.operation.events.map(({ id }) => id)).toEqual(['event-1', 'event-2']);
    }

    const corrected = { ...first, undone: true };
    await events.updateEvent({ ...match, updatedAt: 4 }, corrected);
    expect((await events.listByMatch(match.id)).find(({ id }) => id === corrected.id)).toEqual(
      corrected,
    );
    const update = await db.syncQueue
      .where('dedupeKey')
      .equals(`match-event-update:${corrected.id}`)
      .first();
    expect(update?.operation).toMatchObject({ kind: 'match-event-update', event: corrected });

    db.close();
    db = new FutsalStatsDb();
    await db.open();
    expect(await db.events.count()).toBe(2);
    expect(await db.syncQueue.count()).toBe(3);
  });

  it('persists the final manifest with events and outbox across restart', async () => {
    const matches = TestBed.inject(OfflineMatchRepository);
    const events = TestBed.inject(OfflineMatchEventRepository);
    const initial = matchFixture();
    await matches.addIfNoActive(initial);
    const finished = { ...initial, status: 'finished' as const, updatedAt: 4 };
    await events.commit(finished, [eventFixture('event-1', 1)]);
    db.close();
    db = new FutsalStatsDb();
    await db.open();
    const snapshot = await db.matchIntegrity.get(initial.id);
    expect(snapshot?.expectedEventIds).toEqual(['event-1']);
    expect(snapshot?.status).toBe('pending');
    expect(
      await db.syncQueue.where('dedupeKey').equals(`match-integrity:${initial.id}`).count(),
    ).toBe(1);
    expect(await db.events.where('matchId').equals(initial.id).count()).toBe(1);
  });

  it('rolls back local events and queue together when validation fails', async () => {
    const repository = TestBed.inject(OfflineMatchEventRepository);
    const match = matchFixture();
    await expect(
      repository.commit(match, [{ ...eventFixture('bad', 1), matchId: 'other' }]),
    ).rejects.toThrow();
    expect(await db.events.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('does not touch IndexedDB when the current membership is read-only', async () => {
    assertCanWrite.mockRejectedValueOnce(new Error('read-only'));
    const repository = TestBed.inject(OfflineMatchEventRepository);

    await expect(repository.commit(matchFixture(), [eventFixture('event-1', 1)])).rejects.toThrow(
      'read-only',
    );

    expect(await db.events.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
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
