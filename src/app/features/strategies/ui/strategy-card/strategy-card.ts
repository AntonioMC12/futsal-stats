import { Component, input, output } from '@angular/core';
import { Strategy } from '../../domain/strategy';

@Component({
  selector: 'app-strategy-card',
  templateUrl: './strategy-card.html',
  styleUrl: './strategy-card.scss',
})
export class StrategyCard {
  readonly strategy = input.required<Strategy>();
  readonly active = input(false);
  readonly selected = output<string>();
}
