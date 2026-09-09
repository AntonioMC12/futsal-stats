import { computed, effect, inject, Injectable, Injector, signal } from '@angular/core';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { CloudFoundationService } from '../cloud/cloud-foundation.service';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import {
  toLocalMatchEventRecord,
  toLocalMatchRecord,
  toLocalPlayerProfileRecord,
  toLocalPlayerRecord,
  toLocalTeamRecord,
} from '../persistence/local/local-record-mappers';
import { enqueueSyncOperation, retryDelayMs } from './sync-queue';
import { operationLabel, SyncFailure, SyncOperation, SyncQueueRecord } from './sync-operation';
import { NetworkStatusService } from './network-status.service';
import { PermanentSyncError, RemoteSyncSnapshot, SyncRemoteGateway } from './sync-remote.gateway';

export type OfflineSyncState = 'disabled' | 'idle' | 'offline' | 'syncing' | 'error';

const MAX_ATTEMPTS = 5;

@Injectable()
export class OfflineSyncService {
  private readonly config = inject(CLOUD_CONFIG);
  private readonly cloud = inject(CloudFoundationService);
  private readonly db = inject(FutsalStatsDb);
  private readonly injector = inject(Injector);
  private readonly network = inject(NetworkStatusService);
  private running: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ready = signal(false);

  readonly state = signal<OfflineSyncState>(this.config.mode === 'cloud' ? 'idle' : 'disabled');
  readonly pendingCount = signal(0);
  readonly failedCount = signal(0);
  readonly failures = signal<readonly SyncFailure[]>([]);
  readonly error = signal<string | null>(null);
  readonly lastSyncedAt = signal<number | null>(null);
  readonly online = this.network.online.asReadonly();
  readonly hasProblems = computed(() => this.failedCount() > 0);
  readonly statusLabel = computed(() => {
    if (this.config.mode !== 'cloud') return 'Solo en este dispositivo';
    if (!this.online()) return `Sin conexión · ${this.pendingCount()} pendiente(s)`;
    if (this.state() === 'offline')
      return `Nube no disponible · ${this.pendingCount()} pendiente(s)`;
    if (this.state() === 'syncing') return 'Sincronizando…';
    if (this.failedCount() > 0) return `${this.failedCount()} error(es) de sincronización`;
    if (this.pendingCount() > 0) return `${this.pendingCount()} cambio(s) pendiente(s)`;
    if (this.state() === 'error') return 'No se pudo actualizar la caché';
    return 'Sincronizado';
  });

  constructor() {
    effect(() => {
      if (!this.ready() || this.config.mode !== 'cloud') return;
      if (this.online()) this.requestSync();
      else this.state.set('offline');
    });
  }

  async initialize(): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    await this.recoverUnqueuedChanges();
    await this.refreshSummary();
    this.ready.set(true);
    if (this.online()) await this.syncNow();
    else this.state.set('offline');
  }

  requestSync(): void {
    if (this.config.mode !== 'cloud' || !this.online()) {
      void this.refreshSummary();
      return;
    }
    queueMicrotask(() => void this.syncNow());
  }

  syncNow(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.runSync().finally(() => (this.running = null));
    return this.running;
  }

  async retryFailed(): Promise<void> {
    const now = Date.now();
    await this.db.transaction(
      'rw',
      [
        this.db.syncQueue,
        this.db.teams,
        this.db.players,
        this.db.playerProfiles,
        this.db.matches,
        this.db.events,
      ],
      async () => {
        const failed = await this.db.syncQueue.where('status').equals('failed').toArray();
        for (const item of failed) {
          await this.db.syncQueue.update(item.id, {
            status: 'pending',
            attempts: 0,
            nextAttemptAt: now,
            lastError: null,
            updatedAt: now,
          });
          await this.markOperation(item.operation, 'pending');
        }
      },
    );
    await this.refreshSummary();
    await this.syncNow();
  }

  private async runSync(): Promise<void> {
    this.clearRetryTimer();
    await this.refreshSummary();
    if (!this.online()) {
      this.state.set('offline');
      return;
    }
    if (this.cloud.status() !== 'connected') await this.cloud.initialize();
    if (this.cloud.status() !== 'connected') {
      this.state.set('offline');
      return;
    }

    this.state.set('syncing');
    this.error.set(null);
    let stoppedByFailure = false;
    while (this.online()) {
      const item = await this.nextReadyItem();
      if (!item) break;
      try {
        await this.remote.push(item.operation);
        await this.complete(item);
      } catch (error) {
        await this.fail(item, error);
        stoppedByFailure = true;
        break;
      }
    }

    await this.refreshSummary();
    if (!stoppedByFailure && this.pendingCount() === 0 && this.failedCount() === 0) {
      try {
        await this.cacheRemoteSnapshot(await this.remote.pull());
        this.lastSyncedAt.set(Date.now());
        this.state.set('idle');
      } catch (error) {
        this.error.set(errorMessage(error));
        this.state.set('error');
      }
    } else {
      this.state.set(this.failedCount() > 0 ? 'error' : this.online() ? 'idle' : 'offline');
    }
    await this.scheduleNextAttempt();
  }

  private async nextReadyItem(): Promise<SyncQueueRecord | undefined> {
    const now = Date.now();
    return this.db.syncQueue
      .where('[status+nextAttemptAt]')
      .between(['pending', 0], ['pending', now])
      .sortBy('createdAt')
      .then((items) => items[0]);
  }

  private async complete(item: SyncQueueRecord): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.syncQueue,
        this.db.teams,
        this.db.players,
        this.db.playerProfiles,
        this.db.matches,
        this.db.events,
      ],
      async () => {
        const current = await this.db.syncQueue.get(item.id);
        if (!current || current.updatedAt !== item.updatedAt) return;
        await this.markOperation(item.operation, 'synced');
        await this.db.syncQueue.delete(item.id);
      },
    );
  }

  private async fail(item: SyncQueueRecord, error: unknown): Promise<void> {
    const attempts = item.attempts + 1;
    const permanent = isPermanent(error) || attempts >= MAX_ATTEMPTS;
    const now = Date.now();
    const message = errorMessage(error);
    this.error.set(message);
    await this.db.transaction(
      'rw',
      [
        this.db.syncQueue,
        this.db.teams,
        this.db.players,
        this.db.playerProfiles,
        this.db.matches,
        this.db.events,
      ],
      async () => {
        const current = await this.db.syncQueue.get(item.id);
        if (!current || current.updatedAt !== item.updatedAt) return;
        await this.db.syncQueue.update(item.id, {
          status: permanent ? 'failed' : 'pending',
          attempts,
          nextAttemptAt: permanent ? now : now + retryDelayMs(attempts),
          lastError: message,
          updatedAt: now,
        });
        await this.markOperation(item.operation, permanent ? 'failed' : 'pending');
      },
    );
  }

  private async markOperation(
    operation: SyncOperation,
    status: 'pending' | 'synced' | 'failed',
  ): Promise<void> {
    switch (operation.kind) {
      case 'team-upsert':
        await this.db.teams.update(operation.entityId, { syncStatus: status });
        return;
      case 'player-upsert':
        await this.db.players.update(operation.entityId, { syncStatus: status });
        return;
      case 'player-profile-upsert':
        await this.db.playerProfiles.update(operation.entityId, { syncStatus: status });
        return;
      case 'match-upsert':
        await this.db.matches.update(operation.entityId, { syncStatus: status });
        return;
      case 'match-events-commit':
        await this.db.matches.update(operation.entityId, { syncStatus: status });
        await this.db.events.bulkUpdate(
          operation.events.map((event) => ({ key: event.id, changes: { syncStatus: status } })),
        );
        return;
      case 'match-delete':
        return;
    }
  }

  private async recoverUnqueuedChanges(): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.teams,
        this.db.players,
        this.db.playerProfiles,
        this.db.matches,
        this.db.events,
        this.db.syncQueue,
      ],
      async () => {
        const existingKeys = new Set(
          (await this.db.syncQueue.toArray()).map((item) => item.dedupeKey),
        );
        for (const record of await this.db.teams.where('syncStatus').equals('pending').toArray()) {
          if (!existingKeys.has(`team:${record.id}`)) {
            const { deletedAt: _, revision: __, syncStatus: ___, ...team } = record;
            await enqueueSyncOperation(this.db.syncQueue, {
              kind: 'team-upsert',
              teamId: team.id,
              entityId: team.id,
              team,
            });
          }
        }
        for (const record of await this.db.players
          .where('syncStatus')
          .equals('pending')
          .toArray()) {
          if (!existingKeys.has(`player:${record.id}`)) {
            const {
              createdAt: _,
              updatedAt: __,
              deletedAt: ___,
              revision: ____,
              syncStatus: _____,
              ...player
            } = record;
            await enqueueSyncOperation(this.db.syncQueue, {
              kind: 'player-upsert',
              teamId: player.teamId,
              entityId: player.id,
              player,
            });
          }
        }
        for (const record of await this.db.playerProfiles
          .where('syncStatus')
          .equals('pending')
          .toArray()) {
          if (!existingKeys.has(`player-profile:${record.playerId}`)) {
            const { deletedAt: _, revision: __, syncStatus: ___, ...profile } = record;
            await enqueueSyncOperation(this.db.syncQueue, {
              kind: 'player-profile-upsert',
              teamId: profile.teamId,
              entityId: profile.playerId,
              profile,
            });
          }
        }
        for (const record of await this.db.matches
          .where('syncStatus')
          .equals('pending')
          .toArray()) {
          const eventRecords = await this.db.events.where('matchId').equals(record.id).toArray();
          const pendingEvents = eventRecords.filter((event) => event.syncStatus === 'pending');
          const { deletedAt: _, revision: __, syncStatus: ___, ...match } = record;
          if (pendingEvents.length > 0 && !existingKeys.has(`match-events:${record.id}`)) {
            const events = pendingEvents.map(
              ({
                createdAt: _a,
                updatedAt: _b,
                deletedAt: _c,
                revision: _d,
                syncStatus: _e,
                ...event
              }) => event,
            );
            await enqueueSyncOperation(this.db.syncQueue, {
              kind: 'match-events-commit',
              teamId: match.teamId,
              entityId: match.id,
              match,
              events,
            });
          } else if (
            !existingKeys.has(`match:${record.id}`) &&
            !existingKeys.has(`match-events:${record.id}`)
          ) {
            await enqueueSyncOperation(this.db.syncQueue, {
              kind: 'match-upsert',
              teamId: match.teamId,
              entityId: match.id,
              match,
              createOnly: false,
            });
          }
        }
      },
    );
  }

  private async cacheRemoteSnapshot(snapshot: RemoteSyncSnapshot): Promise<void> {
    const now = Date.now();
    await this.db.transaction(
      'rw',
      this.db.teams,
      this.db.players,
      this.db.playerProfiles,
      this.db.matches,
      this.db.events,
      async () => {
        for (const team of snapshot.teams) {
          const local = await this.db.teams.get(team.id);
          if (local && local.syncStatus !== 'synced') continue;
          await this.db.teams.put({ ...toLocalTeamRecord(team, local), syncStatus: 'synced' });
        }
        for (const player of snapshot.players) {
          const local = await this.db.players.get(player.id);
          if (local && local.syncStatus !== 'synced') continue;
          await this.db.players.put({
            ...toLocalPlayerRecord(player, now, local),
            syncStatus: 'synced',
          });
        }
        for (const profile of snapshot.profiles) {
          const local = await this.db.playerProfiles.get(profile.playerId);
          if (local && local.syncStatus !== 'synced') continue;
          await this.db.playerProfiles.put({
            ...toLocalPlayerProfileRecord(profile, local),
            syncStatus: 'synced',
          });
        }
        for (const match of snapshot.matches) {
          const local = await this.db.matches.get(match.id);
          if (local && local.syncStatus !== 'synced') continue;
          await this.db.matches.put({ ...toLocalMatchRecord(match, local), syncStatus: 'synced' });
        }
        for (const event of snapshot.events) {
          const local = await this.db.events.get(event.id);
          if (local && local.syncStatus !== 'synced') continue;
          await this.db.events.put({ ...toLocalMatchEventRecord(event), syncStatus: 'synced' });
        }
      },
    );
  }

  private async refreshSummary(): Promise<void> {
    const [pending, failed] = await Promise.all([
      this.db.syncQueue.where('status').equals('pending').count(),
      this.db.syncQueue.where('status').equals('failed').toArray(),
    ]);
    this.pendingCount.set(pending);
    this.failedCount.set(failed.length);
    this.failures.set(
      failed.map((item) => ({
        id: item.id,
        label: operationLabel(item.operation),
        message: item.lastError ?? 'Error de sincronización',
        attempts: item.attempts,
      })),
    );
  }

  private async scheduleNextAttempt(): Promise<void> {
    this.clearRetryTimer();
    if (!this.online() || this.failedCount() > 0) return;
    const next = await this.db.syncQueue.where('status').equals('pending').sortBy('nextAttemptAt');
    if (!next[0]) return;
    const delay = Math.max(0, next[0].nextAttemptAt - Date.now());
    this.retryTimer = setTimeout(() => void this.syncNow(), delay);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private get remote(): SyncRemoteGateway {
    return this.injector.get(SyncRemoteGateway);
  }
}

function isPermanent(error: unknown): boolean {
  if (error instanceof PermanentSyncError) return true;
  const candidate = error as { code?: string; status?: number } | null;
  const code = candidate?.code ?? '';
  const status = candidate?.status ?? 0;
  return (
    code === '42501' ||
    (/^2[23]/.test(code) && code !== '23505') ||
    [400, 401, 403, 404].includes(status)
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const candidate = error as { message?: unknown } | null;
  return typeof candidate?.message === 'string' ? candidate.message : 'Error de sincronización';
}
