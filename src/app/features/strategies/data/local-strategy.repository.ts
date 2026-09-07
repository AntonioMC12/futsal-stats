import { Injectable } from '@angular/core';
import { Strategy, StrategyRepository } from '../domain/strategy';
import { RAVI_STRATEGY } from './ravi.strategy';

@Injectable()
export class LocalStrategyRepository extends StrategyRepository {
  private strategies: readonly Strategy[] = [RAVI_STRATEGY];

  override async list(teamId: string): Promise<readonly Strategy[]> {
    return this.strategies.filter((strategy) => strategy.teamId === teamId);
  }

  override async get(id: string): Promise<Strategy | undefined> {
    return this.strategies.find((strategy) => strategy.id === id);
  }

  override async save(strategy: Strategy): Promise<void> {
    this.strategies = this.strategies.some(({ id }) => id === strategy.id)
      ? this.strategies.map((item) => (item.id === strategy.id ? strategy : item))
      : [...this.strategies, strategy];
  }

  override async delete(id: string): Promise<void> {
    this.strategies = this.strategies.filter((strategy) => strategy.id !== id);
  }
}
