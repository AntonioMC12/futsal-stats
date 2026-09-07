import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { StrategyPlaybackStore } from '../../application/strategy-playback.store';
import { StrategyWorkspaceContext } from '../../application/strategy-workspace.context';

@Component({
  selector: 'app-strategies-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  providers: [StrategyPlaybackStore, StrategyWorkspaceContext],
  templateUrl: './strategies-page.html',
  styleUrl: './strategies-page.scss',
})
export class StrategiesPage {
  protected readonly store = inject(StrategyPlaybackStore);
  protected readonly context = inject(StrategyWorkspaceContext);
  constructor() {
    void this.context.initialize();
  }

  protected async changeTeam(event: Event): Promise<void> {
    if (!this.confirmDiscard()) {
      (event.target as HTMLSelectElement).value = this.context.teamId();
      return;
    }
    await this.context.selectTeam((event.target as HTMLSelectElement).value);
  }
  protected guardNavigation(event: MouseEvent): void {
    if (!this.confirmDiscard()) event.preventDefault();
  }
  private confirmDiscard(): boolean {
    return (
      !this.store.dirty() || confirm('Hay cambios sin guardar. ¿Quieres salir sin guardarlos?')
    );
  }
}
