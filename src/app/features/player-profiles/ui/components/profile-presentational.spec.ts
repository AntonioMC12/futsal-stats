import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createMatchClock } from '../../../../core/clock/match-clock';
import { PlayerHistoricalMatch } from '../../domain/player-profile-statistics';
import { MatchHistoryRowComponent } from './match-history-row';
import { ProfileMetricComponent } from './profile-metric';
import { ProfileStatusBadgeComponent } from './profile-status-badge';
import { SeasonSelectorComponent } from './season-selector';

describe('player profile presentational components', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders a metric with data and its no-data variant', async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileMetricComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ProfileMetricComponent);
    fixture.componentRef.setInput('label', 'Paradas');
    fixture.componentRef.setInput('value', 4);
    fixture.componentRef.setInput('detail', '2 partidos registrados');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Paradas');
    expect(fixture.nativeElement.querySelector('strong').textContent).toContain('4');

    fixture.componentRef.setInput('value', 'Sin registro');
    fixture.componentRef.setInput('tone', 'no-data');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('article').classList).toContain(
      'profile-metric--no-data',
    );
    expect(fixture.nativeElement.textContent).toContain('Sin registro');
  });

  it.each([
    ['positive', 'Victoria'],
    ['neutral', 'Empate'],
    ['negative', 'Derrota'],
  ] as const)('renders the %s status badge', async (tone, label) => {
    await TestBed.configureTestingModule({
      imports: [ProfileStatusBadgeComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ProfileStatusBadgeComponent);
    fixture.componentRef.setInput('label', label);
    fixture.componentRef.setInput('tone', tone);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(label);
    expect(fixture.nativeElement.querySelector('span').classList).toContain(
      `status-badge--${tone}`,
    );
  });

  it('emits season changes from the accessible selector', async () => {
    await TestBed.configureTestingModule({
      imports: [SeasonSelectorComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeasonSelectorComponent);
    fixture.componentRef.setInput('value', 'all');
    fixture.componentRef.setInput('seasons', ['2026/27']);
    const emitted = vi.fn();
    fixture.componentInstance.valueChange.subscribe(emitted);
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = '2026/27';
    select.dispatchEvent(new Event('change'));
    expect(emitted).toHaveBeenCalledWith('2026/27');
  });

  it('renders a fully navigable compact match history row', async () => {
    await TestBed.configureTestingModule({
      imports: [MatchHistoryRowComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(MatchHistoryRowComponent);
    fixture.componentRef.setInput('item', historicalMatch());
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(row.getAttribute('href')).toBe('/matches/match-1');
    expect(row.textContent).toContain('Rival');
    expect(row.textContent).toContain('2 – 1');
    expect(row.textContent).toContain('Victoria');
  });
});

function historicalMatch(): PlayerHistoricalMatch {
  return {
    match: {
      id: 'match-1',
      teamId: 'team',
      homeTeam: { id: 'team', name: 'Local', shortName: 'LOC' },
      awayTeam: { name: 'Rival', shortName: 'RIV' },
      date: '2026-09-12',
      season: '2026/27',
      competition: 'Liga',
      description: '',
      status: 'finished',
      currentPeriod: 2,
      periodCount: 2,
      clock: createMatchClock(),
      squadPlayerIds: ['p1'],
      startingLineupPlayerIds: ['p1'],
      createdAt: 1,
      updatedAt: 1,
    },
    score: { home: 2, away: 1 },
    outcome: 'win',
    started: true,
    appeared: true,
    statistics: {
      playedMs: 600_000,
      firstHalfMs: 600_000,
      secondHalfMs: 0,
      entries: 1,
      percentage: 25,
      shotsTotal: null,
      shotsOnTarget: null,
      shotsOffTarget: null,
      saves: null,
      foulsReceived: null,
      goals: 1,
      goalsForOnCourt: 2,
      goalsAgainstOnCourt: 1,
      plusMinus: 1,
      fouls: 0,
      accumulatedFouls: 0,
      nonAccumulatedInfringements: 0,
      yellowCards: 0,
      secondYellowSendOffs: 0,
      directRedCards: 0,
      sendOffs: 0,
    },
  };
}
