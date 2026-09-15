import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APAGA_TEAM_ID, createApagaTeam } from '../../../../core/initialization/built-in-teams';
import { StrategyPlaybackStore } from '../../application/strategy-playback.store';
import { StrategyWorkspaceContext } from '../../application/strategy-workspace.context';
import { LocalStrategyRepository } from '../../data/local-strategy.repository';
import { StrategyRepository } from '../../domain/strategy';
import { StrategyLibraryPage } from './strategy-library-page';
describe('StrategyLibraryPage', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('lists static previews, searches and opens the readonly viewer', async () => {
    const team = createApagaTeam(Date.now());
    const context = {
      ready: signal(true),
      teams: signal([team]),
      teamId: signal(APAGA_TEAM_ID),
      createStrategy: vi.fn(() => 'new-id'),
    };
    await TestBed.configureTestingModule({
      imports: [StrategyLibraryPage],
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
    const fixture = TestBed.createComponent(StrategyLibraryPage);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelectorAll('app-strategy-card')).toHaveLength(1);
    expect(page.querySelector('.strategy-card__preview')).not.toBeNull();
    const search = page.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'inexistente';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(page.textContent).toContain('Sin resultados');
    search.value = '';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('.play-action')?.click();
    fixture.detectChanges();
    expect(page.querySelector('[role="dialog"]')).not.toBeNull();
    expect(page.querySelector('[role="dialog"]')?.textContent).toContain('Visor de jugada');
  });
});
