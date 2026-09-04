import { Component, input, output } from '@angular/core';
import { Strategy } from '../../domain/strategy';
import { StrategyCard } from '../strategy-card/strategy-card';

@Component({
  selector: 'app-strategy-list',
  imports: [StrategyCard],
  templateUrl: './strategy-list.html',
  styleUrl: './strategy-list.scss',
})
export class StrategyList {
  readonly strategies = input.required<readonly Strategy[]>();
  readonly selectedStrategyId = input<string | null>(null);
  readonly strategySelected = output<string>();
  readonly strategyPlayed = output<string>();
  readonly strategyEdited = output<string>();
}
