import { Component, input, output } from '@angular/core';
import { PlaybackSpeed } from '../../application/strategy-playback.store';
import { StrategyPhase } from '../../domain/strategy';

@Component({
  selector: 'app-strategy-controls',
  templateUrl: './strategy-controls.html',
  styleUrl: './strategy-controls.scss',
})
export class StrategyControls {
  readonly phases = input.required<readonly StrategyPhase[]>();
  readonly phaseIndex = input.required<number>();
  readonly playing = input.required<boolean>();
  readonly intervalMs = input.required<number>();
  readonly speeds = input.required<readonly PlaybackSpeed[]>();

  readonly playbackToggled = output<void>();
  readonly previousRequested = output<void>();
  readonly nextRequested = output<void>();
  readonly phaseSelected = output<number>();
  readonly speedSelected = output<number>();

  protected changeSpeed(event: Event): void {
    this.speedSelected.emit(Number((event.target as HTMLSelectElement).value));
  }
}
