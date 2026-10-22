import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createMatchClock } from '../../../core/clock/match-clock';
import { MatchIntegrityService } from '../../../core/sync/match-integrity.service';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { MatchCsvExportService } from '../application/match-csv-export.service';
import { MatchDetailStore } from '../application/match-detail.store';
import { MatchDetailPage } from './match-detail-page';

const players = ['Álvaro', 'Pablo', 'Dani', 'Miguel', 'Sergio', 'Marcos'].map((name, index) => ({
  id: `p${index + 1}`,
  teamId: 'team',
  name,
  number: index + 1,
  active: true,
}));
const match: Match = {
  id: 'demo',
  teamId: 'team',
  homeTeam: { id: 'team', name: 'Equipo local', shortName: 'LOC' },
  awayTeam: { name: 'Equipo visitante', shortName: 'VIS' },
  date: '2026-10-18',
  season: '2026/27',
  competition: 'Liga',
  description: 'Jornada 6',
  status: 'finished',
  currentPeriod: 2,
  periodCount: 2,
  clock: { ...createMatchClock(), remainingMs: 0 },
  squadPlayerIds: players.map((player) => player.id),
  startingLineupPlayerIds: players.slice(0, 5).map((player) => player.id),
  createdAt: 1,
  updatedAt: 2,
  statisticsSchemaVersion: 2,
};
function history(): MatchEvent[] {
  let sequence = 0;
  const event = (value: Partial<MatchEvent>): MatchEvent =>
    ({
      id: `e${++sequence}`,
      matchId: match.id,
      period: 1,
      gameClockMs: 900_000,
      timestamp: sequence,
      sequence,
      undone: false,
      ...value,
    }) as MatchEvent;
  return [
    event({ type: 'MATCH_STARTED', gameClockMs: 1_200_000 }),
    ...players
      .slice(0, 5)
      .map((player) =>
        event({ type: 'PLAYER_ENTERED', playerId: player.id, gameClockMs: 1_200_000 }),
      ),
    event({ type: 'CLOCK_STARTED', gameClockMs: 1_200_000 }),
    event({
      type: 'GOAL_FOR',
      scorerPlayerId: 'p2',
      lineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
    }),
    event({ type: 'SHOT', playerId: 'p2', outcome: 'on_target' }),
    event({ type: 'SHOT', playerId: 'p3', outcome: 'off_target' }),
    event({ type: 'SAVE', playerId: 'p1' }),
    event({
      type: 'FOUL',
      team: 'away',
      opponentPlayerNumber: 8,
      receivedByPlayerId: 'p2',
      periodFoulNumber: 1,
    }),
    event({
      type: 'FOUL',
      team: 'home',
      playerId: 'p3',
      disciplinaryAction: 'yellow',
      periodFoulNumber: 1,
    }),
    event({ type: 'SHOT', playerId: 'p2', outcome: 'off_target', undone: true }),
    event({ type: 'PERIOD_ENDED', gameClockMs: 0 }),
    event({ type: 'PERIOD_STARTED', period: 2, gameClockMs: 1_200_000 }),
    event({ type: 'CLOCK_STARTED', period: 2, gameClockMs: 1_200_000 }),
    event({
      type: 'GOAL_AGAINST',
      period: 2,
      lineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      scoreBefore: { home: 1, away: 0 },
      scoreAfter: { home: 1, away: 1 },
    }),
    event({ type: 'CLOCK_STOPPED', period: 2, gameClockMs: 0 }),
    event({ type: 'MATCH_FINISHED', period: 2, gameClockMs: 0 }),
  ];
}
async function createPage(currentMatch = match) {
  await TestBed.configureTestingModule({
    imports: [MatchDetailPage],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: MatchIntegrityService, useValue: null },
      { provide: MATCH_REPOSITORY, useValue: { get: async () => currentMatch } },
      { provide: MATCH_EVENT_REPOSITORY, useValue: { listByMatch: async () => history() } },
      { provide: PLAYER_REPOSITORY, useValue: { listByIds: async () => players } },
      {
        provide: MatchCsvExportService,
        useValue: { isExporting: signal(false), error: signal(null), export: vi.fn() },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(MatchDetailPage);
  fixture.componentRef.setInput('matchId', match.id);
  fixture.detectChanges();
  const store = fixture.debugElement.injector.get(MatchDetailStore);
  await vi.waitFor(() => expect(store.loading()).toBe(false));
  expect(store.error()).toBeNull();
  fixture.detectChanges();
  return {
    fixture,
    store,
    root: fixture.nativeElement as HTMLElement,
  };
}
describe('MatchDetailPage', () => {
  afterEach(() => TestBed.resetTestingModule());
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.open = false;
      },
    });
  });
  it('aggregates shots including goals once, excludes undone shots and splits periods', async () => {
    const { store, fixture } = await createPage();
    expect(store.summary()).toMatchObject({
      shots: 3,
      onTarget: 2,
      offTarget: 1,
      saves: 1,
      foulsReceived: 1,
      accuracy: 67,
      conversion: 33,
    });
    expect(store.periodSummary()).toMatchObject([
      { goalsFor: 1, goalsAgainst: 0, home: 1, away: 1 },
      { goalsFor: 0, goalsAgainst: 1, home: 0, away: 0 },
    ]);
    expect(store.summary().scorers[0].player.id).toBe('p2');
    expect(store.lineupRows()[0].label).toContain('#2 Pablo');
    fixture.destroy();
  });
  it('switches table groups and opens timeline, diagnostics and full player details', async () => {
    const { root, fixture } = await createPage();
    const click = (text: string) => {
      const button = [...root.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === text,
      )!;
      expect(button).toBeTruthy();
      button.click();
      fixture.detectChanges();
    };
    expect(root.querySelector('.statistics-table thead')?.textContent).toContain('A puerta');
    click('Disciplina');
    expect(root.querySelector('.statistics-table thead')?.textContent).toContain('Recibidas');
    click('Participación');
    expect(root.querySelector('.statistics-table thead')?.textContent).toContain('GF en pista');
    click('Ver cronología');
    expect(root.querySelector<HTMLDialogElement>('.detail-dialog')?.open).toBe(true);
    root.querySelector<HTMLDialogElement>('.detail-dialog')!.close();
    click('Integridad de datos');
    expect(root.querySelector('.detail-dialog')?.textContent).toContain('Comprobar integridad');
    root.querySelector<HTMLDialogElement>('.detail-dialog')!.close();
    root.querySelector<HTMLButtonElement>('.player-link')!.click();
    fixture.detectChanges();
    expect(root.querySelector<HTMLDialogElement>('.player-dialog')?.open).toBe(true);
    expect(root.querySelector('.player-dialog')?.textContent).toContain('Paradas');
    expect(root.textContent).not.toContain('Fuente de verdad');
    fixture.destroy();
  });
  it('keeps unrecorded metrics distinct from zeros for older matches', async () => {
    const { fixture, store, root } = await createPage({
      ...match,
      statisticsSchemaVersion: undefined,
    });
    expect(store.summary()).toMatchObject({
      shots: null,
      onTarget: null,
      saves: null,
      accuracy: null,
      conversion: null,
    });
    expect(root.querySelector('.kpi--accent strong')?.textContent).toBe('—');
    expect(root.textContent).toContain('no se registraban en este partido');
    fixture.destroy();
  });
});
