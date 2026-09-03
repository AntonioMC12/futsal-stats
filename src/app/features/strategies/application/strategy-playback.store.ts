import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Strategy, StrategyRepository } from '../domain/strategy';

export interface PlaybackSpeed {
  readonly label: string;
  readonly intervalMs: number;
}

export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [
  { label: '0,75×', intervalMs: 1_800 },
  { label: '1×', intervalMs: 1_350 },
  { label: '1,5×', intervalMs: 900 },
  { label: '2×', intervalMs: 650 },
];

@Injectable()
export class StrategyPlaybackStore {
  private readonly repository = inject(StrategyRepository);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly strategies = signal<readonly Strategy[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectedStrategyId = signal<string | null>(null);
  readonly phaseIndex = signal(0);
  readonly playing = signal(false);
  readonly intervalMs = signal(PLAYBACK_SPEEDS[1]!.intervalMs);

  readonly selectedStrategy = computed(
    () => this.strategies().find((strategy) => strategy.id === this.selectedStrategyId()) ?? null,
  );
  readonly currentPhase = computed(
    () => this.selectedStrategy()?.phases[this.phaseIndex()] ?? null,
  );
  readonly canGoPrevious = computed(() => this.phaseIndex() > 0);
  readonly canGoNext = computed(() => {
    const strategy = this.selectedStrategy();
    return strategy !== null && this.phaseIndex() < strategy.phases.length - 1;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  async load(teamId?: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const strategies = await this.repository.list(teamId);
      this.strategies.set(strategies);
      this.selectStrategy(strategies[0]?.id ?? null);
    } catch {
      this.strategies.set([]);
      this.selectedStrategyId.set(null);
      this.error.set('No se han podido cargar las estrategias.');
    } finally {
      this.loading.set(false);
    }
  }

  selectStrategy(strategyId: string | null): void {
    this.pause();
    this.selectedStrategyId.set(strategyId);
    this.phaseIndex.set(0);
  }

  selectPhase(index: number): void {
    const strategy = this.selectedStrategy();
    if (!strategy || index < 0 || index >= strategy.phases.length) return;
    this.pause();
    this.phaseIndex.set(index);
  }

  previous(): void {
    this.pause();
    this.phaseIndex.update((index) => Math.max(0, index - 1));
  }

  next(): void {
    this.pause();
    const lastIndex = Math.max(0, (this.selectedStrategy()?.phases.length ?? 1) - 1);
    this.phaseIndex.update((index) => Math.min(lastIndex, index + 1));
  }

  togglePlayback(): void {
    if (this.playing()) this.pause();
    else this.play();
  }

  play(): void {
    const strategy = this.selectedStrategy();
    if (!strategy || strategy.phases.length === 0 || this.playing()) return;
    if (this.phaseIndex() === strategy.phases.length - 1) this.phaseIndex.set(0);
    this.playing.set(true);
    this.startTimer();
  }

  pause(): void {
    this.playing.set(false);
    this.stopTimer();
  }

  setSpeed(intervalMs: number): void {
    if (!PLAYBACK_SPEEDS.some((speed) => speed.intervalMs === intervalMs)) return;
    this.intervalMs.set(intervalMs);
    if (this.playing()) this.startTimer();
  }

  private advancePlayback(): void {
    const strategy = this.selectedStrategy();
    if (!strategy) {
      this.pause();
      return;
    }
    if (this.phaseIndex() >= strategy.phases.length - 1) {
      this.pause();
      return;
    }
    this.phaseIndex.update((index) => index + 1);
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => this.advancePlayback(), this.intervalMs());
  }

  private stopTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
