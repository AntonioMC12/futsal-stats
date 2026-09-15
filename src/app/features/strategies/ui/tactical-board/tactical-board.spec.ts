import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RAVI_STRATEGY } from '../../data/ravi.strategy';
import { clampPiecePosition, pointerToBoardPoint, TacticalBoard } from './tactical-board';
describe('TacticalBoard', () => {
  afterEach(() => {
    document.body.classList.remove('strategy-dragging');
    TestBed.resetTestingModule();
  });
  async function fixtureFor(index = 0) {
    await TestBed.configureTestingModule({
      imports: [TacticalBoard],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(TacticalBoard);
    const phase = RAVI_STRATEGY.phases[index]!;
    fixture.componentRef.setInput('strategy', RAVI_STRATEGY);
    fixture.componentRef.setInput('phase', phase);
    fixture.componentRef.setInput('pieces', phase.pieces);
    fixture.detectChanges();
    return fixture;
  }
  it('renders home, away and ball pieces plus distinct arrow styles', async () => {
    const fixture = await fixtureFor(2);
    const board = fixture.nativeElement as HTMLElement;
    expect(board.querySelectorAll('.piece--home')).toHaveLength(5);
    expect(board.querySelectorAll('.piece--away')).toHaveLength(5);
    expect(board.querySelectorAll('.piece--ball')).toHaveLength(1);
    expect(board.querySelectorAll('.arrow--pass')).toHaveLength(1);
    expect(board.querySelectorAll('.arrow--movement')).toHaveLength(1);
  });
  it('uses a focusable SVG application surface', async () => {
    const fixture = await fixtureFor();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1000 600');
    expect(svg.getAttribute('tabindex')).toBe('0');
  });
  it('maps the pointer through aspect-fit letterboxing', () => {
    const svg = {
      getScreenCTM: () => null,
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 1200,
        height: 600,
      }),
    } as unknown as SVGSVGElement;

    expect(pointerToBoardPoint(svg, 110, 320)).toEqual({ x: 0, y: 0.5 });
    expect(pointerToBoardPoint(svg, 1110, 320)).toEqual({ x: 1, y: 0.5 });
  });
  it('keeps the complete piece inside the pitch at every edge', () => {
    expect(clampPiecePosition({ x: -1, y: -1 }, 'home-player')).toEqual({
      x: 0.05,
      y: 1 / 12,
    });
    expect(clampPiecePosition({ x: 2, y: 2 }, 'away-player')).toEqual({
      x: 0.95,
      y: 11 / 12,
    });
    expect(clampPiecePosition({ x: -1, y: 2 }, 'ball')).toEqual({
      x: 0.036,
      y: 0.94,
    });
  });
  it('sets the temporary body lock while dragging and clears it on pointer end', async () => {
    const fixture = await fixtureFor();
    const piece = fixture.nativeElement.querySelector('.piece') as Element;
    piece.dispatchEvent(pointerEvent('pointerdown', 7, 500, 300));
    expect(document.body.classList.contains('strategy-dragging')).toBe(true);
    piece.dispatchEvent(pointerEvent('pointerup', 7, 500, 300));
    expect(document.body.classList.contains('strategy-dragging')).toBe(false);
  });
  it('clears the temporary body lock when destroyed during a drag', async () => {
    const fixture = await fixtureFor();
    const piece = fixture.nativeElement.querySelector('.piece') as Element;
    piece.dispatchEvent(pointerEvent('pointerdown', 9, 500, 300));
    expect(document.body.classList.contains('strategy-dragging')).toBe(true);
    fixture.destroy();
    expect(document.body.classList.contains('strategy-dragging')).toBe(false);
  });
});

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}
