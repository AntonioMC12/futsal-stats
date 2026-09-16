import { inject, Injectable } from '@angular/core';
import { Strategy, StrategyRepository } from '../../features/strategies/domain/strategy';
import { DexieStrategyRepository } from '../persistence/local/dexie-strategy.repository';
import { LocalStrategyRecord } from '../persistence/local/local-records';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import { TeamAccessService } from '../team-workspace/team-access.service';
import { OfflineSyncService } from './offline-sync.service';
import { enqueueSyncOperation } from './sync-queue';

@Injectable()
export class OfflineStrategyRepository extends StrategyRepository {
  private readonly local = inject(DexieStrategyRepository);
  private readonly db = inject(FutsalStatsDb);
  private readonly access = inject(TeamAccessService);
  private readonly sync = inject(OfflineSyncService);

  override list(teamId: string): Promise<readonly Strategy[]> {
    return this.local.list(teamId);
  }

  override get(id: string): Promise<Strategy | undefined> {
    return this.local.get(id);
  }

  override async save(strategy: Strategy): Promise<void> {
    await this.access.assertCanWrite(strategy.teamId);
    await this.db.transaction('rw', this.db.strategies, this.db.syncQueue, async () => {
      await this.db.strategies.put({ ...strategy, syncStatus: 'pending', deletedAt: null });
      await enqueueSyncOperation(this.db.syncQueue, {
        kind: 'strategy-upsert',
        teamId: strategy.teamId,
        entityId: strategy.id,
        strategy,
      });
    });
    this.sync.requestSync();
  }

  override async delete(id: string): Promise<void> {
    const strategy = await this.local.get(id);
    if (!strategy) return;
    await this.access.assertCanWrite(strategy.teamId);
    await this.db.transaction('rw', this.db.strategies, this.db.syncQueue, async () => {
      const tombstone: LocalStrategyRecord = {
        ...strategy,
        deletedAt: new Date().toISOString(),
        syncStatus: 'pending',
      };
      await this.db.strategies.put(tombstone);
      await enqueueSyncOperation(this.db.syncQueue, {
        kind: 'strategy-delete',
        teamId: strategy.teamId,
        entityId: id,
      });
    });
    this.sync.requestSync();
  }
}
