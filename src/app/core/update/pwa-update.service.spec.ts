import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { MATCH_REPOSITORY } from '../persistence/persistence.tokens';
import { MatchRepository } from '../persistence/ports/match.repository';
import { OfflineSyncService } from '../sync/offline-sync.service';
import { PWA_RELOAD, PwaUpdateService } from './pwa-update.service';

describe('PwaUpdateService', () => {
  const versionUpdates = new Subject<VersionEvent>();
  const unrecoverable = new Subject<UnrecoverableStateEvent>();
  const reload = vi.fn();
  const matches = { findActive: vi.fn() };
  const sync = {
    pendingCount: vi.fn().mockReturnValue(0),
    failedCount: vi.fn().mockReturnValue(0),
  };
  const swUpdate = {
    isEnabled: true,
    versionUpdates,
    unrecoverable,
    checkForUpdate: vi.fn(),
    activateUpdate: vi.fn(),
  };

  beforeEach(() => {
    reload.mockReset();
    matches.findActive.mockReset().mockResolvedValue(null);
    sync.pendingCount.mockReturnValue(0);
    sync.failedCount.mockReturnValue(0);
    swUpdate.isEnabled = true;
    swUpdate.checkForUpdate.mockReset().mockResolvedValue(false);
    swUpdate.activateUpdate.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        PwaUpdateService,
        { provide: SwUpdate, useValue: swUpdate },
        { provide: MATCH_REPOSITORY, useValue: matches as unknown as MatchRepository },
        { provide: OfflineSyncService, useValue: sync },
        { provide: PWA_RELOAD, useValue: reload },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('offers VERSION_READY immediately when there is no active match', async () => {
    const service = TestBed.inject(PwaUpdateService);
    versionUpdates.next(readyEvent());

    await vi.waitFor(() => expect(service.state().status).toBe('available'));
    expect(service.state().availableVersion).toBe('1.2.3');
    expect(service.notificationVisible()).toBe(true);
  });

  it('defers VERSION_READY while a match is active', async () => {
    matches.findActive.mockResolvedValue({ status: 'firstHalf' });
    const service = TestBed.inject(PwaUpdateService);
    versionUpdates.next(readyEvent());

    await vi.waitFor(() => expect(service.state().status).toBe('deferred'));
    expect(service.notificationVisible()).toBe(true);
  });

  it('defers a reload while cloud changes remain pending', async () => {
    sync.pendingCount.mockReturnValue(1);
    const service = TestBed.inject(PwaUpdateService);
    versionUpdates.next(readyEvent());
    await vi.waitFor(() => expect(service.state().status).toBe('deferred'));
    sync.pendingCount.mockReturnValue(0);
    await service.reevaluateUpdateSafety();
    expect(service.state().status).toBe('available');
  });

  it('offers a deferred update once the active match has finished', async () => {
    matches.findActive.mockResolvedValueOnce({ status: 'secondHalf' }).mockResolvedValueOnce(null);
    const service = TestBed.inject(PwaUpdateService);
    versionUpdates.next(readyEvent());
    await vi.waitFor(() => expect(service.state().status).toBe('deferred'));

    await service.reevaluateUpdateSafety();

    expect(service.state().status).toBe('available');
    expect(service.notificationVisible()).toBe(true);
  });

  it('reports manual checks with and without a new version', async () => {
    const service = TestBed.inject(PwaUpdateService);
    expect(await service.checkForUpdate()).toBe(false);
    expect(service.state().lastCheckOutcome).toBe('up-to-date');

    swUpdate.checkForUpdate.mockResolvedValueOnce(true);
    expect(await service.checkForUpdate()).toBe(true);
    expect(service.state().status).toBe('available');
  });

  it('handles failed checks without throwing', async () => {
    swUpdate.checkForUpdate.mockRejectedValueOnce(new Error('offline'));
    const service = TestBed.inject(PwaUpdateService);

    expect(await service.checkForUpdate()).toBe(false);
    expect(service.state().status).toBe('error');
    expect(service.state().error).toContain('No se pudo comprobar');
  });

  it('reports that update checks are unavailable when the worker is disabled', async () => {
    swUpdate.isEnabled = false;
    const service = TestBed.inject(PwaUpdateService);

    expect(await service.checkForUpdate()).toBe(false);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    expect(service.state().lastCheckOutcome).toBe('unavailable');
  });

  it('does not activate or reload if a match becomes active', async () => {
    const service = TestBed.inject(PwaUpdateService);
    versionUpdates.next(readyEvent());
    await vi.waitFor(() => expect(service.state().status).toBe('available'));
    matches.findActive.mockResolvedValue({ status: 'ready' });

    await service.applyUpdate();

    expect(service.state().status).toBe('deferred');
    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('activates and reloads a ready version only while it remains safe', async () => {
    const service = TestBed.inject(PwaUpdateService);
    versionUpdates.next(readyEvent());
    await vi.waitFor(() => expect(service.state().status).toBe('available'));

    await service.applyUpdate();

    expect(matches.findActive).toHaveBeenCalledTimes(3);
    expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps an activated update deferred if a match starts before reload', async () => {
    const service = TestBed.inject(PwaUpdateService);
    versionUpdates.next(readyEvent());
    await vi.waitFor(() => expect(service.state().status).toBe('available'));
    matches.findActive
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'firstHalf' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await service.applyUpdate();
    expect(service.state().status).toBe('deferred');
    expect(reload).not.toHaveBeenCalled();

    await service.reevaluateUpdateSafety();
    await service.applyUpdate();
    expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });
});

function readyEvent(): VersionEvent {
  return {
    type: 'VERSION_READY',
    currentVersion: { hash: 'old' },
    latestVersion: { hash: 'new', appData: { version: '1.2.3' } },
  };
}
