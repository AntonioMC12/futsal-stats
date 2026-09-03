import { Component, HostListener, inject } from '@angular/core';
import { PLAYBACK_SPEEDS, StrategyPlaybackStore } from '../../application/strategy-playback.store';
import { LocalStrategyRepository } from '../../data/local-strategy.repository';
import { StrategyRepository } from '../../domain/strategy';
import { StrategyControls } from '../strategy-controls/strategy-controls';
import { StrategyList } from '../strategy-list/strategy-list';
import { StrategyPhasePanel } from '../strategy-phase-panel/strategy-phase-panel';
import { TacticalBoard } from '../tactical-board/tactical-board';

@Component({
  selector: 'app-strategies-page',
  imports: [StrategyList, TacticalBoard, StrategyControls, StrategyPhasePanel],
  providers: [
    StrategyPlaybackStore,
    { provide: StrategyRepository, useClass: LocalStrategyRepository },
  ],
  templateUrl: './strategies-page.html',
  styleUrl: './strategies-page.scss',
})
export class StrategiesPage {
  protected readonly store = inject(StrategyPlaybackStore);
  protected readonly speeds = PLAYBACK_SPEEDS;

  constructor() {
    void this.store.load();
  }

  protected retry(): void {
    void this.store.load();
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeyboard(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.isInteractiveTarget(event.target)) return;

    if (event.key === 'ArrowRight' && this.store.canGoNext()) {
      event.preventDefault();
      this.store.next();
    } else if (event.key === 'ArrowLeft' && this.store.canGoPrevious()) {
      event.preventDefault();
      this.store.previous();
    } else if (event.key === ' ') {
      event.preventDefault();
      this.store.togglePlayback();
    }
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest('button, a, input, select, textarea, [contenteditable="true"]') !== null
    );
  }
}
