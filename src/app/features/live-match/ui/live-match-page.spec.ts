import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createMatchClock } from '../../../core/clock/match-clock';
import { MatchEventRepository } from '../../../core/persistence/match-event.repository';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { PlayerRepository } from '../../../core/persistence/player.repository';
import { SystemNotificationService } from '../../../core/notifications/system-notification.service';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { DeleteMatchService } from '../../matches/application/delete-match.service';
import { MatchCsvExportService } from '../../matches/application/match-csv-export.service';
import { LiveMatchStore } from '../application/live-match.store';
import { LiveMatchPage } from './live-match-page';

const players: Player[] = Array.from({ length: 6 }, (_, index) => ({
  id: `p${index + 1}`,
  teamId: 'team-1',
  number: index + 1,
  name: index === 5 ? 'Banquillo' : `Jugador ${index + 1}`,
  active: true,
}));

function activeMatch(): Match {
  return {
    id: 'match-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: 1,
    status: 'firstHalf',
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: players.map((player) => player.id),
    startingLineupPlayerIds: players.slice(0, 5).map((player) => player.id),
    createdAt: 1,
    updatedAt: 1,
  };
}

function lineupEvents(): MatchEvent[] {
  return players.slice(0, 5).map((player, index) => ({
    id: `entered-${player.id}`,
    matchId: 'match-1',
    type: 'PLAYER_ENTERED',
    playerId: player.id,
    period: 1,
    gameClockMs: 1_200_000,
    timestamp: index + 1,
    sequence: index + 1,
    undone: false,
  }));
}

function foulEvent(
  id: string,
  sequence: number,
  team: 'home' | 'away',
  options: {
    playerId?: string;
    opponentPlayerNumber?: number;
    action?: 'none' | 'yellow' | 'secondYellow' | 'directRed';
  } = {},
): MatchEvent {
  return {
    id,
    matchId: 'match-1',
    type: 'FOUL',
    team,
    playerId: options.playerId,
    opponentPlayerNumber: options.opponentPlayerNumber,
    accumulated: true,
    disciplinaryAction: options.action ?? 'none',
    periodFoulNumber: sequence - 5,
    period: 1,
    gameClockMs: 1_200_000 - sequence * 1_000,
    matchElapsedMs: sequence * 1_000,
    timestamp: sequence,
    sequence,
    undone: false,
  };
}

describe('LiveMatchPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function createPage() {
    const match = activeMatch();
    const csvExporter = {
      isExporting: signal(false),
      notice: signal<string | null>(null),
      error: signal<string | null>(null),
      export: vi.fn(async () => ({ ok: true as const, value: 'match.csv' })),
    };
    await TestBed.configureTestingModule({
      imports: [LiveMatchPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: MatchRepository, useValue: { get: async () => match } },
        { provide: PlayerRepository, useValue: { listByIds: async () => players } },
        {
          provide: MatchEventRepository,
          useValue: { listByMatch: async () => lineupEvents(), commit: async () => undefined },
        },
        { provide: DeleteMatchService, useValue: { execute: async () => undefined } },
        { provide: MatchCsvExportService, useValue: csvExporter },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LiveMatchPage);
    fixture.componentRef.setInput('matchId', match.id);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(LiveMatchStore);
    await vi.waitFor(() => expect(store.loading()).toBe(false));
    fixture.detectChanges();
    const notifications = TestBed.inject(SystemNotificationService);
    return { csvExporter, fixture, notifications, store };
  }

  it('renders five court players and substitutes directly with the only bench player', async () => {
    const { fixture, notifications, store } = await createPage();
    const courtPlayers = fixture.nativeElement.querySelectorAll(
      '.court-player:not(.court-player--empty)',
    );
    expect(courtPlayers).toHaveLength(5);
    const court = fixture.nativeElement.querySelector('.futsal-court') as HTMLElement;
    expect(court.getAttribute('aria-label')).toContain('Formación');
    expect(court.querySelector('.court-markings')).not.toBeNull();
    expect(
      [...court.querySelectorAll('.court-player')].map((player) =>
        player.getAttribute('data-slot'),
      ),
    ).toEqual(['1', '2', '3', '4', '5']);

    const makeSubstitution = vi.spyOn(store, 'makeSubstitution').mockResolvedValue(true);
    (courtPlayers[2] as HTMLButtonElement).click();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('.substitution-sheet') as HTMLElement;
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toContain('#3 Jugador 3');
    const benchOptions = sheet.querySelectorAll('.bench-option');
    expect(benchOptions).toHaveLength(1);
    expect(benchOptions[0]?.textContent).toContain('#6');
    expect(benchOptions[0]?.textContent).toContain('Banquillo');

    (benchOptions[0] as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(makeSubstitution).toHaveBeenCalledOnce();
    expect(makeSubstitution).toHaveBeenCalledWith('p3', 'p6');
    expect(fixture.nativeElement.querySelector('.substitution-sheet')).toBeNull();
    expect(notifications.notification()?.message).toBe('Cambio realizado');
    expect(notifications.notification()?.action?.label).toBe('Deshacer');
    fixture.destroy();
  });

  it('starts dismissing action feedback after its visible duration', async () => {
    const { fixture, notifications, store } = await createPage();
    vi.useFakeTimers();
    try {
      const registerGoalAgainst = vi.spyOn(store, 'registerGoalAgainst').mockResolvedValue(true);
      const goalAgainstButton = fixture.nativeElement.querySelectorAll(
        '.primary-actions .btn',
      )[1] as HTMLButtonElement;

      goalAgainstButton.click();
      await Promise.resolve();
      expect(registerGoalAgainst).toHaveBeenCalledOnce();
      const id = notifications.notification()?.id;
      expect(id).toBeDefined();
      notifications.animationDone(id!);
      expect(notifications.phase()).toBe('visible');

      await vi.advanceTimersByTimeAsync(2_599);
      expect(notifications.phase()).toBe('visible');

      await vi.advanceTimersByTimeAsync(1);
      expect(notifications.phase()).toBe('leaving');
    } finally {
      fixture.destroy();
      vi.useRealTimers();
    }
  });

  it('uses the same clock commands from the floating button', async () => {
    const { fixture, store } = await createPage();
    const startClock = vi.spyOn(store, 'startClock').mockResolvedValue();
    let fab = fixture.nativeElement.querySelector('.clock-fab') as HTMLButtonElement;
    expect(fab.getAttribute('aria-label')).toBe('Iniciar reloj');
    expect(fab.textContent).toContain('START');

    fab.click();
    expect(startClock).toHaveBeenCalledOnce();

    const match = store.match();
    expect(match).not.toBeNull();
    store.match.set({
      ...match!,
      clock: { ...match!.clock, running: true, startedAtEpochMs: Date.now() },
    });
    fixture.detectChanges();
    const stopClock = vi.spyOn(store, 'stopClock').mockResolvedValue();
    fab = fixture.nativeElement.querySelector('.clock-fab') as HTMLButtonElement;
    expect(fab.getAttribute('aria-label')).toBe('Pausar reloj');
    expect(fab.textContent).toContain('PAUSA');
    expect(fab.querySelectorAll('svg rect')).toHaveLength(2);

    fab.click();
    expect(stopClock).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('stops a running clock before opening the goal selector and keeps it stopped on cancel', async () => {
    const { fixture, store } = await createPage();
    await store.startClock();
    fixture.detectChanges();
    const stopClock = vi.spyOn(store, 'stopClock');

    (
      fixture.nativeElement.querySelector('.goal-actions .btn--primary') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(stopClock).toHaveBeenCalledOnce();
    expect(store.clockRunning()).toBe(false);
    expect(store.events().filter((event) => event.type === 'CLOCK_STOPPED')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.goal-sheet')).not.toBeNull();
    expect(
      (fixture.nativeElement.querySelector('.live-match') as HTMLElement).classList.contains(
        'is-paused',
      ),
    ).toBe(true);

    (fixture.nativeElement.querySelector('.goal-sheet .sheet-cancel') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.clockRunning()).toBe(false);
    expect(store.events().filter((event) => event.type === 'CLOCK_STOPPED')).toHaveLength(1);
    expect(
      (fixture.nativeElement.querySelector('.live-match') as HTMLElement).classList.contains(
        'is-paused',
      ),
    ).toBe(true);
    fixture.destroy();
  });

  it('does not request another clock stop when an action starts with the clock stopped', async () => {
    const { fixture, store } = await createPage();
    const stopClock = vi.spyOn(store, 'stopClock');

    (
      fixture.nativeElement.querySelector('.goal-actions .btn--primary') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(stopClock).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.goal-sheet')).not.toBeNull();
    fixture.destroy();
  });

  it('stops the clock before registering a rival goal', async () => {
    const { fixture, store } = await createPage();
    await store.startClock();
    fixture.detectChanges();
    const stopClock = vi.spyOn(store, 'stopClock');
    const registerGoalAgainst = vi.spyOn(store, 'registerGoalAgainst').mockResolvedValue(true);

    (
      fixture.nativeElement.querySelector('.goal-actions .btn--danger') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(stopClock).toHaveBeenCalledOnce();
    expect(registerGoalAgainst).toHaveBeenCalledOnce();
    expect(stopClock.mock.invocationCallOrder[0]).toBeLessThan(
      registerGoalAgainst.mock.invocationCallOrder[0]!,
    );
    expect(store.clockRunning()).toBe(false);
    fixture.destroy();
  });

  it('stops the clock before opening either foul flow', async () => {
    const { fixture, store } = await createPage();
    const stopClock = vi.spyOn(store, 'stopClock');
    const foulButtons = fixture.nativeElement.querySelectorAll(
      '.foul-actions button',
    ) as NodeListOf<HTMLButtonElement>;

    await store.startClock();
    fixture.detectChanges();
    foulButtons[0]?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.clockRunning()).toBe(false);
    expect(fixture.nativeElement.querySelector('.foul-sheet')).not.toBeNull();
    (fixture.nativeElement.querySelector('.foul-sheet .sheet-cancel') as HTMLButtonElement).click();

    await store.startClock();
    fixture.detectChanges();
    foulButtons[1]?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(store.clockRunning()).toBe(false);
    expect(fixture.nativeElement.querySelector('.foul-sheet')).not.toBeNull();
    expect(stopClock).toHaveBeenCalledTimes(2);
    fixture.destroy();
  });

  it('stops the clock before opening a substitution', async () => {
    const { fixture, store } = await createPage();
    await store.startClock();
    fixture.detectChanges();
    const stopClock = vi.spyOn(store, 'stopClock');

    (
      fixture.nativeElement.querySelector(
        '.court-player:not(.court-player--empty)',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(stopClock).toHaveBeenCalledOnce();
    expect(store.clockRunning()).toBe(false);
    expect(fixture.nativeElement.querySelector('.substitution-sheet')).not.toBeNull();
    fixture.destroy();
  });

  it('pulses only for an enabled stopped PLAY control', async () => {
    const { fixture, store } = await createPage();
    let fab = fixture.nativeElement.querySelector('.clock-fab') as HTMLButtonElement;
    expect(fab.classList.contains('clock-fab--pulse')).toBe(true);
    expect(fab.disabled).toBe(false);

    await store.startClock();
    fixture.detectChanges();
    fab = fixture.nativeElement.querySelector('.clock-fab') as HTMLButtonElement;
    expect(fab.classList.contains('clock-fab--pulse')).toBe(false);

    await store.stopClock();
    store.events.set(
      store
        .events()
        .filter((event) => event.type !== 'PLAYER_ENTERED')
        .slice(0, 2),
    );
    fixture.detectChanges();
    fab = fixture.nativeElement.querySelector('.clock-fab') as HTMLButtonElement;
    expect(store.canStartClock()).toBe(false);
    expect(fab.disabled).toBe(true);
    expect(fab.classList.contains('clock-fab--pulse')).toBe(false);
    fixture.destroy();
  });

  it('shows the paused shell only during a stopped playable period with time remaining', async () => {
    const { fixture, store } = await createPage();
    const shellIsPaused = () =>
      (fixture.nativeElement.querySelector('.live-match') as HTMLElement).classList.contains(
        'is-paused',
      );
    const setState = (status: Match['status'], running: boolean, remainingMs = 1_000_000) => {
      const match = store.match()!;
      store.match.set({
        ...match,
        status,
        clock: {
          ...match.clock,
          remainingMs,
          running,
          startedAtEpochMs: running ? Date.now() : null,
        },
      });
      fixture.detectChanges();
    };

    setState('ready', false);
    expect(shellIsPaused()).toBe(false);
    setState('firstHalf', true);
    expect(shellIsPaused()).toBe(false);
    setState('firstHalf', false);
    expect(shellIsPaused()).toBe(true);
    setState('secondHalf', false);
    expect(shellIsPaused()).toBe(true);
    setState('halftime', false);
    expect(shellIsPaused()).toBe(false);
    setState('finished', false);
    expect(shellIsPaused()).toBe(false);
    setState('firstHalf', false, 0);
    expect(shellIsPaused()).toBe(false);
    fixture.destroy();
  });

  it('integrates the only visible clock and period into the scoreboard panel', async () => {
    const { fixture, store } = await createPage();
    const timers = fixture.nativeElement.querySelectorAll(
      '[role="timer"]',
    ) as NodeListOf<HTMLElement>;
    const matchState = fixture.nativeElement.querySelector('.match-state') as HTMLElement;

    expect(timers).toHaveLength(1);
    expect(matchState.contains(timers[0])).toBe(true);
    expect(timers[0]?.textContent).toBe(store.formattedClock());
    expect(matchState.textContent).toContain('1.ª parte');
    expect(matchState.textContent).toContain('Detenido');
    expect(matchState.textContent).toContain('INT');
    expect(matchState.textContent).toContain('RIV');
    expect(fixture.nativeElement.querySelector('.match-topbar [role="timer"]')).toBeNull();
    fixture.destroy();
  });

  it('opens the scorer selector with only current lineup players and registers one scorer', async () => {
    const { fixture, notifications, store } = await createPage();
    const registerGoalFor = vi.spyOn(store, 'registerGoalFor').mockResolvedValue(true);
    const goalButton = fixture.nativeElement.querySelector(
      '.goal-actions .btn--primary',
    ) as HTMLButtonElement;

    goalButton.click();
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('.goal-sheet') as HTMLElement;
    const options = sheet.querySelectorAll('.goal-scorer-option') as NodeListOf<HTMLButtonElement>;
    expect(options).toHaveLength(5);
    expect(sheet.textContent).not.toContain('Banquillo');

    options[2]?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(registerGoalFor).toHaveBeenCalledOnce();
    expect(registerGoalFor).toHaveBeenCalledWith('p3');
    expect(fixture.nativeElement.querySelector('.goal-sheet')).toBeNull();
    expect(notifications.notification()?.message).toBe('Gol registrado');
    fixture.destroy();
  });

  it('groups the four frequent match actions in one touch-first area', async () => {
    const { fixture } = await createPage();
    const actions = fixture.nativeElement.querySelectorAll(
      '.primary-actions .btn',
    ) as NodeListOf<HTMLButtonElement>;

    expect(actions).toHaveLength(4);
    expect([...actions].map((button) => button.textContent?.trim().replace(/\s+/g, ' '))).toEqual([
      '+1 Gol',
      '+1 Gol rival',
      '! Falta',
      '! Falta rival',
    ]);
    fixture.destroy();
  });

  it('registers a goal without scorer from the same selector', async () => {
    const { fixture, store } = await createPage();
    const registerGoalFor = vi.spyOn(store, 'registerGoalFor').mockResolvedValue(true);
    (
      fixture.nativeElement.querySelector('.goal-actions .btn--primary') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.goal-without-scorer') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(registerGoalFor).toHaveBeenCalledOnce();
    expect(registerGoalFor).toHaveBeenCalledWith(undefined);
    expect(fixture.nativeElement.querySelector('.goal-sheet')).toBeNull();
    fixture.destroy();
  });

  it('cancels scorer selection without registering a goal', async () => {
    const { fixture, store } = await createPage();
    const registerGoalFor = vi.spyOn(store, 'registerGoalFor').mockResolvedValue(true);
    (
      fixture.nativeElement.querySelector('.goal-actions .btn--primary') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.goal-sheet .sheet-cancel') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(registerGoalFor).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.goal-sheet')).toBeNull();
    fixture.destroy();
  });

  it('opens statistics as an overlay and exports with the shared loading state', async () => {
    const { csvExporter, fixture } = await createPage();
    expect(fixture.nativeElement.querySelector('.statistics-table')).toBeNull();
    (fixture.nativeElement.querySelectorAll('.match-nav button')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '.match-overlay .export-csv',
    ) as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.statistics-table')).not.toBeNull();
    expect(button.textContent).toContain('Exportar CSV');
    button.click();
    expect(csvExporter.export).toHaveBeenCalledOnce();
    expect(csvExporter.export).toHaveBeenCalledWith('match-1');

    csvExporter.isExporting.set(true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Exportando');
    fixture.destroy();
  });

  it('renders the tablet statistics summary and expands it in the existing overlay', async () => {
    const { fixture } = await createPage();
    const summary = fixture.nativeElement.querySelector('.tablet-statistics') as HTMLElement;

    expect(summary.textContent).toContain('Estadísticas');
    expect(summary.querySelectorAll('tbody tr')).toHaveLength(players.length);
    expect(summary.textContent).toContain('#1');
    expect(summary.textContent).toContain('Jugador 1');

    (summary.querySelector('.panel-heading button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.match-overlay .statistics-table')).not.toBeNull();
    fixture.destroy();
  });

  it('opens events and secondary actions without changing the dashboard', async () => {
    const { fixture } = await createPage();
    const navigation = fixture.nativeElement.querySelectorAll(
      '.match-nav button',
    ) as NodeListOf<HTMLButtonElement>;

    navigation[1]?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.match-overlay').textContent).toContain(
      'Timeline completo',
    );
    (fixture.nativeElement.querySelector('.overlay-close') as HTMLButtonElement).click();
    fixture.detectChanges();

    navigation[3]?.click();
    fixture.detectChanges();
    const moreOverlay = fixture.nativeElement.querySelector('.match-overlay') as HTMLElement;
    expect(moreOverlay.textContent).toContain('Exportar CSV');
    expect(moreOverlay.textContent).toContain('Abandonar partido');
    expect(fixture.nativeElement.querySelector('.match-dashboard')).not.toBeNull();
    fixture.destroy();
  });

  it('registers a direct red from the foul sheet and shows numerical inferiority', async () => {
    const { fixture, store } = await createPage();
    const ownFoul = fixture.nativeElement.querySelector(
      '.foul-actions button',
    ) as HTMLButtonElement;
    ownFoul.click();
    fixture.detectChanges();

    const playerOptions = fixture.nativeElement.querySelectorAll(
      '.foul-player-options .bench-option',
    ) as NodeListOf<HTMLButtonElement>;
    expect(playerOptions).toHaveLength(5);
    playerOptions[2]?.click();
    fixture.detectChanges();
    const sanctions = fixture.nativeElement.querySelectorAll(
      '.disciplinary-options button',
    ) as NodeListOf<HTMLButtonElement>;
    sanctions[3]?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.currentLineup()).toHaveLength(4);
    expect(store.sentOffPlayers().map((player) => player.id)).toEqual(['p3']);
    expect(store.benchPlayers().map((player) => player.id)).toEqual(['p6']);
    const reductionSlot = fixture.nativeElement.querySelector(
      '.court-player--reduction',
    ) as HTMLElement;
    expect(reductionSlot.textContent).toContain('02:00');
    expect(reductionSlot.getAttribute('data-slot')).toBe('5');
    expect((reductionSlot.closest('.futsal-court') as HTMLElement).contains(reductionSlot)).toBe(
      true,
    );
    expect(fixture.nativeElement.querySelector('.foul-sheet')).toBeNull();
    fixture.destroy();
  });

  it('adds and reuses a rival jersey number for a second yellow', async () => {
    const { fixture, store } = await createPage();
    const openOpponentFoul = () =>
      (
        fixture.nativeElement.querySelectorAll('.foul-actions button')[1] as HTMLButtonElement
      ).click();

    openOpponentFoul();
    fixture.detectChanges();
    let sanctions = fixture.nativeElement.querySelectorAll(
      '.disciplinary-options button',
    ) as NodeListOf<HTMLButtonElement>;
    sanctions[1]?.click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      '.opponent-number-field input',
    ) as HTMLInputElement;
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.register-opponent-card') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.knownOpponentPlayers()).toEqual([7]);
    expect(store.disciplinaryState().opponentPlayers[0]).toMatchObject({ yellowCards: 1 });

    openOpponentFoul();
    fixture.detectChanges();
    sanctions = fixture.nativeElement.querySelectorAll(
      '.disciplinary-options button',
    ) as NodeListOf<HTMLButtonElement>;
    sanctions[2]?.click();
    fixture.detectChanges();
    const known = fixture.nativeElement.querySelector(
      '.opponent-number-option',
    ) as HTMLButtonElement;
    expect(known.textContent).toContain('#7');
    expect(known.textContent).toContain('🟨');
    expect(known.disabled).toBe(false);
    known.click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.register-opponent-card') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(store.disciplinaryState().opponentPlayers[0]).toMatchObject({
      yellowCards: 2,
      secondYellowSendOffs: 1,
      sentOff: true,
    });
    expect(store.opponentSecondYellowSendOffsByNumber(7)).toBe(1);
    expect(store.opponentDirectRedsByNumber(7)).toBe(0);
    expect(store.isOpponentPlayerSentOff(7)).toBe(true);
    expect(store.opponentReductions()).toHaveLength(1);
    fixture.destroy();
  });

  it('renders detailed discipline for players, rival numbers and unattributed fouls', async () => {
    const { fixture, store } = await createPage();
    store.events.set([
      ...store.events(),
      foulEvent('p1-foul', 6, 'home', { playerId: 'p1' }),
      foulEvent('p1-yellow', 7, 'home', { playerId: 'p1', action: 'yellow' }),
      foulEvent('p2-yellow', 8, 'home', { playerId: 'p2', action: 'yellow' }),
      foulEvent('p2-second', 9, 'home', { playerId: 'p2', action: 'secondYellow' }),
      foulEvent('p3-red', 10, 'home', { playerId: 'p3', action: 'directRed' }),
      foulEvent('rival-seven', 11, 'away', { opponentPlayerNumber: 7, action: 'yellow' }),
      foulEvent('rival-unknown-1', 12, 'away'),
      foulEvent('rival-unknown-2', 13, 'away'),
    ]);
    fixture.detectChanges();

    const navButtons = fixture.nativeElement.querySelectorAll(
      '.match-nav button',
    ) as NodeListOf<HTMLButtonElement>;
    navButtons[2]?.click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.discipline-panel') as HTMLElement;
    expect(panel.querySelectorAll('.discipline-summary-card')).toHaveLength(2);
    expect(panel.textContent).toContain('Jugador 1');
    expect(panel.textContent).toContain('2 faltas');
    expect(panel.textContent).toContain('Amarilla');
    expect(panel.textContent).toContain('Segunda amarilla · Expulsado');
    expect(panel.textContent).toContain('Roja directa · Expulsado');
    expect(panel.textContent).toContain('#7');
    expect(panel.textContent).toContain('Faltas sin jugador identificado: 2');
    expect(panel.querySelectorAll('.sanction-card')).toHaveLength(2);
    fixture.destroy();
  });

  it('shows a useful discipline empty state', async () => {
    const { fixture } = await createPage();
    const navButtons = fixture.nativeElement.querySelectorAll(
      '.match-nav button',
    ) as NodeListOf<HTMLButtonElement>;
    navButtons[2]?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.discipline-empty')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.discipline-panel').textContent).toContain(
      'Sin faltas ni tarjetas registradas.',
    );
    fixture.destroy();
  });
});
