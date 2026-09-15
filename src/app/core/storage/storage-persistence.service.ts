import { inject, Injectable, InjectionToken, signal } from '@angular/core';

export interface StorageEstimateSnapshot {
  readonly usage: number;
  readonly quota: number;
}

export const BROWSER_STORAGE_MANAGER = new InjectionToken<StorageManager | null>(
  'BROWSER_STORAGE_MANAGER',
  {
    providedIn: 'root',
    factory: () => globalThis.navigator?.storage ?? null,
  },
);

@Injectable({ providedIn: 'root' })
export class StoragePersistenceService {
  private readonly storage = inject(BROWSER_STORAGE_MANAGER);
  readonly supported = this.storage !== null;
  readonly persisted = signal<boolean | null>(null);
  readonly estimate = signal<StorageEstimateSnapshot | null>(null);
  readonly error = signal<string | null>(null);

  async refresh(): Promise<void> {
    this.error.set(null);
    try {
      const [persisted, estimate] = await Promise.all([this.isPersisted(), this.readEstimate()]);
      this.persisted.set(persisted);
      this.estimate.set(estimate);
    } catch (error) {
      this.fail(error);
    }
  }

  async isPersisted(): Promise<boolean | null> {
    return this.storage?.persisted ? this.storage.persisted() : null;
  }

  async requestPersistence(): Promise<boolean> {
    if (!this.storage?.persist) return false;
    this.error.set(null);
    try {
      const granted = await this.storage.persist();
      this.persisted.set(granted);
      await this.refresh();
      console.info('storage_persistence_requested', { granted });
      return granted;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  async readEstimate(): Promise<StorageEstimateSnapshot | null> {
    if (!this.storage?.estimate) return null;
    const estimate = await this.storage.estimate();
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    };
  }

  private fail(error: unknown): void {
    console.error('storage_persistence_failed', error instanceof Error ? error.message : error);
    this.error.set('No se ha podido consultar el almacenamiento del dispositivo.');
  }
}
