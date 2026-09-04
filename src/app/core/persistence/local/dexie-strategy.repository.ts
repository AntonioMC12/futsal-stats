import { Injectable } from '@angular/core';
import { RAVI_STRATEGY } from '../../../features/strategies/data/ravi.strategy';
import { Strategy, StrategyRepository } from '../../../features/strategies/domain/strategy';
import { FutsalStatsDb } from './futsal-stats.db';

@Injectable()
export class DexieStrategyRepository extends StrategyRepository {
  constructor(private readonly db: FutsalStatsDb) {
    super();
  }
  override async list(teamId: string): Promise<readonly Strategy[]> {
    const stored = await this.db.strategies.where('teamId').equals(teamId).toArray();
    return teamId === RAVI_STRATEGY.teamId && !stored.some(({ id }) => id === RAVI_STRATEGY.id)
      ? [RAVI_STRATEGY, ...stored]
      : stored;
  }
  override get(id: string): Promise<Strategy | undefined> {
    return this.db.strategies
      .get(id)
      .then((stored) => stored ?? (id === RAVI_STRATEGY.id ? RAVI_STRATEGY : undefined));
  }
  override async save(strategy: Strategy): Promise<void> {
    await this.db.strategies.put(strategy);
  }
  override async delete(id: string): Promise<void> {
    await this.db.strategies.delete(id);
  }
}
