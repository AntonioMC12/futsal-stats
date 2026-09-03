import { createMatchClock } from '../../../core/clock/match-clock';
import { Match, MatchStatus } from '../../../shared/models/match';
import { RegisterGoalInput, registerGoal } from './goal';

function match(status: MatchStatus = 'firstHalf'): Match {
  return {
    id: 'match-1',
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: 1,
    status,
    currentPeriod: status === 'secondHalf' ? 2 : 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    createdAt: 1,
    updatedAt: 1,
  };
}

function input(overrides: Partial<RegisterGoalInput> = {}): RegisterGoalInput {
  return {
    match: match(),
    side: 'for',
    currentLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    score: { home: 2, away: 1 },
    gameClockMs: 522_123,
    timestamp: 10_000,
    sequence: 20,
    eventId: 'goal-20',
    ...overrides,
  };
}

describe('goal domain', () => {
  it('registers a goal for with score and lineup snapshots', () => {
    const currentLineup = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const score = { home: 2, away: 1 };
    const result = registerGoal(
      input({ currentLineupPlayerIds: currentLineup, score, scorerPlayerId: 'p3' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.event).toEqual({
      id: 'goal-20',
      matchId: 'match-1',
      type: 'GOAL_FOR',
      scorerPlayerId: 'p3',
      period: 1,
      gameClockMs: 522_123,
      timestamp: 10_000,
      sequence: 20,
      undone: false,
      lineupPlayerIds: currentLineup,
      scoreBefore: { home: 2, away: 1 },
      scoreAfter: { home: 3, away: 1 },
      matchElapsedMs: 0,
    });
    expect(result.value.match.updatedAt).toBe(10_000);

    currentLineup[0] = 'changed';
    score.home = 99;
    expect(result.value.event.lineupPlayerIds[0]).toBe('p1');
    expect(result.value.event.scoreBefore.home).toBe(2);
  });

  it('registers a goal against during the second half', () => {
    const result = registerGoal(
      input({ match: match('secondHalf'), side: 'against', score: { home: 3, away: 4 } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.event.type).toBe('GOAL_AGAINST');
    expect(result.value.event.period).toBe(2);
    expect(result.value.event.scoreAfter).toEqual({ home: 3, away: 5 });
  });

  it.each<MatchStatus>(['ready', 'halftime', 'finished'])(
    'rejects goals when match is %s',
    (status) => {
      expect(registerGoal(input({ match: match(status) }))).toEqual({
        ok: false,
        error: 'Los goles solo se pueden registrar durante un periodo en juego.',
      });
    },
  );

  it('requires between three and five different players in the snapshot', () => {
    expect(registerGoal(input({ currentLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p4'] }))).toEqual(
      {
        ok: false,
        error: 'Debe haber entre 3 y 5 jugadores diferentes en pista para registrar un gol.',
      },
    );
  });

  it('accepts a goal while playing in numerical inferiority', () => {
    expect(registerGoal(input({ currentLineupPlayerIds: ['p1', 'p2', 'p3', 'p4'] })).ok).toBe(true);
  });

  it('registers a goal for without a scorer', () => {
    const result = registerGoal(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.event.type).toBe('GOAL_FOR');
    expect('scorerPlayerId' in result.value.event).toBe(false);
  });

  it('rejects a scorer who is not in the lineup snapshot', () => {
    expect(registerGoal(input({ scorerPlayerId: 'p6' }))).toEqual({
      ok: false,
      error: 'El goleador debe estar en pista al registrar el gol.',
    });
  });

  it('rejects a scorer on a goal against', () => {
    expect(registerGoal(input({ side: 'against', scorerPlayerId: 'p1' }))).toEqual({
      ok: false,
      error: 'Solo los goles a favor pueden tener goleador.',
    });
  });

  it('rejects a lineup containing a player outside the squad', () => {
    expect(
      registerGoal(input({ currentLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'unknown'] })),
    ).toEqual({
      ok: false,
      error: 'El quinteto contiene jugadores que no están convocados.',
    });
  });

  it.each([
    { home: -1, away: 0 },
    { home: 1.5, away: 0 },
    { home: 0, away: Number.NaN },
  ])('rejects invalid score $home-$away', (score) => {
    expect(registerGoal(input({ score }))).toEqual({
      ok: false,
      error: 'El marcador actual no es válido.',
    });
  });
});
