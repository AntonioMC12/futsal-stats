import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PLAYBACK_SPEEDS, StrategyPlaybackStore } from '../../application/strategy-playback.store';
import { StrategyWorkspaceContext } from '../../application/strategy-workspace.context';
import { filterAndSortStrategies } from '../../domain/strategy-library';
import { StrategyControls } from '../strategy-controls/strategy-controls';
import { StrategyList } from '../strategy-list/strategy-list';
import { TacticalBoard } from '../tactical-board/tactical-board';

@Component({
  selector: 'app-strategy-library-page',
  imports: [StrategyList, TacticalBoard, StrategyControls],
  templateUrl: './strategy-library-page.html',
  styleUrl: './strategy-library-page.scss',
})
export class StrategyLibraryPage {
  protected readonly store = inject(StrategyPlaybackStore);
  protected readonly context = inject(StrategyWorkspaceContext);
  protected readonly query = signal('');
  protected readonly category = signal('');
  protected readonly viewerOpen = signal(false);
  protected readonly speeds = PLAYBACK_SPEEDS;
  private readonly router = inject(Router);
  protected readonly categories = computed(() =>
    [...new Set(this.store.strategies().map(({ category }) => category))].sort(),
  );
  protected readonly strategies = computed(() =>
    filterAndSortStrategies(this.store.strategies(), this.query()).filter(
      ({ category }) => !this.category() || category === this.category(),
    ),
  );
  protected search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  protected filter(event: Event): void {
    this.category.set((event.target as HTMLSelectElement).value);
  }
  protected async create(): Promise<void> {
    const id = this.context.createStrategy();
    await this.router.navigate(['/strategies/designer', id]);
  }
  protected async edit(id: string): Promise<void> {
    this.store.selectStrategy(id);
    await this.router.navigate(['/strategies/designer', id]);
  }
  protected play(id: string): void {
    this.store.selectStrategy(id);
    this.viewerOpen.set(true);
    this.store.play();
  }
  protected closeViewer(): void {
    this.store.stop();
    this.viewerOpen.set(false);
  }
}
