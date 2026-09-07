import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RAVI_STRATEGY } from '../../data/ravi.strategy';
import { pointerToBoardPoint, TacticalBoard } from './tactical-board';
describe('TacticalBoard', () => {
  afterEach(() => TestBed.resetTestingModule());
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
});
