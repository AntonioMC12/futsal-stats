import { TestBed } from '@angular/core/testing';
import { createMatchClock, DEFAULT_PERIOD_DURATION_MS } from '../../../core/clock/match-clock';
import { MatchEventRepository } from '../../../core/persistence/match-event.repository';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { PlayerRepository } from '../../../core/persistence/player.repository';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { DeleteMatchService } from '../../matches/application/delete-match.service';
import { LiveMatchStore } from './live-match.store';

function readyMatch(): Match {
  return {
    id: 'match-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: 1,
    status: 'ready',
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('LiveMatchStore', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('loads a match and persists START', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const original = readyMatch();
    const stored: Match[] = [];
    const storedEvents: MatchEvent[] = [];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        {
          provide: MatchRepository,
          useValue: { get: async () => original },
        },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [],
            commit: async (match: Match, events: MatchEvent[]) => {
              stored.push(match);
              storedEvents.push(...events);
            },
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();

    expect(store.match()?.status).toBe('firstHalf');
    expect(store.clockRunning()).toBe(true);
    expect(store.formattedClock()).toBe('20:00');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.clock.startedAtEpochMs).toBe(10_000);
    expect(storedEvents.map((event) => event.type)).toEqual([
      'MATCH_STARTED',
      'PERIOD_STARTED',
      'PLAYER_ENTERED',
      'PLAYER_ENTERED',
      'PLAYER_ENTERED',
      'PLAYER_ENTERED',
      'PLAYER_ENTERED',
      'CLOCK_STARTED',
    ]);
    expect(store.timeline()).toHaveLength(8);
  });

  it('recovers an expired clock at 00:00 and persists the stopped snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(DEFAULT_PERIOD_DURATION_MS + 5_000);
    const original = readyMatch();
    original.status = 'firstHalf';
    original.clock = {
      ...original.clock,
      running: true,
      startedAtEpochMs: 1_000,
    };
    const stored: Match[] = [];
    const storedEvents: MatchEvent[] = [];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        {
          provide: MatchRepository,
          useValue: { get: async () => original },
        },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [],
            commit: async (match: Match, events: MatchEvent[]) => {
              stored.push(match);
              storedEvents.push(...events);
            },
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);

    expect(store.remainingMs()).toBe(0);
    expect(store.clockRunning()).toBe(false);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.clock.remainingMs).toBe(0);
    expect(storedEvents[0]?.type).toBe('CLOCK_STOPPED');
  });

  it('projects elapsed time and automatically persists STOP at zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const original = readyMatch();
    original.clock = createMatchClock(1_000);
    const stored: Match[] = [];
    const storedEvents: MatchEvent[] = [];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        {
          provide: MatchRepository,
          useValue: { get: async () => original },
        },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [],
            commit: async (match: Match, events: MatchEvent[]) => {
              stored.push(match);
              storedEvents.push(...events);
            },
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(store.formattedClock()).toBe('00:00');
    expect(store.clockRunning()).toBe(false);
    expect(stored).toHaveLength(2);
    expect(storedEvents.at(-1)?.type).toBe('CLOCK_STOPPED');
    expect(stored[1]?.clock).toEqual({
      periodDurationMs: 1_000,
      remainingMs: 0,
      running: false,
      startedAtEpochMs: null,
    });
  });

  it('does not mutate local state when persistence fails', async () => {
    vi.useFakeTimers();
    const original = readyMatch();
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        {
          provide: MatchRepository,
          useValue: { get: async () => original },
        },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [],
            commit: async () => {
              throw new Error('storage unavailable');
            },
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();

    expect(store.match()).toBe(original);
    expect(store.error()).toBe('No se ha podido guardar el estado del reloj.');
  });

  it('persists a substitution and immediately derives lineup and playing time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const original = readyMatch();
    const storedEvents: MatchEvent[] = [];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [],
            commit: async (_match: Match, events: MatchEvent[]) => storedEvents.push(...events),
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    vi.setSystemTime(15_000);
    expect(await store.makeSubstitution('p1', 'p6')).toBe(true);

    expect(store.derivedState()?.currentLineupPlayerIds).toEqual(['p6', 'p2', 'p3', 'p4', 'p5']);
    expect(store.clockRunning()).toBe(true);
    expect(storedEvents.filter((event) => event.type === 'CLOCK_STOPPED')).toHaveLength(0);
    expect(storedEvents.at(-1)).toMatchObject({
      type: 'SUBSTITUTION',
      sequence: 9,
      gameClockMs: DEFAULT_PERIOD_DURATION_MS - 5_000,
      outPlayerId: 'p1',
      inPlayerId: 'p6',
    });
    expect(store.playerPlayingTimes()['p1']?.playedMs).toBe(5_000);
    expect(store.playerPlayingTimes()['p6']?.playedMs).toBe(0);

    vi.setSystemTime(16_000);
    expect(await store.registerGoalFor('p6')).toBe(true);
    expect(storedEvents.at(-1)).toMatchObject({
      type: 'GOAL_FOR',
      scorerPlayerId: 'p6',
      lineupPlayerIds: ['p6', 'p2', 'p3', 'p4', 'p5'],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
    });
    expect(store.statistics().players['p1']?.goalsForOnCourt).toBe(0);
    expect(store.statistics().players['p6']?.goalsForOnCourt).toBe(1);
    expect(store.statistics().players['p6']?.goals).toBe(1);
    expect(store.lineupStatistics().find((lineup) => lineup.id === 'p2|p3|p4|p5|p6')).toMatchObject(
      { playedMs: 1_000, goalsFor: 1, goalsAgainst: 0, plusMinus: 1 },
    );

    await store.stopClock();
    const clockEventCount = storedEvents.filter(
      (event) => event.type === 'CLOCK_STARTED' || event.type === 'CLOCK_STOPPED',
    ).length;
    expect(await store.makeSubstitution('p6', 'p1')).toBe(true);
    expect(store.clockRunning()).toBe(false);
    expect(
      storedEvents.filter(
        (event) => event.type === 'CLOCK_STARTED' || event.type === 'CLOCK_STOPPED',
      ),
    ).toHaveLength(clockEventCount);
  });

  it('persists and rehydrates bench cards, accumulated fouls and send-offs without reductions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    let persistedMatch = readyMatch();
    const persistedEvents: MatchEvent[] = [];
    const hydratedPlayers = persistedMatch.squadPlayerIds.map((id, index) => ({
      id,
      teamId: 'team-1',
      number: index + 1,
      name: `Jugador ${index + 1}`,
      active: true,
    }));
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => persistedMatch } },
        { provide: PlayerRepository, useValue: { listByIds: async () => hydratedPlayers } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [...persistedEvents],
            commit: async (match: Match, events: MatchEvent[]) => {
              persistedMatch = match;
              persistedEvents.push(...events);
            },
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(persistedMatch.id);
    await store.startClock();
    await store.stopClock();
    for (let index = 0; index < 4; index += 1) {
      expect(await store.registerTeamFoul('p1')).toBe(true);
    }
    expect(
      await store.registerBenchDiscipline(
        'home',
        { subjectKind: 'player', playerId: 'p6' },
        'yellow',
        'protest',
      ),
    ).toBe(true);
    expect(store.benchPlayers().map((player) => player.id)).toContain('p6');
    expect(
      await store.registerBenchDiscipline(
        'home',
        { subjectKind: 'staff', staffRole: 'headCoach' },
        'directRed',
        'protest',
      ),
    ).toBe(true);
    expect(store.currentPeriodFouls().home).toBe(6);
    expect(store.disciplinaryState().reductions).toHaveLength(0);
    expect(
      await store.registerBenchDiscipline(
        'home',
        { subjectKind: 'player', playerId: 'p6' },
        'directRed',
        'other',
      ),
    ).toBe(true);

    expect(store.currentPeriodFouls().home).toBe(6);
    expect(store.disciplinaryState().staffMembers[0]).toMatchObject({
      role: 'headCoach',
      directRedCards: 1,
      sentOff: true,
    });
    expect(store.disciplinaryState().sentOffPlayerIds).toContain('p6');
    expect(store.disciplinaryState().reductions).toHaveLength(0);
    expect(store.lineupPlayerIds()).toEqual(persistedMatch.startingLineupPlayerIds);
    expect(store.benchPlayers().map((player) => player.id)).not.toContain('p6');

    await store.load(persistedMatch.id);
    expect(await store.registerTeamFoul('p1')).toBe(true);
    expect(store.currentPeriodFouls().home).toBe(7);
    expect(persistedEvents.at(-1)).toMatchObject({ type: 'FOUL', periodFoulNumber: 7 });

    await store.load(persistedMatch.id);
    expect(store.currentPeriodFouls().home).toBe(7);
    expect(store.disciplinaryState().staffMembers).toHaveLength(1);
    expect(store.disciplinaryState().sentOffPlayerIds).toContain('p6');
    expect(store.timeline().filter((item) => item.type === 'BENCH_DISCIPLINE')).toHaveLength(3);
  });

  it('undoes every projected effect of bench discipline', async () => {
    vi.useFakeTimers();
    const original = readyMatch();
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: { listByMatch: async () => [], commit: async () => undefined },
        },
      ],
    });
    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    await store.stopClock();
    await store.registerBenchDiscipline(
      'home',
      { subjectKind: 'staff', staffRole: 'headCoach' },
      'directRed',
      'protest',
    );
    expect(store.currentPeriodFouls().home).toBe(1);
    expect(store.disciplinaryState().staffMembers[0]?.sentOff).toBe(true);

    expect(await store.undoLastEvent()).toBe(true);
    expect(store.currentPeriodFouls().home).toBe(0);
    expect(store.disciplinaryState().staffMembers).toEqual([]);
    expect(store.timeline().some((item) => item.type === 'BENCH_DISCIPLINE')).toBe(false);
  });

  it('persists goals with exact score, clock and lineup snapshots', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const original = readyMatch();
    const storedEvents: MatchEvent[] = [];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [...storedEvents],
            commit: async (_match: Match, events: MatchEvent[]) => storedEvents.push(...events),
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    vi.setSystemTime(15_000);
    expect(await store.registerGoalFor('p3')).toBe(true);
    vi.setSystemTime(16_000);
    expect(await store.registerGoalFor('p3')).toBe(true);
    vi.setSystemTime(17_000);
    expect(await store.registerGoalFor('p4')).toBe(true);
    vi.setSystemTime(18_000);
    expect(await store.registerGoalAgainst()).toBe(true);

    expect(store.score()).toEqual({ home: 3, away: 1 });
    expect(storedEvents.at(-4)).toMatchObject({
      type: 'GOAL_FOR',
      scorerPlayerId: 'p3',
      gameClockMs: DEFAULT_PERIOD_DURATION_MS - 5_000,
      sequence: 9,
      lineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
    });
    expect(storedEvents.at(-1)).toMatchObject({
      type: 'GOAL_AGAINST',
      gameClockMs: DEFAULT_PERIOD_DURATION_MS - 8_000,
      sequence: 12,
      scoreBefore: { home: 3, away: 0 },
      scoreAfter: { home: 3, away: 1 },
    });

    await store.load(original.id);
    expect(store.score()).toEqual({ home: 3, away: 1 });
    expect(store.statistics().players['p3']?.goals).toBe(2);
    expect(store.statistics().players['p4']?.goals).toBe(1);
  });

  it('persists and derives accumulated fouls for the current period', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const original = readyMatch();
    const storedEvents: MatchEvent[] = [];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [],
            commit: async (_match: Match, events: MatchEvent[]) => storedEvents.push(...events),
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    vi.setSystemTime(15_000);
    expect(await store.registerTeamFoul('p1')).toBe(true);
    expect(await store.registerTeamFoul('p4')).toBe(true);
    expect(await store.registerOpponentFoul()).toBe(true);

    expect(store.currentPeriodFouls()).toEqual({ home: 2, away: 1 });
    expect(store.foulsByPeriod()).toEqual([
      { period: 1, home: 2, away: 1 },
      { period: 2, home: 0, away: 0 },
    ]);
    expect(storedEvents.slice(-3)).toMatchObject([
      { type: 'FOUL', team: 'home', periodFoulNumber: 1, sequence: 9 },
      { type: 'FOUL', team: 'home', playerId: 'p4', periodFoulNumber: 2, sequence: 10 },
      { type: 'FOUL', team: 'away', periodFoulNumber: 1, sequence: 11 },
    ]);
  });

  it('persists a send-off, freezes its effective timer and allows a valid replacement', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const original = readyMatch();
    const storedEvents: MatchEvent[] = [];
    const players = original.squadPlayerIds.map((id, index) => ({
      id,
      teamId: 'team-1',
      number: index + 1,
      name: `Jugador ${index + 1}`,
      active: true,
    }));
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => players } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [],
            commit: async (_match: Match, events: MatchEvent[]) => storedEvents.push(...events),
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    vi.setSystemTime(20_000);
    expect(await store.registerTeamFoul('p5', 'directRed')).toBe(true);
    expect(store.lineupPlayerIds()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(store.benchPlayers().map((player) => player.id)).toEqual(['p6']);
    expect(store.ourReductions()[0]).toMatchObject({ status: 'active', remainingMs: 120_000 });
    expect(store.statistics().players['p5']?.playedMs).toBe(10_000);

    await store.stopClock();
    vi.setSystemTime(80_000);
    vi.advanceTimersByTime(200);
    expect(store.ourReductions()[0]?.remainingMs).toBe(120_000);

    await store.startClock();
    vi.advanceTimersByTime(120_000);
    expect(store.ourReductions()[0]?.status).toBe('replacementAllowed');
    expect(await store.replaceSentOffPlayer(store.ourReductions()[0]!.eventId, 'p6')).toBe(true);
    expect(store.lineupPlayerIds()).toEqual(['p1', 'p2', 'p3', 'p4', 'p6']);
    expect(store.ourReductions()).toEqual([]);
    expect(store.statistics().players['p5']?.playedMs).toBe(10_000);
    expect(storedEvents.at(-1)?.type).toBe('RED_CARD_REPLACEMENT');
  });

  it('persists, rehydrates, sorts and undoes known rival jersey numbers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    let persistedMatch = readyMatch();
    const persistedEvents: MatchEvent[] = [];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => persistedMatch } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [...persistedEvents],
            commit: async (match: Match, events: MatchEvent[]) => {
              persistedMatch = match;
              persistedEvents.push(...events);
            },
          },
        },
      ],
    });
    const store = TestBed.inject(LiveMatchStore);
    await store.load(persistedMatch.id);
    await store.startClock();
    expect(await store.registerOpponentFoul('yellow', 12)).toBe(true);
    expect(await store.registerOpponentFoul('yellow', 7)).toBe(true);
    expect(store.knownOpponentPlayers()).toEqual([7, 12]);
    expect(store.opponentYellowCardsByNumber(7)).toBe(1);
    expect(store.opponentDirectRedsByNumber(7)).toBe(0);
    expect(store.isOpponentPlayerSentOff(7)).toBe(false);

    await store.load(persistedMatch.id);
    expect(store.knownOpponentPlayers()).toEqual([7, 12]);
    expect(
      store.disciplinaryState().opponentPlayers.map(({ jerseyNumber, yellowCards }) => ({
        jerseyNumber,
        yellowCards,
      })),
    ).toEqual([
      { jerseyNumber: 7, yellowCards: 1 },
      { jerseyNumber: 12, yellowCards: 1 },
    ]);

    expect(await store.undoLastEvent()).toBe(true);
    expect(store.knownOpponentPlayers()).toEqual([12]);
    expect(store.opponentYellowCardsByNumber(7)).toBe(0);
  });

  it('undoes a second-yellow send-off and restores lineup and discipline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const original = readyMatch();
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: { listByMatch: async () => [], commit: async () => undefined },
        },
      ],
    });
    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    expect(await store.registerTeamFoul('p4', 'yellow')).toBe(true);
    expect(await store.registerTeamFoul('p4', 'secondYellow')).toBe(true);
    expect(store.statistics().players['p4']).toMatchObject({
      yellowCards: 2,
      secondYellowSendOffs: 1,
      sendOffs: 1,
    });
    expect(store.lineupPlayerIds()).toHaveLength(4);

    expect(await store.undoLastEvent()).toBe(true);
    expect(store.lineupPlayerIds()).toHaveLength(5);
    expect(store.ourReductions()).toEqual([]);
    expect(store.statistics().players['p4']).toMatchObject({
      yellowCards: 1,
      secondYellowSendOffs: 0,
      sendOffs: 0,
    });
  });

  it('undoes goals and fouls in reverse order with compensating events', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const original = readyMatch();
    const storedEvents: MatchEvent[] = [];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [],
            commit: async (_match: Match, events: MatchEvent[]) => storedEvents.push(...events),
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    await store.registerGoalFor('p1');
    await store.registerTeamFoul('p1');

    expect(store.score().home).toBe(1);
    expect(store.statistics().players['p1']?.goals).toBe(1);
    expect(store.currentPeriodFouls().home).toBe(1);
    const foulId = storedEvents.at(-1)?.id;
    expect(await store.undoLastEvent()).toBe(true);
    expect(store.currentPeriodFouls().home).toBe(0);
    expect(storedEvents.at(-1)).toMatchObject({
      type: 'EVENT_UNDONE',
      targetEventId: foulId,
    });

    const goalId = storedEvents.find((event) => event.type === 'GOAL_FOR')?.id;
    expect(await store.undoLastEvent()).toBe(true);
    expect(store.score()).toEqual({ home: 0, away: 0 });
    expect(store.statistics().players['p1']?.goals).toBe(0);
    expect(storedEvents.at(-1)).toMatchObject({
      type: 'EVENT_UNDONE',
      targetEventId: goalId,
    });
    expect(store.timeline().some((item) => item.eventId === goalId)).toBe(false);
    expect(store.notice()).toBe('Acción deshecha: gol a favor.');
    expect(store.canUndo()).toBe(false);
  });

  it('recalculates lineup and playing time when a substitution is undone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const original = readyMatch();
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [],
            commit: async () => undefined,
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    vi.setSystemTime(15_000);
    await store.makeSubstitution('p1', 'p6');
    vi.setSystemTime(20_000);

    expect(await store.undoLastEvent()).toBe(true);
    expect(store.lineupPlayerIds()).toEqual(original.startingLineupPlayerIds);
    expect(store.playerPlayingTimes()['p1']?.playedMs).toBe(10_000);
    expect(store.playerPlayingTimes()['p6']?.playedMs).toBe(0);
  });

  it('recovers persisted events and projects a running clock after reopening', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const original = readyMatch();
    original.status = 'firstHalf';
    original.clock = {
      ...original.clock,
      running: true,
      remainingMs: DEFAULT_PERIOD_DURATION_MS - 5_000,
      startedAtEpochMs: 15_000,
    };
    const persistedEvents: MatchEvent[] = [
      {
        id: 'start',
        matchId: original.id,
        type: 'MATCH_STARTED',
        period: 1,
        gameClockMs: DEFAULT_PERIOD_DURATION_MS,
        timestamp: 10_000,
        sequence: 1,
        undone: false,
      },
      ...original.startingLineupPlayerIds.map((playerId, index): MatchEvent => ({
        id: `entered-${playerId}`,
        matchId: original.id,
        type: 'PLAYER_ENTERED',
        playerId,
        period: 1,
        gameClockMs: DEFAULT_PERIOD_DURATION_MS,
        timestamp: 10_000,
        sequence: index + 2,
        undone: false,
      })),
      {
        id: 'goal',
        matchId: original.id,
        type: 'GOAL_FOR',
        period: 1,
        gameClockMs: DEFAULT_PERIOD_DURATION_MS - 3_000,
        timestamp: 13_000,
        sequence: 7,
        undone: false,
        lineupPlayerIds: [...original.startingLineupPlayerIds],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 1, away: 0 },
      },
      {
        id: 'clock',
        matchId: original.id,
        type: 'CLOCK_STARTED',
        period: 1,
        gameClockMs: DEFAULT_PERIOD_DURATION_MS - 5_000,
        timestamp: 15_000,
        sequence: 8,
        undone: false,
      },
    ];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: { listByMatch: async () => persistedEvents, commit: async () => undefined },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);

    expect(store.score()).toEqual({ home: 1, away: 0 });
    expect(store.lineupPlayerIds()).toEqual(original.startingLineupPlayerIds);
    expect(store.remainingMs()).toBe(DEFAULT_PERIOD_DURATION_MS - 10_000);
    expect(store.clockRunning()).toBe(true);
    expect(store.timeline().some((item) => item.eventId === 'goal')).toBe(true);
  });

  it('rehydrates a stopped match with events and does not duplicate them on repeated loads', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    const original = readyMatch();
    original.startingLineupPlayerIds = ['p1', 'p4', 'p3', 'p5', 'p2'];
    original.status = 'firstHalf';
    original.clock = {
      ...original.clock,
      remainingMs: 511_000,
      running: false,
      startedAtEpochMs: null,
    };
    const hydratedPlayers = original.squadPlayerIds.map((id, index) => ({
      id,
      teamId: 'team-1',
      number: index + 1,
      name: `Jugador ${index + 1}`,
      active: true,
    }));
    const persistedEvents: MatchEvent[] = [
      ...original.startingLineupPlayerIds.map((playerId, index): MatchEvent => ({
        id: `entered-${playerId}`,
        matchId: original.id,
        type: 'PLAYER_ENTERED',
        playerId,
        period: 1,
        gameClockMs: DEFAULT_PERIOD_DURATION_MS,
        timestamp: index + 1,
        sequence: index + 1,
        undone: false,
      })),
      {
        id: 'clock-start',
        matchId: original.id,
        type: 'CLOCK_STARTED',
        period: 1,
        gameClockMs: DEFAULT_PERIOD_DURATION_MS,
        timestamp: 6,
        sequence: 6,
        undone: false,
      },
      {
        id: 'clock-stop',
        matchId: original.id,
        type: 'CLOCK_STOPPED',
        period: 1,
        gameClockMs: 511_000,
        timestamp: 7,
        sequence: 7,
        undone: false,
      },
      {
        id: 'goal',
        matchId: original.id,
        type: 'GOAL_FOR',
        period: 1,
        gameClockMs: 511_000,
        timestamp: 8,
        sequence: 8,
        undone: false,
        lineupPlayerIds: [...original.startingLineupPlayerIds],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 1, away: 0 },
      },
      {
        id: 'foul',
        matchId: original.id,
        type: 'FOUL',
        period: 1,
        gameClockMs: 511_000,
        timestamp: 9,
        sequence: 9,
        undone: false,
        team: 'home',
        periodFoulNumber: 1,
      },
      {
        id: 'substitution',
        matchId: original.id,
        type: 'SUBSTITUTION',
        period: 1,
        gameClockMs: 511_000,
        timestamp: 10,
        sequence: 10,
        undone: false,
        outPlayerId: 'p3',
        inPlayerId: 'p6',
      },
    ];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => hydratedPlayers } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [...persistedEvents],
            commit: async () => undefined,
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.load(original.id);

    expect(store.formattedClock()).toBe('08:31');
    expect(store.clockRunning()).toBe(false);
    expect(store.score()).toEqual({ home: 1, away: 0 });
    expect(store.currentPeriodFouls()).toEqual({ home: 1, away: 0 });
    expect(store.lineupPlayerIds()).toEqual(['p1', 'p4', 'p6', 'p5', 'p2']);
    expect(store.currentLineup().map((player) => player.id)).toEqual([
      'p1',
      'p4',
      'p6',
      'p5',
      'p2',
    ]);
    expect(store.playerPlayingTimes()['p1']?.playedMs).toBe(689_000);
    expect(store.events()).toHaveLength(persistedEvents.length);
    expect(new Set(store.events().map((event) => event.id)).size).toBe(persistedEvents.length);
    expect(store.timeline()).toHaveLength(persistedEvents.length);
  });

  it('replaces hydrated state when loading a different match', async () => {
    vi.useFakeTimers();
    const first = readyMatch();
    first.id = 'match-a';
    first.status = 'firstHalf';
    const second = readyMatch();
    second.id = 'match-b';
    second.status = 'firstHalf';
    const eventFor = (matchId: string, type: 'GOAL_FOR' | 'GOAL_AGAINST'): MatchEvent => ({
      id: `goal-${matchId}`,
      matchId,
      type,
      period: 1,
      gameClockMs: 1,
      timestamp: 1,
      sequence: 1,
      undone: false,
      lineupPlayerIds: [],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: type === 'GOAL_FOR' ? { home: 1, away: 0 } : { home: 0, away: 1 },
    });
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        {
          provide: MatchRepository,
          useValue: { get: async (id: string) => (id === first.id ? first : second) },
        },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async (id: string) => [
              eventFor(id, id === first.id ? 'GOAL_FOR' : 'GOAL_AGAINST'),
            ],
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(first.id);
    expect(store.score()).toEqual({ home: 1, away: 0 });
    await store.load(second.id);

    expect(store.match()?.id).toBe(second.id);
    expect(store.score()).toEqual({ home: 0, away: 1 });
    expect(store.events().map((event) => event.matchId)).toEqual([second.id]);
  });

  it('rehydrates a sent-off player and the remaining effective reduction time', async () => {
    vi.useFakeTimers();
    const original = readyMatch();
    original.status = 'firstHalf';
    original.clock = { ...createMatchClock(), remainingMs: 1_110_000 };
    const events: MatchEvent[] = [
      ...original.startingLineupPlayerIds.map((playerId, index): MatchEvent => ({
        id: `entered-${playerId}`,
        matchId: original.id,
        type: 'PLAYER_ENTERED',
        playerId,
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: index,
        sequence: index + 1,
        undone: false,
      })),
      {
        id: 'start',
        matchId: original.id,
        type: 'CLOCK_STARTED',
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: 6,
        sequence: 6,
        undone: false,
      },
      {
        id: 'red',
        matchId: original.id,
        type: 'FOUL',
        team: 'home',
        playerId: 'p5',
        accumulated: true,
        disciplinaryAction: 'directRed',
        periodFoulNumber: 1,
        period: 1,
        gameClockMs: 1_140_000,
        matchElapsedMs: 60_000,
        timestamp: 7,
        sequence: 7,
        undone: false,
      },
      {
        id: 'stop',
        matchId: original.id,
        type: 'CLOCK_STOPPED',
        period: 1,
        gameClockMs: 1_110_000,
        timestamp: 8,
        sequence: 8,
        undone: false,
      },
    ];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => events } },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);

    expect(store.lineupPlayerIds()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(store.disciplinaryState().sentOffPlayerIds).toEqual(['p5']);
    expect(store.ourReductions()[0]).toMatchObject({
      eventId: 'red',
      status: 'active',
      remainingMs: 90_000,
    });
  });

  it('deletes the active match and resets all in-memory state and clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const original = readyMatch();
    const deleted: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        {
          provide: MatchEventRepository,
          useValue: { listByMatch: async () => [], commit: async () => undefined },
        },
        {
          provide: DeleteMatchService,
          useValue: { execute: async (id: string) => deleted.push(id) },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    await store.startClock();
    await store.registerGoalFor();
    await store.registerTeamFoul('p1');
    expect(await store.deleteCurrentMatch()).toBe(true);

    expect(deleted).toEqual([original.id]);
    expect(store.match()).toBeNull();
    expect(store.events()).toEqual([]);
    expect(store.players()).toEqual([]);
    expect(store.formattedClock()).toBe('20:00');
    expect(store.clockRunning()).toBe(false);
    expect(store.score()).toEqual({ home: 0, away: 0 });
    expect(store.currentPeriodFouls()).toEqual({ home: 0, away: 0 });
    expect(store.timeline()).toEqual([]);
    expect(store.lineupPlayerIds()).toEqual([]);
  });

  it('does not reset the active store when deletion fails', async () => {
    vi.useFakeTimers();
    const original = readyMatch();
    TestBed.configureTestingModule({
      providers: [
        LiveMatchStore,
        { provide: MatchRepository, useValue: { get: async () => original } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => [] } },
        {
          provide: DeleteMatchService,
          useValue: {
            execute: async () => {
              throw new Error('failure');
            },
          },
        },
      ],
    });

    const store = TestBed.inject(LiveMatchStore);
    await store.load(original.id);
    expect(await store.deleteCurrentMatch()).toBe(false);

    expect(store.match()).toBe(original);
    expect(store.formattedClock()).toBe('20:00');
    expect(store.error()).toContain('siguen guardados');
  });
});
