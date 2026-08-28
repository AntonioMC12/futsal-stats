import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createMatchClock } from '../../../core/clock/match-clock';
import { MatchEventRepository } from '../../../core/persistence/match-event.repository';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { PlayerRepository } from '../../../core/persistence/player.repository';
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
    return { csvExporter, fixture, store };
  }

  it('renders five court players and substitutes directly with the only bench player', async () => {
    const { fixture, store } = await createPage();
    const courtPlayers = fixture.nativeElement.querySelectorAll(
      '.court-player:not(.court-player--empty)',
    );
    expect(courtPlayers).toHaveLength(5);

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
    expect(fixture.nativeElement.querySelector('.action-toast').textContent).toContain(
      'Cambio realizado',
    );
    fixture.destroy();
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
    expect(fab.getAttribute('aria-label')).toBe('Parar reloj');
    expect(fab.textContent).toContain('STOP');

    fab.click();
    expect(stopClock).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('opens the scorer selector with only current lineup players and registers one scorer', async () => {
    const { fixture, store } = await createPage();
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
    expect(fixture.nativeElement.querySelector('.action-toast').textContent).toContain(
      'Gol registrado',
    );
    fixture.destroy();
  });

  it('groups the four frequent match actions in one touch-first area', async () => {
    const { fixture } = await createPage();
    const actions = fixture.nativeElement.querySelectorAll(
      '.primary-actions .btn',
    ) as NodeListOf<HTMLButtonElement>;

    expect(actions).toHaveLength(4);
    expect([...actions].map((button) => button.textContent?.trim().replace(/\s+/g, ' '))).toEqual([
      '⚽ Gol',
      '⚽ Gol rival',
      '⚠ Falta',
      '⚠ Falta rival',
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

  it('exports from the existing statistics panel using the shared loading state', async () => {
    const { csvExporter, fixture } = await createPage();
    const button = fixture.nativeElement.querySelector(
      'details.statistics-panel .export-csv',
    ) as HTMLButtonElement;

    expect(button).toBeTruthy();
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
    expect(fixture.nativeElement.querySelector('.court-player--reduction').textContent).toContain(
      '02:00',
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
});
