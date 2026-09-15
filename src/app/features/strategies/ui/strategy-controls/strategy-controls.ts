import { Component, input, output } from '@angular/core';
import { PlaybackSpeed, PlaybackStatus } from '../../application/strategy-playback.store';
import { StrategyPhase } from '../../domain/strategy';
@Component({
  selector: 'app-strategy-controls',
  templateUrl: './strategy-controls.html',
  styleUrl: './strategy-controls.scss',
})
export class StrategyControls {
  readonly phases = input.required<readonly StrategyPhase[]>();
  readonly phaseIndex = input.required<number>();
  readonly status = input.required<PlaybackStatus>();
  readonly playbackRate = input.required<number>();
  readonly speeds = input.required<readonly PlaybackSpeed[]>();
  readonly readonly = input(false);
  readonly playbackToggled = output<void>();
  readonly stopped = output<void>();
  readonly restarted = output<void>();
  readonly previousRequested = output<void>();
  readonly nextRequested = output<void>();
  readonly phaseSelected = output<number>();
  readonly speedSelected = output<number>();
  readonly sequenceAdded = output<void>();
  readonly sequenceDuplicated = output<void>();
  readonly sequenceDeleted = output<void>();
  protected numberValue(event: Event): number {
    return Number((event.target as HTMLInputElement | HTMLSelectElement).value);
  }
}
