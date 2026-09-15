import { Component, input, output } from '@angular/core';
import { Strategy } from '../../domain/strategy';
import { TacticalBoard } from '../tactical-board/tactical-board';
@Component({
  selector: 'app-strategy-card',
  imports: [TacticalBoard],
  templateUrl: './strategy-card.html',
  styleUrl: './strategy-card.scss',
})
export class StrategyCard {
  readonly strategy = input.required<Strategy>();
  readonly played = output<string>();
  readonly edited = output<string>();
  protected date(value: string): string {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }
}
