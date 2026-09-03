import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { DisciplinaryAction, FoulTeam, MatchEvent } from '../../../shared/models/match-event';
import { deriveMatchState } from './derived-match-state';
import {
  deriveDisciplinaryState,
  NUMERICAL_REDUCTION_DURATION_MS,
  registerRedCardReplacement,
} from './discipline';

const match: Match = {
  id: 'match-1',
  teamId: 'team-1',
  homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
  awayTeam: { name: 'Rival', shortName: 'RIV' },
  date: 1,
  status: 'firstHalf',
  currentPeriod: 1,
  periodCount: 2,
  clock: createMatchClock(),
  squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
  startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
  createdAt: 1,
  updatedAt: 1,
};

function foul(
  id: string,
  sequence: number,
  team: FoulTeam,
  action: DisciplinaryAction,
  elapsedMs: number,
  playerId = team === 'home' ? 'p1' : undefined,
  opponentPlayerNumber?: number,
): MatchEvent {
  return {
    id,
    matchId: match.id,
    type: 'FOUL',
    team,
    playerId,
    opponentPlayerNumber,
    accumulated: true,
    disciplinaryAction: action,
    periodFoulNumber: sequence,
    period: 1,
    gameClockMs: 1_200_000 - elapsedMs,
    matchElapsedMs: elapsedMs,
    timestamp: sequence,
    sequence,
    undone: false,
  };
}

function goal(id: string, sequence: number, side: 'home' | 'away', elapsedMs: number): MatchEvent {
  return {
    id,
    matchId: match.id,
    type: side === 'home' ? 'GOAL_FOR' : 'GOAL_AGAINST',
    period: 1,
    gameClockMs: 1_200_000 - elapsedMs,
    matchElapsedMs: elapsedMs,
    timestamp: sequence,
    sequence,
    undone: false,
    lineupPlayerIds: ['p1', 'p2', 'p3', 'p4'],
    scoreBefore: { home: 0, away: 0 },
    scoreAfter: side === 'home' ? { home: 1, away: 0 } : { home: 0, away: 1 },
  };
}

describe('futsal discipline and numerical reductions', () => {
  it('counts a second yellow as a second caution and a send-off', () => {
    const state = deriveDisciplinaryState(
      [
        foul('yellow', 1, 'home', 'yellow', 10_000),
        foul('second', 2, 'home', 'secondYellow', 20_000),
      ],
      20_000,
    );

    expect(state.players['p1']).toEqual({
      fouls: 2,
      yellowCards: 2,
      secondYellowSendOffs: 1,
      directRedCards: 0,
      sendOffs: 1,
    });
    expect(state.sentOffPlayerIds).toEqual(['p1']);
    expect(state.reductions[0]).toMatchObject({ source: 'secondYellow', remainingMs: 120_000 });
  });

  it('derives unique sorted rival numbers and their disciplinary state', () => {
    const state = deriveDisciplinaryState(
      [
        foul('twelve', 1, 'away', 'yellow', 1, undefined, 12),
        foul('four', 2, 'away', 'yellow', 2, undefined, 4),
        foul('seven', 3, 'away', 'yellow', 3, undefined, 7),
        foul('seven-second', 4, 'away', 'secondYellow', 4, undefined, 7),
        foul('twenty-three', 5, 'away', 'directRed', 5, undefined, 23),
      ],
      5,
    );

    expect(state.opponentPlayers.map((player) => player.jerseyNumber)).toEqual([4, 7, 12, 23]);
    expect(state.opponentPlayers.find((player) => player.jerseyNumber === 7)).toMatchObject({
      yellowCards: 2,
      secondYellowSendOffs: 1,
      sentOff: true,
    });
    expect(state.opponentPlayers.find((player) => player.jerseyNumber === 23)).toMatchObject({
      directRedCards: 1,
      sentOff: true,
    });
  });

  it('removes a rival number discovered only by an undone event', () => {
    const yellow = foul('yellow-23', 1, 'away', 'yellow', 1, undefined, 23);
    const undo: MatchEvent = {
      id: 'undo-yellow',
      matchId: match.id,
      type: 'EVENT_UNDONE',
      targetEventId: yellow.id,
      period: 1,
      gameClockMs: 1,
      timestamp: 2,
      sequence: 2,
      undone: false,
    };
    expect(deriveDisciplinaryState([yellow], 1).opponentPlayers).toHaveLength(1);
    expect(deriveDisciplinaryState([yellow, undo], 1).opponentPlayers).toEqual([]);
  });

  it('removes a sent-off player from the projected lineup and undo restores everything', () => {
    const entered = ['p1', 'p2', 'p3', 'p4', 'p5'].map((playerId, index): MatchEvent => ({
      id: `in-${playerId}`,
      matchId: match.id,
      type: 'PLAYER_ENTERED',
      playerId,
      period: 1,
      gameClockMs: 1_200_000,
      timestamp: index,
      sequence: index + 1,
      undone: false,
    }));
    const red = foul('red', 6, 'home', 'directRed', 10_000);
    expect(deriveMatchState(match, [...entered, red]).currentLineupPlayerIds).toHaveLength(4);

    const undo: MatchEvent = {
      id: 'undo',
      matchId: match.id,
      type: 'EVENT_UNDONE',
      targetEventId: 'red',
      period: 1,
      gameClockMs: 1_190_000,
      timestamp: 7,
      sequence: 7,
      undone: false,
    };
    expect(deriveMatchState(match, [...entered, red, undo]).currentLineupPlayerIds).toHaveLength(5);
    expect(deriveDisciplinaryState([...entered, red, undo], 10_000).reductions).toEqual([]);
  });

  it('uses only effective elapsed time and carries the reduction across a stopped clock or period', () => {
    const events = [foul('red', 1, 'home', 'directRed', 30_000)];
    expect(deriveDisciplinaryState(events, 60_000).reductions[0]?.remainingMs).toBe(90_000);
    expect(deriveDisciplinaryState(events, 60_000).reductions[0]?.remainingMs).toBe(90_000);
    expect(deriveDisciplinaryState(events, 149_999).reductions[0]?.status).toBe('active');
    expect(deriveDisciplinaryState(events, 150_000).reductions[0]).toMatchObject({
      status: 'replacementAllowed',
      remainingMs: 0,
      releasedReason: 'twoMinutes',
    });
  });

  it.each([
    { label: '5v4', events: [foul('a1', 1, 'away', 'directRed', 0)], side: 'home', released: 1 },
    {
      label: '4v3',
      events: [
        foul('h1', 1, 'home', 'directRed', 0),
        foul('a1', 2, 'away', 'directRed', 1),
        foul('a2', 3, 'away', 'directRed', 2),
      ],
      side: 'home',
      released: 1,
    },
    {
      label: '5v3',
      events: [foul('a1', 1, 'away', 'directRed', 0), foul('a2', 2, 'away', 'directRed', 1)],
      side: 'home',
      released: 1,
    },
    { label: '4v5', events: [foul('h1', 1, 'home', 'directRed', 0)], side: 'home', released: 0 },
    {
      label: '4v4',
      events: [foul('h1', 1, 'home', 'directRed', 0), foul('a1', 2, 'away', 'directRed', 1)],
      side: 'home',
      released: 0,
    },
    {
      label: '3v3',
      events: [
        foul('h1', 1, 'home', 'directRed', 0),
        foul('h2', 2, 'home', 'directRed', 1, 'p2'),
        foul('a1', 3, 'away', 'directRed', 2),
        foul('a2', 4, 'away', 'directRed', 3),
      ],
      side: 'away',
      released: 0,
    },
  ] as const)('$label applies the goal-release rule', ({ events, side, released }) => {
    const goalEvent = goal('goal', events.length + 1, side, 10_000);
    const state = deriveDisciplinaryState([...events, goalEvent], 10_000);
    expect(state.reductions.filter((item) => item.releasedReason === 'opponentGoal')).toHaveLength(
      released,
    );
  });

  it('releases only the oldest of two reductions after one goal', () => {
    const state = deriveDisciplinaryState(
      [
        foul('first', 1, 'away', 'directRed', 0),
        foul('second', 2, 'away', 'directRed', 1),
        goal('goal', 3, 'home', 10_000),
      ],
      10_000,
    );
    expect(state.reductions.map(({ eventId, status }) => ({ eventId, status }))).toEqual([
      { eventId: 'first', status: 'replacementAllowed' },
      { eventId: 'second', status: 'active' },
    ]);
  });

  it('undoing the releasing goal restores the active reduction', () => {
    const events: MatchEvent[] = [
      foul('red', 1, 'home', 'directRed', 0),
      goal('goal', 2, 'away', 10_000),
      {
        id: 'undo',
        matchId: match.id,
        type: 'EVENT_UNDONE',
        targetEventId: 'goal',
        period: 1,
        gameClockMs: 1_190_000,
        timestamp: 3,
        sequence: 3,
        undone: false,
      },
    ];
    expect(deriveDisciplinaryState(events, 10_000).reductions[0]).toMatchObject({
      status: 'active',
      remainingMs: 110_000,
    });
  });

  it('registers a valid replacement without allowing the sent-off player back', () => {
    const reduction = deriveDisciplinaryState(
      [foul('red', 1, 'home', 'directRed', 0)],
      NUMERICAL_REDUCTION_DURATION_MS,
    ).reductions[0];
    const common = {
      match,
      reduction,
      currentLineupPlayerIds: ['p2', 'p3', 'p4', 'p5'],
      sentOffPlayerIds: ['p1'],
      gameClockMs: 1_080_000,
      matchElapsedMs: 120_000,
      timestamp: 2,
      sequence: 2,
      eventId: 'replacement',
    };
    expect(registerRedCardReplacement({ ...common, playerId: 'p1' })).toEqual({
      ok: false,
      error: 'Un jugador expulsado no puede volver a entrar.',
    });
    expect(registerRedCardReplacement({ ...common, playerId: 'p6' }).ok).toBe(true);
  });
});
