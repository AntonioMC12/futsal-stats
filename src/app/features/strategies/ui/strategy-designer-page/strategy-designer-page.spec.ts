import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APAGA_TEAM_ID } from '../../../../core/initialization/built-in-teams';
import { StrategyPlaybackStore } from '../../application/strategy-playback.store';
import { StrategyWorkspaceContext } from '../../application/strategy-workspace.context';
import { LocalStrategyRepository } from '../../data/local-strategy.repository';
import { StrategyRepository } from '../../domain/strategy';
import { StrategyDesignerPage } from './strategy-designer-page';
describe('StrategyDesignerPage', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('shows header, tools, board, inspector and timeline in one workspace', async () => {
    const context = { ready: signal(true), createStrategy: vi.fn(() => 'new-id') };
    await TestBed.configureTestingModule({
      imports: [StrategyDesignerPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        StrategyPlaybackStore,
        { provide: StrategyRepository, useClass: LocalStrategyRepository },
        { provide: StrategyWorkspaceContext, useValue: context },
      ],
    }).compileComponents();
    const store = TestBed.inject(StrategyPlaybackStore);
    await store.load(APAGA_TEAM_ID);
    const fixture = TestBed.createComponent(StrategyDesignerPage);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.designer-header')).not.toBeNull();
    expect(page.querySelector('.tools-panel')).not.toBeNull();
    expect(page.querySelector('.board-stage')).not.toBeNull();
    expect(page.querySelector('.inspector-panel')).not.toBeNull();
    expect(page.querySelector('.designer-footer')).not.toBeNull();
    store.setTool('pass');
    fixture.detectChanges();
    expect(page.querySelector('.toolbar button[aria-pressed="true"]')?.textContent).toContain(
      'Pase',
    );
    store.selectPiece(store.currentPhase()!.pieces[0]!.pieceId);
    fixture.detectChanges();
    expect(page.querySelector('.inspector')?.textContent).toContain('Jugador local');
  });
});
