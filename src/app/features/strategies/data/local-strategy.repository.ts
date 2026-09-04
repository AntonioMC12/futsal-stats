import { Injectable } from '@angular/core';
import { Strategy, StrategyRepository } from '../domain/strategy';
import { RAVI_STRATEGY } from './ravi.strategy';

@Injectable()
export class LocalStrategyRepository extends StrategyRepository {
  private readonly strategies: readonly Strategy[] = [RAVI_STRATEGY];

  override async list(_teamId?: string): Promise<readonly Strategy[]> {
    return this.strategies;
  }

  override async get(id: string): Promise<Strategy | undefined> {
    return this.strategies.find((strategy) => strategy.id === id);
  }
}
