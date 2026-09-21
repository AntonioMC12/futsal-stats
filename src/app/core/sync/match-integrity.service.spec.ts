import 'fake-indexeddb/auto';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { createMatchClock } from '../clock/match-clock';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import {
  toLocalMatchEventRecord,
  toLocalMatchRecord,
} from '../persistence/local/local-record-mappers';
import { TeamAccessService } from '../team-workspace/team-access.service';
import { Match } from '../../shared/models/match';
import { MatchEvent } from '../../shared/models/match-event';
import { saveFinalMatchSnapshot } from './final-match-snapshot';
import { MatchIntegrityService } from './match-integrity.service';
import { OfflineSyncService } from './offline-sync.service';
import { enqueueSyncOperation } from './sync-queue';

describe('MatchIntegrityService', () => {
  let db: FutsalStatsDb;
  let service: MatchIntegrityService;
  let cloudEventIds: string[];
  let cloudManifest: Record<string, unknown> | null;
  let cloudStatus: string;
  const syncNow = vi.fn();

  beforeEach(async () => {
    await Dexie.delete('futsal-stats');
    cloudEventIds = [];
    cloudManifest = null;
    cloudStatus = 'finished';
    syncNow.mockReset().mockResolvedValue(undefined);
    const client = { from: (table: string) => query(table) };
    TestBed.configureTestingModule({
      providers: [
        FutsalStatsDb,
        MatchIntegrityService,
        { provide: CLOUD_CONFIG, useValue: { mode: 'cloud' } },
        { provide: SupabaseClientService, useValue: { requireClient: () => client } },
        {
          provide: TeamAccessService,
          useValue: { assertCanWrite: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: OfflineSyncService, useValue: { online: signal(true), syncNow } },
      ],
    });
    db = TestBed.inject(FutsalStatsDb);
    service = TestBed.inject(MatchIntegrityService);
    await db.open();
    await db.matches.put(toLocalMatchRecord(match()));
    await db.events.bulkPut(
      [event('event-a', 1), event('event-b', 2)].map(toLocalMatchEventRecord),
    );
    await db.transaction('rw', db.events, db.matchIntegrity, async () =>
      saveFinalMatchSnapshot(db, match()),
    );
    const snapshot = await db.matchIntegrity.get('match-1');
    cloudManifest = {
      expected_event_ids: snapshot!.expectedEventIds,
      expected_lineup_event_ids: [],
      expected_player_ids: [],
      checksum: snapshot!.checksum,
    };
  });

  afterEach(async () => {
    db.close();
    TestBed.resetTestingModule();
    await Dexie.delete('futsal-stats');
  });

  it('marks a match verified only after comparing actual cloud IDs with the durable manifest', async () => {
    cloudEventIds = ['event-a', 'event-b'];
    expect((await service.verify('match-1')).status).toBe('verified');
    expect(await service.getIntegrityStatus('match-1')).toBe('verified');
  });

  it('detects missing cloud events even when counts match but IDs differ', async () => {
    cloudEventIds = ['event-a', 'event-other'];
    const report = await service.verify('match-1');
    expect(report.status).toBe('mismatch');
    expect(report.missingEventIds).toEqual(['event-b']);
    expect(report.unexpectedCloudEventIds).toEqual(['event-other']);
    expect(report.repairAvailable).toBe(false);
  });

  it('requeues only missing events with original IDs, without deleting local records', async () => {
    cloudEventIds = ['event-a'];
    await enqueueSyncOperation(db.syncQueue, {
      kind: 'match-events-commit',
      teamId: 'team-1',
      entityId: 'match-1',
      match: match(),
      events: [event('event-a', 1), event('event-b', 2)],
    });
    const original = await db.syncQueue.where('dedupeKey').equals('match-events:match-1').first();
    await service.repair('match-1');
    const queued = await db.syncQueue.where('dedupeKey').equals('match-events:match-1').first();
    expect(queued?.id).toBe(original?.id);
    expect(queued?.operation.kind).toBe('match-events-commit');
    if (queued?.operation.kind === 'match-events-commit') {
      expect(queued.operation.events.map((item) => item.id)).toEqual(['event-b']);
      expect(queued.operation.events[0]?.timestamp).toBe(2);
    }
    expect(await db.events.count()).toBe(2);
    expect(syncNow).toHaveBeenCalledOnce();
  });

  it('never reports verified when cloud is unavailable', async () => {
    cloudEventIds = ['event-a', 'event-b'];
    cloudStatus = 'error';
    expect((await service.verify('match-1')).status).toBe('unreachable');
  });

  it('does not trust a cloud cache without an original or remote manifest', async () => {
    cloudEventIds = ['event-a', 'event-b'];
    cloudManifest = null;
    await db.matchIntegrity.delete('match-1');
    expect((await service.verify('match-1')).status).toBe('unknown');
  });

  it('rebuilds a durable repair intent on startup and resumes after reopening Dexie', async () => {
    cloudEventIds = ['event-a'];
    await service.recover();
    db.close();
    const reopened = new FutsalStatsDb();
    await reopened.open();
    const queued = await reopened.syncQueue
      .where('dedupeKey')
      .equals('match-events:match-1')
      .first();
    expect(queued?.status).toBe('pending');
    if (queued?.operation.kind === 'match-events-commit')
      expect(queued.operation.events.map((item) => item.id)).toEqual(['event-b']);
    reopened.close();
  });

  function query(table: string) {
    const result = () => {
      if (cloudStatus === 'error') return { data: null, error: new Error('500') };
      switch (table) {
        case 'teams':
          return { data: { id: 'team-1' }, error: null };
        case 'matches':
          return { data: { id: 'match-1', team_id: 'team-1', status: cloudStatus }, error: null };
        case 'match_events':
          return { data: cloudEventIds.map((id) => ({ id })), error: null };
        case 'match_players':
          return { data: [], error: null };
        case 'match_event_lineup_players':
          return { data: [], error: null };
        case 'match_integrity_manifests':
          return { data: cloudManifest, error: null };
        default:
          throw new Error(table);
      }
    };
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      in: () => chain,
      maybeSingle: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
        Promise.resolve(result()).then(resolve),
    };
    return chain;
  }
});

function match(): Match {
  return {
    id: 'match-1',
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Local', shortName: 'LOC' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: '2026-09-21',
    description: '',
    status: 'finished',
    currentPeriod: 2,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: [],
    startingLineupPlayerIds: [],
    createdAt: 1,
    updatedAt: 3,
  };
}

function event(id: string, sequence: number): MatchEvent {
  return {
    id,
    matchId: 'match-1',
    type: 'CLOCK_STOPPED',
    period: 1,
    gameClockMs: 1000,
    timestamp: sequence,
    sequence,
    undone: false,
  };
}
