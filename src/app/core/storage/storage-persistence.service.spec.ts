import { TestBed } from '@angular/core/testing';
import { BROWSER_STORAGE_MANAGER, StoragePersistenceService } from './storage-persistence.service';

describe('StoragePersistenceService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('reports persistence and browser quota without storing application data', async () => {
    const storage = {
      persisted: vi.fn().mockResolvedValue(true),
      persist: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockResolvedValue({ usage: 1024, quota: 4096 }),
    } as unknown as StorageManager;
    TestBed.configureTestingModule({
      providers: [{ provide: BROWSER_STORAGE_MANAGER, useValue: storage }],
    });

    const service = TestBed.inject(StoragePersistenceService);
    await service.refresh();
    expect(service.persisted()).toBe(true);
    expect(service.estimate()).toEqual({ usage: 1024, quota: 4096 });

    expect(await service.requestPersistence()).toBe(true);
    expect(storage.persist).toHaveBeenCalledOnce();
  });

  it('degrades safely when the Storage API is unavailable', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: BROWSER_STORAGE_MANAGER, useValue: null }],
    });

    const service = TestBed.inject(StoragePersistenceService);
    await service.refresh();

    expect(service.supported).toBe(false);
    expect(service.persisted()).toBeNull();
    expect(service.estimate()).toBeNull();
    expect(await service.requestPersistence()).toBe(false);
  });
});
