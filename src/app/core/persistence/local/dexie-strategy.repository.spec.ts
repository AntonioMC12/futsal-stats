import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { RAVI_STRATEGY } from '../../../features/strategies/data/ravi.strategy';
import { DexieStrategyRepository } from './dexie-strategy.repository';
import { FutsalStatsDb } from './futsal-stats.db';

describe('DexieStrategyRepository', () => {
  afterEach(async () => {
    TestBed.inject(FutsalStatsDb).close();
    TestBed.resetTestingModule();
    await Dexie.delete('futsal-stats');
  });

  it('does not resurrect a deleted built-in strategy', async () => {
    await Dexie.delete('futsal-stats');
    TestBed.configureTestingModule({ providers: [FutsalStatsDb, DexieStrategyRepository] });
    const repository = TestBed.inject(DexieStrategyRepository);
    const db = TestBed.inject(FutsalStatsDb);
    expect(await repository.list(RAVI_STRATEGY.teamId)).toHaveLength(1);
    await db.strategies.put({ ...RAVI_STRATEGY, deletedAt: new Date().toISOString(), syncStatus: 'synced' });
    expect(await repository.list(RAVI_STRATEGY.teamId)).toHaveLength(0);
  });
});
