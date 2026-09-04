import { Component, computed, input, output } from '@angular/core';
import { Strategy, StrategyPhase } from '../../domain/strategy';
@Component({
  selector: 'app-tactical-inspector',
  templateUrl: './tactical-inspector.html',
  styleUrl: './tactical-inspector.scss',
})
export class TacticalInspector {
  readonly strategy = input.required<Strategy>();
  readonly phase = input.required<StrategyPhase>();
  readonly selectedPieceId = input<string | null>(null);
  readonly selectedArrowId = input<string | null>(null);
  readonly disabled = input(false);
  readonly durationChanged = output<number>();
  readonly arrowDeleted = output<void>();
  protected readonly piece = computed(
    () => this.phase().pieces.find(({ pieceId }) => pieceId === this.selectedPieceId()) ?? null,
  );
  protected readonly arrow = computed(
    () => this.phase().arrows.find(({ id }) => id === this.selectedArrowId()) ?? null,
  );
  protected duration(event: Event): number {
    return Number((event.target as HTMLInputElement).value) * 1000;
  }
}
