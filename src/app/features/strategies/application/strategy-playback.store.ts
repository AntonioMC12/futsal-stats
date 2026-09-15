import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { createId } from '../../../core/utils/id';
import {
  addArrow,
  addSequence,
  createStrategy,
  duplicateSequence,
  interpolatePoint,
  movePiece,
  removeArrow,
  removeSequence,
  Strategy,
  StrategyRepository,
  TacticalArrow,
  TacticalPieceState,
  TacticalPoint,
  TacticalTool,
  updateTransitionDuration,
  updateArrowEndpoint,
} from '../domain/strategy';

export interface PlaybackSpeed {
  readonly label: string;
  readonly rate: number;
}
export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [
  { label: '0,5×', rate: 0.5 },
  { label: '1×', rate: 1 },
  { label: '1,5×', rate: 1.5 },
  { label: '2×', rate: 2 },
];
export type PlaybackStatus = 'idle' | 'playing' | 'paused';

@Injectable()
export class StrategyPlaybackStore {
  private readonly repository = inject(StrategyRepository);
  private readonly destroyRef = inject(DestroyRef);
  private frameId: number | null = null;
  private transitionStartedAt = 0;
  private elapsedBeforePause = 0;

  readonly strategies = signal<readonly Strategy[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectedStrategyId = signal<string | null>(null);
  readonly phaseIndex = signal(0);
  readonly status = signal<PlaybackStatus>('idle');
  readonly playbackRate = signal(1);
  readonly playbackPositions = signal<readonly TacticalPieceState[] | null>(null);
  readonly activeTool = signal<TacticalTool>('select');
  readonly selectedArrowId = signal<string | null>(null);
  readonly selectedPieceId = signal<string | null>(null);
  readonly dirty = signal(false);
  readonly saveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');

  readonly playing = computed(() => this.status() === 'playing');
  readonly editingLocked = computed(() => this.status() !== 'idle');
  readonly selectedStrategy = computed(
    () => this.strategies().find((strategy) => strategy.id === this.selectedStrategyId()) ?? null,
  );
  readonly currentPhase = computed(
    () => this.selectedStrategy()?.phases[this.phaseIndex()] ?? null,
  );
  readonly renderedPieces = computed(
    () => this.playbackPositions() ?? this.currentPhase()?.pieces ?? [],
  );
  readonly canGoPrevious = computed(() => this.phaseIndex() > 0);
  readonly canGoNext = computed(
    () => this.phaseIndex() < (this.selectedStrategy()?.phases.length ?? 1) - 1,
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelFrame());
  }

  async load(teamId: string): Promise<void> {
    this.stop();
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

  create(teamId: string, players: readonly { id: string; number: number; name: string }[]): void {
    const strategy = createStrategy(teamId, players, createId);
    this.strategies.update((items) => [...items, strategy]);
    this.selectStrategy(strategy.id);
    this.markDirty();
  }
  selectStrategy(id: string | null): void {
    this.stop();
    this.selectedStrategyId.set(id);
    this.phaseIndex.set(0);
    this.selectedArrowId.set(null);
    this.selectedPieceId.set(null);
    this.dirty.set(false);
    this.saveState.set('idle');
  }
  selectPhase(index: number): void {
    const strategy = this.selectedStrategy();
    if (!strategy || index < 0 || index >= strategy.phases.length) return;
    this.stop();
    this.phaseIndex.set(index);
    this.selectedArrowId.set(null);
    this.selectedPieceId.set(null);
  }
  previous(): void {
    this.stop();
    this.phaseIndex.update((index) => Math.max(0, index - 1));
  }
  next(): void {
    this.stop();
    this.phaseIndex.update((index) =>
      Math.min((this.selectedStrategy()?.phases.length ?? 1) - 1, index + 1),
    );
  }
  setTool(tool: TacticalTool): void {
    if (this.editingLocked()) return;
    this.activeTool.set(tool);
    if (tool !== 'select' && tool !== 'delete') this.selectedArrowId.set(null);
  }
  selectArrow(id: string | null): void {
    if (!this.editingLocked()) {
      this.selectedArrowId.set(id);
      if (id) this.selectedPieceId.set(null);
    }
  }
  selectPiece(id: string | null): void {
    if (!this.editingLocked()) {
      this.selectedPieceId.set(id);
      if (id) this.selectedArrowId.set(null);
    }
  }

  updatePiece(pieceId: string, position: TacticalPoint): void {
    this.apply((strategy) => movePiece(strategy, this.phaseIndex(), pieceId, position));
  }
  createArrow(arrow: Omit<TacticalArrow, 'id'>): void {
    this.apply((strategy) => addArrow(strategy, this.phaseIndex(), { ...arrow, id: createId() }));
  }
  deleteSelectedArrow(): void {
    const id = this.selectedArrowId();
    if (!id) return;
    this.apply((strategy) => removeArrow(strategy, this.phaseIndex(), id));
    this.selectedArrowId.set(null);
  }
  moveArrowEndpoint(arrowId: string, endpoint: 'from' | 'to', position: TacticalPoint): void {
    this.apply((strategy) =>
      updateArrowEndpoint(strategy, this.phaseIndex(), arrowId, endpoint, position),
    );
  }
  appendSequence(): void {
    const index = this.phaseIndex();
    this.apply((strategy) => addSequence(strategy, index, createId));
    this.phaseIndex.set(index + 1);
  }
  cloneSequence(): void {
    const index = this.phaseIndex();
    this.apply((strategy) => duplicateSequence(strategy, index, createId));
    this.phaseIndex.set(index + 1);
  }
  deleteSequence(): void {
    const strategy = this.selectedStrategy();
    if (!strategy || strategy.phases.length <= 1) return;
    const index = this.phaseIndex();
    this.apply((item) => removeSequence(item, index));
    this.phaseIndex.set(Math.max(0, index - 1));
  }
  setDuration(durationMs: number): void {
    this.apply((strategy) => updateTransitionDuration(strategy, this.phaseIndex(), durationMs));
  }
  updateMetadata(field: 'name' | 'description', value: string): void {
    this.apply((strategy) => ({ ...strategy, [field]: value }));
  }

  async save(): Promise<void> {
    const strategy = this.selectedStrategy();
    if (!strategy) return;
    const name = strategy.name.trim().slice(0, 80);
    if (!name) {
      this.saveState.set('error');
      return;
    }
    this.saveState.set('saving');
    const updated = {
      ...strategy,
      name,
      description: strategy.description.trim(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.repository.save(updated);
      this.replace(updated);
      this.dirty.set(false);
      this.saveState.set('saved');
    } catch {
      this.saveState.set('error');
    }
  }

  async deleteStrategy(id: string): Promise<void> {
    await this.repository.delete(id);
    this.strategies.update((items) => items.filter((item) => item.id !== id));
    if (this.selectedStrategyId() === id) this.selectStrategy(this.strategies()[0]?.id ?? null);
  }

  togglePlayback(): void {
    this.status() === 'playing' ? this.pause() : this.play();
  }
  play(): void {
    const strategy = this.selectedStrategy();
    if (!strategy || strategy.phases.length < 2 || this.status() === 'playing') return;
    if (this.status() === 'idle' && this.phaseIndex() >= strategy.phases.length - 1)
      this.phaseIndex.set(0);
    this.status.set('playing');
    this.transitionStartedAt = performance.now();
    this.scheduleFrame();
  }
  pause(): void {
    if (this.status() !== 'playing') return;
    this.elapsedBeforePause += (performance.now() - this.transitionStartedAt) * this.playbackRate();
    this.status.set('paused');
    this.cancelFrame();
  }
  stop(): void {
    this.status.set('idle');
    this.cancelFrame();
    this.playbackPositions.set(null);
    this.elapsedBeforePause = 0;
  }
  restart(): void {
    this.stop();
    this.phaseIndex.set(0);
  }
  setSpeed(rate: number): void {
    if (!PLAYBACK_SPEEDS.some((speed) => speed.rate === rate)) return;
    if (this.status() === 'playing') {
      this.elapsedBeforePause +=
        (performance.now() - this.transitionStartedAt) * this.playbackRate();
      this.transitionStartedAt = performance.now();
    }
    this.playbackRate.set(rate);
  }

  private apply(operation: (strategy: Strategy) => Strategy): void {
    if (this.editingLocked()) return;
    const strategy = this.selectedStrategy();
    if (!strategy) return;
    this.replace(operation(strategy));
    this.markDirty();
  }
  private replace(strategy: Strategy): void {
    this.strategies.update((items) =>
      items.map((item) => (item.id === strategy.id ? strategy : item)),
    );
  }
  private markDirty(): void {
    this.dirty.set(true);
    this.saveState.set('idle');
  }
  private scheduleFrame(): void {
    this.cancelFrame();
    this.frameId = requestAnimationFrame((now) => this.onFrame(now));
  }
  private onFrame(now: number): void {
    if (this.status() !== 'playing') return;
    const strategy = this.selectedStrategy();
    const from = strategy?.phases[this.phaseIndex()];
    const to = strategy?.phases[this.phaseIndex() + 1];
    if (!strategy || !from || !to) {
      this.stop();
      return;
    }
    const elapsed =
      this.elapsedBeforePause + (now - this.transitionStartedAt) * this.playbackRate();
    const reducedMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const progress = reducedMotion ? 1 : Math.min(1, elapsed / from.durationMs);
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    const targetById = new Map(to.pieces.map((piece) => [piece.pieceId, piece]));
    this.playbackPositions.set(
      from.pieces.map((piece) => ({
        ...piece,
        position: interpolatePoint(
          piece.position,
          targetById.get(piece.pieceId)?.position ?? piece.position,
          eased,
        ),
      })),
    );
    if (progress >= 1) {
      this.phaseIndex.update((index) => index + 1);
      this.playbackPositions.set(null);
      this.elapsedBeforePause = 0;
      this.transitionStartedAt = now;
      if (this.phaseIndex() >= strategy.phases.length - 1) {
        this.status.set('idle');
        this.frameId = null;
        return;
      }
    }
    this.scheduleFrame();
  }
  private cancelFrame(): void {
    if (this.frameId === null) return;
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }
}
