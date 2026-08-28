import { Component, computed, effect, HostListener, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatGameClock } from '../../../core/clock/match-clock';
import { LiveMatchStore } from '../application/live-match.store';

@Component({
  selector: 'app-live-match-page',
  imports: [RouterLink],
  providers: [LiveMatchStore],
  templateUrl: './live-match-page.html',
  styleUrl: './live-match-page.scss',
})
export class LiveMatchPage {
  protected readonly store = inject(LiveMatchStore);
  private readonly router = inject(Router);
  protected readonly selectedOutPlayerId = signal<string | null>(null);
  protected readonly substituting = signal(false);
  protected readonly confirmAbandon = signal(false);
  private substitutionTrigger: HTMLElement | null = null;
  readonly matchId = input.required<string>();
  protected readonly substitutionOutPlayer = computed(() =>
    this.store.currentLineup().find((player) => player.id === this.selectedOutPlayerId()),
  );
  protected readonly clockFabVisible = computed(() => {
    const match = this.store.match();
    return (
      match?.status === 'ready' ||
      ((match?.status === 'firstHalf' || match?.status === 'secondHalf') &&
        this.store.remainingMs() > 0)
    );
  });
  protected readonly clockFabLabel = computed(() =>
    this.store.clockRunning() ? 'Parar reloj' : 'Iniciar reloj',
  );
  protected readonly compactPeriodLabel = computed(() => {
    switch (this.store.match()?.status) {
      case 'ready':
        return 'Preparado';
      case 'firstHalf':
        return '1.ª parte';
      case 'halftime':
        return 'Descanso';
      case 'secondHalf':
        return '2.ª parte';
      case 'finished':
        return 'Finalizado';
      default:
        return '';
    }
  });

  constructor() {
    effect(() => void this.store.load(this.matchId()));
  }

  protected selectOutPlayer(playerId: string, event: Event): void {
    if (!this.store.canSubstitute()) {
      return;
    }
    this.substitutionTrigger = event.currentTarget as HTMLElement;
    this.selectedOutPlayerId.set(playerId);
  }

  protected async substituteWith(inPlayerId: string): Promise<void> {
    const outPlayerId = this.selectedOutPlayerId();
    if (!outPlayerId || this.substituting()) {
      return;
    }

    this.substituting.set(true);
    try {
      if (await this.store.makeSubstitution(outPlayerId, inPlayerId)) {
        this.cancelSubstitution();
      }
    } finally {
      this.substituting.set(false);
    }
  }

  protected cancelSubstitution(): void {
    this.selectedOutPlayerId.set(null);
    const trigger = this.substitutionTrigger;
    this.substitutionTrigger = null;
    queueMicrotask(() => trigger?.focus());
  }

  protected toggleClock(): void {
    if (this.store.saving()) {
      return;
    }
    if (this.store.clockRunning()) {
      void this.store.stopClock();
    } else {
      void this.store.startClock();
    }
  }

  @HostListener('document:keydown.escape')
  protected closeSubstitutionOnEscape(): void {
    if (this.selectedOutPlayerId() && !this.substituting()) {
      this.cancelSubstitution();
    }
  }

  protected async abandonMatch(): Promise<void> {
    if (await this.store.deleteCurrentMatch()) {
      this.cancelSubstitution();
      this.confirmAbandon.set(false);
      await this.router.navigate(['/matches']);
    }
  }

  protected formatDuration(durationMs: number): string {
    return formatGameClock(durationMs);
  }

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }

  protected lineupPlayers(playerIds: readonly string[]): string {
    const playersById = new Map(this.store.players().map((player) => [player.id, player]));
    return playerIds
      .map((playerId) => playersById.get(playerId))
      .filter((player) => player !== undefined)
      .map((player) => `#${player.number} ${player.name}`)
      .join(' · ');
  }
}
