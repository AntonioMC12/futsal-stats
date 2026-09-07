import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APAGA_TEAM_ID } from '../../../core/initialization/built-in-teams';
import { LocalStrategyRepository } from '../data/local-strategy.repository';
import { StrategyRepository } from '../domain/strategy';
import { StrategyPlaybackStore } from './strategy-playback.store';
describe('StrategyPlaybackStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });
  function store(): StrategyPlaybackStore {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StrategyPlaybackStore,
        { provide: StrategyRepository, useClass: LocalStrategyRepository },
      ],
    });
    return TestBed.inject(StrategyPlaybackStore);
  }
  it('loads, navigates and edits immutable sequence state', async () => {
    const subject = store();
    await subject.load(APAGA_TEAM_ID);
    const before = subject.currentPhase()!.pieces[0]!.position;
    subject.updatePiece(subject.currentPhase()!.pieces[0]!.pieceId, { x: 0.1, y: 0.2 });
    expect(subject.currentPhase()!.pieces[0]!.position).toEqual({ x: 0.1, y: 0.2 });
    expect(before).not.toEqual({ x: 0.1, y: 0.2 });
    subject.appendSequence();
    expect(subject.phaseIndex()).toBe(1);
    subject.deleteSequence();
    expect(subject.phaseIndex()).toBe(0);
    expect(subject.dirty()).toBe(true);
  });
  it('plays with animation frames without modifying persisted snapshots and supports pause/stop', async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const subject = store();
    await subject.load(APAGA_TEAM_ID);
    const original = subject.currentPhase()!.pieces[0]!.position;
    subject.play();
    expect(subject.status()).toBe('playing');
    frame?.(performance.now() + 500);
    expect(subject.renderedPieces()[0]!.position).not.toBe(original);
    subject.pause();
    expect(subject.status()).toBe('paused');
    subject.play();
    subject.stop();
    expect(subject.status()).toBe('idle');
    expect(subject.playbackPositions()).toBeNull();
    expect(subject.selectedStrategy()!.phases[0]!.pieces[0]!.position).toEqual(original);
  });
  it('saves behind the repository contract', async () => {
    const subject = store();
    await subject.load(APAGA_TEAM_ID);
    subject.updateMetadata('name', 'Ensayo');
    await subject.save();
    expect(subject.dirty()).toBe(false);
    expect(subject.saveState()).toBe('saved');
  });
});
