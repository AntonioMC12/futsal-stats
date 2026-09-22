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
import { AuthService } from '../auth/auth.service';

describe('OfflineSyncService', () => {
  let db: FutsalStatsDb;
  let service: OfflineSyncService;
  const online = signal(true);
  const cloudStatus = signal<'connected' | 'unreachable'>('connected');
  const orphanedUserId = signal<string | null>(null);
  const reenrollmentRequired = signal(false);
  const push = vi.fn();
  const pull = vi.fn();

  beforeEach(async () => {
    await Dexie.delete('futsal-stats');
    online.set(true);
    cloudStatus.set('connected');
    orphanedUserId.set(null);
    reenrollmentRequired.set(false);
    push.mockReset();
    pull.mockReset().mockResolvedValue({
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
        {
          provide: AuthService,
          useValue: {
            orphanedUserId,
            reenrollmentRequired,
            remotelyVerified: signal(true),
            ensureValidDeviceIdentity: vi.fn().mockResolvedValue({}),
          },
        },
        { provide: SyncRemoteGateway, useValue: { push, pull } },
      ],
    });
    db = TestBed.inject(FutsalStatsDb);
    service = TestBed.inject(OfflineSyncService);
    await db.open();
  });

  afterEach(async () => {
    await service.syncNow();
    TestBed.resetTestingModule();
    db.close();
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

  it('keeps a temporary 401 retryable and sends it after identity recovers', async () => {
    const team = { id: 'team-1', name: 'Local', shortName: 'LOC', createdAt: 1, updatedAt: 1 };
    await db.teams.put(toLocalTeamRecord(team));
    await enqueueSyncOperation(db.syncQueue, {
      kind: 'team-upsert',
      teamId: team.id,
      entityId: team.id,
      team,
    });
    push.mockRejectedValueOnce({ status: 401, message: 'expired' }).mockResolvedValue(undefined);
    await service.initialize();
    await vi.waitFor(async () => {
      expect((await db.syncQueue.toArray())[0]?.attempts).toBe(1);
    });
    const item = (await db.syncQueue.toArray())[0]!;
    expect(item.status).toBe('pending');
    expect(item.attempts).toBe(1);
    await db.syncQueue.update(item.id, { nextAttemptAt: Date.now() - 1 });
    await service.syncNow();
    expect(await db.syncQueue.count()).toBe(0);
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
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'strategy-upsert', entityId: strategy.id }),
      ),
    );
    await vi.waitFor(async () =>
      expect((await db.strategies.get(strategy.id))?.syncStatus).toBe('synced'),
    );

    await db.strategies.clear();
    await service.syncNow();
    expect((await db.strategies.get(strategy.id))?.phases).toEqual(strategy.phases);
  });

  it('queues legacy local photo blobs for private Storage upload', async () => {
    await db.teams.put(
      toLocalTeamRecord({
        id: 'team-1',
        name: 'Team',
        shortName: 'TM',
        createdAt: 1,
        updatedAt: 1,
      }),
    );
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
      playerId: 'player-1',
      teamId: 'team-1',
      photoRef: ref,
      preferredFoot: 'unknown',
      notes: '',
      metadata: {},
      createdAt: 1,
      updatedAt: 42,
      deletedAt: null,
      revision: 1,
      syncStatus: 'synced',
    });
    await service.initialize();
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(expect.objectContaining({ kind: 'photo-upload', ref })),
    );
    await vi.waitFor(async () =>
      expect((await db.playerPhotos.get(ref.storageKey))?.syncStatus).toBe('synced'),
    );
  });

  it('hides a previously synchronized team when the cloud membership disappears', async () => {
    const team = { id: 'team-1', name: 'Team', shortName: 'TM', createdAt: 1, updatedAt: 1 };
    await db.teams.put({ ...toLocalTeamRecord(team), syncStatus: 'synced' });
    await service.initialize();
    expect((await db.teams.get(team.id))?.accessRevoked).toBe(true);
    expect(service.revokedTeamIds()).toContain(team.id);
  });

  it('keeps old outbox data without pushing it under a replacement identity', async () => {
    const oldTeam = { id: 'old-team', name: 'Old', shortName: 'OLD', createdAt: 1, updatedAt: 1 };
    await db.teams.put(toLocalTeamRecord(oldTeam));
    await enqueueSyncOperation(db.syncQueue, {
      kind: 'team-upsert',
      teamId: oldTeam.id,
      entityId: oldTeam.id,
      team: oldTeam,
    });
    orphanedUserId.set('deleted-user');
    reenrollmentRequired.set(true);

    await service.initialize();
    expect((await db.teams.get(oldTeam.id))?.accessRevoked).toBe(true);
    expect(await db.syncQueue.count()).toBe(1);
    expect(push).not.toHaveBeenCalled();

    const newTeam = { id: 'new-team', name: 'New', shortName: 'NEW', createdAt: 2, updatedAt: 2 };
    await db.teams.put(toLocalTeamRecord(newTeam));
    await enqueueSyncOperation(db.syncQueue, {
      kind: 'team-upsert',
      teamId: newTeam.id,
      entityId: newTeam.id,
      team: newTeam,
    });
    reenrollmentRequired.set(false);
    pull.mockResolvedValue({
      teams: [newTeam],
      players: [],
      profiles: [],
      matches: [],
      events: [],
      strategies: [],
    });
    await service.syncNow();
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'new-team' }));
    await vi.waitFor(async () => expect(await db.syncQueue.count()).toBe(1));
    expect((await db.teams.get(oldTeam.id))?.accessRevoked).toBe(true);
  });

  it('resumes a preserved outbox after the replacement identity regains Team membership', async () => {
    const team = { id: 'team-1', name: 'Team', shortName: 'TM', createdAt: 1, updatedAt: 1 };
    await db.teams.put(toLocalTeamRecord(team));
    await enqueueSyncOperation(db.syncQueue, {
      kind: 'team-upsert',
      teamId: team.id,
      entityId: team.id,
      team,
    });
    orphanedUserId.set('deleted-user');
    reenrollmentRequired.set(true);
    await service.initialize();
    expect(push).not.toHaveBeenCalled();

    reenrollmentRequired.set(false);
    pull.mockResolvedValue({
      teams: [team],
      players: [],
      profiles: [],
      matches: [],
      events: [],
      strategies: [],
    });
    await service.refreshAfterAccessChange();
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ teamId: team.id }));
    expect(await db.syncQueue.count()).toBe(0);
    expect((await db.teams.get(team.id))?.accessRevoked).toBe(false);
  });
});
