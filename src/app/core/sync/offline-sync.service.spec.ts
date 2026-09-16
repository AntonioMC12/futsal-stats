import 'fake-indexeddb/auto';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { CloudFoundationService } from '../cloud/cloud-foundation.service';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import { toLocalTeamRecord } from '../persistence/local/local-record-mappers';
import { NetworkStatusService } from './network-status.service';
import { OfflineSyncService } from './offline-sync.service';
import { enqueueSyncOperation } from './sync-queue';
import { PermanentSyncError, SyncRemoteGateway } from './sync-remote.gateway';
import { createStrategy } from '../../features/strategies/domain/strategy';

describe('OfflineSyncService', () => {
  let db: FutsalStatsDb;
  let service: OfflineSyncService;
  const online = signal(true);
  const cloudStatus = signal<'connected' | 'unreachable'>('connected');
  const push = vi.fn();
  const pull = vi.fn();

  beforeEach(async () => {
    await Dexie.delete('futsal-stats');
    online.set(true);
    cloudStatus.set('connected');
    push.mockReset();
    pull
      .mockReset()
      .mockResolvedValue({
        teams: [],
        players: [],
        profiles: [],
        matches: [],
        events: [],
        strategies: [],
      });
    TestBed.configureTestingModule({
      providers: [
        FutsalStatsDb,
        OfflineSyncService,
        {
          provide: CLOUD_CONFIG,
          useValue: { mode: 'cloud', supabaseUrl: 'https://example.test', publishableKey: 'key' },
        },
        {
          provide: CloudFoundationService,
          useValue: { status: cloudStatus, initialize: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: NetworkStatusService, useValue: { online } },
        { provide: SyncRemoteGateway, useValue: { push, pull } },
      ],
    });
    db = TestBed.inject(FutsalStatsDb);
    service = TestBed.inject(OfflineSyncService);
    await db.open();
  });

  afterEach(async () => {
    db.close();
    TestBed.resetTestingModule();
    await Dexie.delete('futsal-stats');
  });

  it('keeps irrecoverable failures visible and allows an explicit retry', async () => {
    const team = { id: 'team-1', name: 'Local', shortName: 'LOC', createdAt: 1, updatedAt: 1 };
    await db.teams.put(toLocalTeamRecord(team));
    await enqueueSyncOperation(db.syncQueue, {
      kind: 'team-upsert',
      teamId: team.id,
      entityId: team.id,
      team,
    });
    push.mockRejectedValueOnce(new PermanentSyncError('Acceso revocado'));

    await service.initialize();

    expect(service.state()).toBe('error');
    expect(service.failedCount()).toBe(1);
    expect(service.failures()[0]).toMatchObject({
      label: 'Equipo',
      message: 'Acceso revocado',
      attempts: 1,
    });
    expect((await db.teams.get(team.id))?.syncStatus).toBe('failed');

    push.mockResolvedValue(undefined);
    await service.retryFailed();

    expect(service.failedCount()).toBe(0);
    expect(service.pendingCount()).toBe(0);
    expect(service.state()).toBe('idle');
    expect(await db.syncQueue.count()).toBe(0);
    expect((await db.teams.get(team.id))?.syncStatus).toBe('synced');
  });

  it('does not contact the cloud while offline and resumes when connectivity returns', async () => {
    const team = { id: 'team-1', name: 'Local', shortName: 'LOC', createdAt: 1, updatedAt: 1 };
    await db.teams.put(toLocalTeamRecord(team));
    await enqueueSyncOperation(db.syncQueue, {
      kind: 'team-upsert',
      teamId: team.id,
      entityId: team.id,
      team,
    });
    online.set(false);

    await service.initialize();
    expect(service.state()).toBe('offline');
    expect(service.pendingCount()).toBe(1);
    expect(push).not.toHaveBeenCalled();

    push.mockResolvedValue(undefined);
    online.set(true);
    await vi.waitFor(() => expect(service.pendingCount()).toBe(0));
    expect(push).toHaveBeenCalledOnce();
    expect(service.state()).toBe('idle');
  });

  it('migrates a local strategy, then restores its complete sequence on another cache', async () => {
    const team = {
      id: '84dac2e1-78fc-4f19-a564-05f496880f31',
      name: 'Team',
      shortName: 'TM',
      createdAt: 1,
      updatedAt: 1,
    };
    const ids = ['cf10dc08-10fd-49e2-9317-97ef2f6322f2', '8fa114c5-1ef0-422b-a924-cf269d21f2c8'];
    const strategy = createStrategy(team.id, [], () => ids.shift() ?? crypto.randomUUID());
    await db.teams.put({ ...toLocalTeamRecord(team), syncStatus: 'synced' });
    await db.strategies.put(strategy);
    pull.mockResolvedValue({
      teams: [team],
      players: [],
      profiles: [],
      matches: [],
      events: [],
      strategies: [strategy],
    });

    await service.initialize();
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'strategy-upsert', entityId: strategy.id }),
    );
    expect((await db.strategies.get(strategy.id))?.syncStatus).toBe('synced');

    await db.strategies.clear();
    await service.syncNow();
    expect((await db.strategies.get(strategy.id))?.phases).toEqual(strategy.phases);
  });

  it('queues legacy local photo blobs for private Storage upload', async () => {
    const ref = {
      storageKey: 'teams/team-1/players/player-1/profile',
      mimeType: 'image/png' as const,
      updatedAt: 42,
    };
    await db.playerPhotos.put({
      ...ref,
      teamId: 'team-1',
      playerId: 'player-1',
      data: new Uint8Array([1, 2]).buffer,
    });
    await db.playerProfiles.put({
      playerId: 'player-1', teamId: 'team-1', photoRef: ref,
      preferredFoot: 'unknown', notes: '', metadata: {},
      createdAt: 1, updatedAt: 42, deletedAt: null, revision: 1, syncStatus: 'synced',
    });
    await service.initialize();
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'photo-upload', ref }));
    expect((await db.playerPhotos.get(ref.storageKey))?.syncStatus).toBe('synced');
  });

  it('hides a previously synchronized team when the cloud membership disappears', async () => {
    const team = { id: 'team-1', name: 'Team', shortName: 'TM', createdAt: 1, updatedAt: 1 };
    await db.teams.put({ ...toLocalTeamRecord(team), syncStatus: 'synced' });
    await service.initialize();
    expect((await db.teams.get(team.id))?.accessRevoked).toBe(true);
    expect(service.revokedTeamIds()).toContain(team.id);
  });
});
