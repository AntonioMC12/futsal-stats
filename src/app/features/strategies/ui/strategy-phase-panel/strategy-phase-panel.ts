import { Component, input, output } from '@angular/core';
import { Strategy, StrategyPhase } from '../../domain/strategy';

@Component({
  selector: 'app-strategy-phase-panel',
  templateUrl: './strategy-phase-panel.html',
  styleUrl: './strategy-phase-panel.scss',
})
export class StrategyPhasePanel {
  readonly strategy = input.required<Strategy>();
  readonly phase = input.required<StrategyPhase>();
  readonly phaseIndex = input.required<number>();
  readonly phaseSelected = output<number>();
}
