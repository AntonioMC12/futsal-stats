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
      .mockResolvedValue({ teams: [], players: [], profiles: [], matches: [], events: [] });
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
});
