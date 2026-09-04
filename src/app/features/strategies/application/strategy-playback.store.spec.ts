import { TestBed } from '@angular/core/testing';
import { RAVI_STRATEGY } from '../data/ravi.strategy';
import { StrategyRepository } from '../domain/strategy';
import { StrategyPlaybackStore } from './strategy-playback.store';

describe('StrategyPlaybackStore', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  function createStore(repository: Partial<StrategyRepository> = {}): StrategyPlaybackStore {
    TestBed.configureTestingModule({
      providers: [
        StrategyPlaybackStore,
        {
          provide: StrategyRepository,
          useValue: {
            list: async () => [RAVI_STRATEGY],
            get: async () => RAVI_STRATEGY,
            ...repository,
          },
        },
      ],
    });
    return TestBed.inject(StrategyPlaybackStore);
  }

  it('loads the strategy at phase zero and keeps manual navigation within bounds', async () => {
    const store = createStore();
    await store.load();

    expect(store.selectedStrategy()).toBe(RAVI_STRATEGY);
    expect(store.phaseIndex()).toBe(0);
    expect(store.currentPhase()?.title).toBe('Colocación inicial');

    store.previous();
    expect(store.phaseIndex()).toBe(0);
    store.next();
    expect(store.phaseIndex()).toBe(1);
    store.selectPhase(4);
    expect(store.phaseIndex()).toBe(4);
    store.next();
    expect(store.phaseIndex()).toBe(4);
    store.selectPhase(10);
    expect(store.phaseIndex()).toBe(4);
  });

  it('autoplays, pauses, restarts from the last phase and applies speed changes once', async () => {
    vi.useFakeTimers();
    const store = createStore();
    await store.load();

    store.play();
    expect(store.playing()).toBe(true);
    await vi.advanceTimersByTimeAsync(1_350);
    expect(store.phaseIndex()).toBe(1);

    store.setSpeed(650);
    await vi.advanceTimersByTimeAsync(650);
    expect(store.phaseIndex()).toBe(2);
    store.pause();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.phaseIndex()).toBe(2);

    store.selectPhase(4);
    store.play();
    expect(store.phaseIndex()).toBe(0);
    await vi.advanceTimersByTimeAsync(650);
    expect(store.phaseIndex()).toBe(1);
  });

  it('cleans up its playback timer when destroyed', async () => {
    vi.useFakeTimers();
    const store = createStore();
    await store.load();
    store.setSpeed(650);
    store.play();

    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.phaseIndex()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('represents empty and error repository states', async () => {
    const emptyStore = createStore({ list: async () => [] });
    await emptyStore.load();
    expect(emptyStore.loading()).toBe(false);
    expect(emptyStore.strategies()).toEqual([]);
    expect(emptyStore.selectedStrategy()).toBeNull();

    TestBed.resetTestingModule();
    const errorStore = createStore({
      list: async () => {
        throw new Error('offline');
      },
    });
    await errorStore.load();
    expect(errorStore.error()).toContain('No se han podido cargar');
    expect(errorStore.loading()).toBe(false);
  });
});
