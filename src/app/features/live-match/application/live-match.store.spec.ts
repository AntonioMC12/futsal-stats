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

    expect(store.derivedState()?.currentLineupPlayerIds).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
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
    expect(await store.registerGoalFor()).toBe(true);
    expect(storedEvents.at(-1)).toMatchObject({
      type: 'GOAL_FOR',
      lineupPlayerIds: ['p2', 'p3', 'p4', 'p5', 'p6'],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
    });
    expect(store.statistics().players['p1']?.goalsForOnCourt).toBe(0);
    expect(store.statistics().players['p6']?.goalsForOnCourt).toBe(1);
    expect(store.lineupStatistics().find((lineup) => lineup.id === 'p2|p3|p4|p5|p6')).toMatchObject(
      { playedMs: 1_000, goalsFor: 1, goalsAgainst: 0, plusMinus: 1 },
    );
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
    expect(await store.registerGoalFor()).toBe(true);
    vi.setSystemTime(16_000);
    expect(await store.registerGoalAgainst()).toBe(true);

    expect(store.score()).toEqual({ home: 1, away: 1 });
    expect(storedEvents.at(-2)).toMatchObject({
      type: 'GOAL_FOR',
      gameClockMs: DEFAULT_PERIOD_DURATION_MS - 5_000,
      sequence: 9,
      lineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
    });
    expect(storedEvents.at(-1)).toMatchObject({
      type: 'GOAL_AGAINST',
      gameClockMs: DEFAULT_PERIOD_DURATION_MS - 6_000,
      sequence: 10,
      scoreBefore: { home: 1, away: 0 },
      scoreAfter: { home: 1, away: 1 },
    });
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
    expect(await store.registerTeamFoul()).toBe(true);
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
    await store.registerGoalFor();
    await store.registerTeamFoul();

    expect(store.score().home).toBe(1);
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
    await store.registerTeamFoul();
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
