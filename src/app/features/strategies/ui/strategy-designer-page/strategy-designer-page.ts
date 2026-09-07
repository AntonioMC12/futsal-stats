import { Component, effect, HostListener, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PLAYBACK_SPEEDS, StrategyPlaybackStore } from '../../application/strategy-playback.store';
import { StrategyWorkspaceContext } from '../../application/strategy-workspace.context';
import { StrategyControls } from '../strategy-controls/strategy-controls';
import { TacticalBoard } from '../tactical-board/tactical-board';
import { TacticalInspector } from '../tactical-inspector/tactical-inspector';
import { TacticalToolbar } from '../tactical-toolbar/tactical-toolbar';

@Component({
  selector: 'app-strategy-designer-page',
  imports: [RouterLink, TacticalBoard, TacticalToolbar, TacticalInspector, StrategyControls],
  templateUrl: './strategy-designer-page.html',
  styleUrl: './strategy-designer-page.scss',
})
export class StrategyDesignerPage {
  readonly strategyId = input<string>();
  protected readonly store = inject(StrategyPlaybackStore);
  protected readonly context = inject(StrategyWorkspaceContext);
  protected readonly speeds = PLAYBACK_SPEEDS;
  protected readonly notFound = signal(false);
  protected readonly inspectorOpen = signal(false);
  private readonly router = inject(Router);
  constructor() {
    effect(() => {
      if (!this.context.ready()) return;
      const requested = this.strategyId();
      if (requested) {
        if (this.store.strategies().some(({ id }) => id === requested))
          this.store.selectStrategy(requested);
        else this.notFound.set(true);
      } else if (!this.store.selectedStrategy()) {
        this.context.createStrategy();
      }
    });
  }
  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  protected async createNew(): Promise<void> {
    if (this.store.dirty() && !confirm('Hay cambios sin guardar. ¿Crear otra jugada?')) return;
    const id = this.context.createStrategy();
    await this.router.navigate(['/strategies/designer', id]);
  }
  @HostListener('window:beforeunload', ['$event']) protected beforeUnload(
    event: BeforeUnloadEvent,
  ): void {
    if (this.store.dirty()) event.preventDefault();
  }
  @HostListener('document:keydown', ['$event']) protected shortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.store.save();
      return;
    }
    if (this.interactive(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'v') this.store.setTool('select');
    else if (key === 'm') this.store.setTool('movement');
    else if (key === 'p') this.store.setTool('pass');
    else if (event.key === ' ') {
      event.preventDefault();
      this.store.togglePlayback();
    } else if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.store.selectedArrowId()
    )
      this.store.deleteSelectedArrow();
  }
  private interactive(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest('input,textarea,select,button,a,[contenteditable="true"]') !== null
    );
  }
}
