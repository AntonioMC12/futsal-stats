import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RAVI_STRATEGY } from '../../data/ravi.strategy';
import { TacticalBoard } from './tactical-board';

describe('TacticalBoard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders players and ball in their initial positions with no action', async () => {
    await TestBed.configureTestingModule({
      imports: [TacticalBoard],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(TacticalBoard);
    fixture.componentRef.setInput('strategy', RAVI_STRATEGY);
    fixture.componentRef.setInput('phase', RAVI_STRATEGY.phases[0]);
    fixture.detectChanges();

    const board = fixture.nativeElement as HTMLElement;
    expect(board.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1000 600');
    expect(board.querySelectorAll('.player')).toHaveLength(5);
    expect((board.querySelector('.player') as SVGElement).style.transform).toContain('930px');
    expect((board.querySelector('.ball') as SVGElement).style.transform).toContain('910px');
    expect(board.querySelectorAll('.action')).toHaveLength(0);
  });

  it('updates positions, ball and only the actions visible in the selected phase', async () => {
    await TestBed.configureTestingModule({
      imports: [TacticalBoard],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(TacticalBoard);
    fixture.componentRef.setInput('strategy', RAVI_STRATEGY);
    fixture.componentRef.setInput('phase', RAVI_STRATEGY.phases[2]);
    fixture.detectChanges();

    const board = fixture.nativeElement as HTMLElement;
    expect(board.querySelectorAll('.action')).toHaveLength(2);
    expect(board.querySelectorAll('.action--pass')).toHaveLength(1);
    expect(board.querySelectorAll('.action--run')).toHaveLength(1);
    expect((board.querySelector('.ball') as SVGElement).style.transform).toContain('680px');

    fixture.componentRef.setInput('phase', RAVI_STRATEGY.phases[4]);
    fixture.detectChanges();
    expect(board.querySelectorAll('.action')).toHaveLength(3);
    expect((board.querySelector('.ball') as SVGElement).style.transform).toContain('500px');
  });
});
