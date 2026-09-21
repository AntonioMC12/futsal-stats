import 'fake-indexeddb/auto';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { createMatchClock } from '../clock/match-clock';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { CloudFoundationService } from '../cloud/cloud-foundation.service';
import { AuthService } from '../auth/auth.service';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import { DexieMatchEventRepository } from '../persistence/local/dexie-match-event.repository';
import { DexieMatchRepository } from '../persistence/local/dexie-match.repository';
import { toLocalTeamRecord } from '../persistence/local/local-record-mappers';
import { TeamAccessService } from '../team-workspace/team-access.service';
import { Match } from '../../shared/models/match';
import { MatchEvent } from '../../shared/models/match-event';
import { OfflineMatchEventRepository, OfflineMatchRepository } from './offline-repositories';
import { OfflineSyncService } from './offline-sync.service';
import { NetworkStatusService } from './network-status.service';
import { SyncOperation } from './sync-operation';
import { SyncRemoteGateway } from './sync-remote.gateway';

it('keeps ten offline events and the final manifest across IndexedDB reopen, then syncs original IDs', async () => {
  await Dexie.delete('futsal-stats');
  const online = signal(false);
  const cloudEvents = new Map<string, MatchEvent>();
  let cloudMatch: Match | null = null;
  let manifestIds: string[] = [];
  const push = vi.fn(async (operation: SyncOperation) => {
    if (operation.kind === 'match-upsert' || operation.kind === 'match-events-commit')
      cloudMatch = operation.match;
    if (operation.kind === 'match-events-commit')
      for (const event of operation.events) cloudEvents.set(event.id, event);
    if (operation.kind === 'match-integrity-manifest')
      manifestIds = operation.snapshot.expectedEventIds;
  });
  TestBed.configureTestingModule({
    providers: [
      FutsalStatsDb,
      DexieMatchRepository,
      DexieMatchEventRepository,
      OfflineMatchRepository,
      OfflineMatchEventRepository,
      OfflineSyncService,
      { provide: CLOUD_CONFIG, useValue: { mode: 'cloud' } },
      { provide: NetworkStatusService, useValue: { online } },
      {
        provide: AuthService,
        useValue: {
          remotelyVerified: signal(true),
          orphanedUserId: signal(null),
          reenrollmentRequired: signal(false),
        },
      },
      { provide: CloudFoundationService, useValue: { status: signal('connected') } },
      { provide: TeamAccessService, useValue: { assertCanWrite: async () => undefined } },
      {
        provide: SyncRemoteGateway,
        useValue: {
          push,
          pull: async () => ({
            teams: [team],
            players: [],
            profiles: [],
            matches: cloudMatch ? [cloudMatch] : [],
            events: [...cloudEvents.values()],
            strategies: [],
          }),
        },
      },
    ],
  });
  const db = TestBed.inject(FutsalStatsDb);
  const matches = TestBed.inject(OfflineMatchRepository);
  const events = TestBed.inject(OfflineMatchEventRepository);
  const sync = TestBed.inject(OfflineSyncService);
  await db.open();
  await db.teams.put(toLocalTeamRecord(team));
  await matches.addIfNoActive(match);
  for (let sequence = 1; sequence <= 10; sequence++) {
    await events.commit({ ...match, status: 'firstHalf', updatedAt: sequence + 1 }, [
      {
        id: `event-${sequence}`,
        matchId: match.id,
        type: 'CLOCK_STOPPED',
        period: 1,
        gameClockMs: 1000,
        timestamp: sequence,
        sequence,
        undone: false,
      },
    ]);
  }
  await events.commit({ ...match, status: 'finished', updatedAt: 20 }, []);
  expect(await db.events.count()).toBe(10);
  expect((await db.matchIntegrity.get(match.id))?.expectedEventIds).toHaveLength(10);
  expect(push).not.toHaveBeenCalled();

  db.close();
  await db.open();
  online.set(true);
  await sync.initialize();
  expect((cloudMatch as Match | null)?.status).toBe('finished');
  expect([...cloudEvents.keys()].sort()).toEqual(
    Array.from({ length: 10 }, (_, index) => `event-${index + 1}`).sort(),
  );
  expect(manifestIds).toHaveLength(10);
  expect(await db.syncQueue.count()).toBe(0);
  await sync.syncNow();
  TestBed.resetTestingModule();
  db.close();
  await Dexie.delete('futsal-stats');
});

const team = { id: 'team-1', name: 'Local', shortName: 'LOC', createdAt: 1, updatedAt: 1 };
const match: Match = {
  id: 'match-1',
  teamId: team.id,
  homeTeam: { id: team.id, name: team.name, shortName: team.shortName },
  awayTeam: { name: 'Rival', shortName: 'RIV' },
  date: '2026-09-21',
  description: '',
  status: 'ready',
  currentPeriod: 1,
  periodCount: 2,
  clock: createMatchClock(),
  squadPlayerIds: [],
  startingLineupPlayerIds: [],
  createdAt: 1,
  updatedAt: 1,
};
