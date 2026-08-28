import { createMatchClock } from '../../../core/clock/match-clock';
import { Match, MatchStatus } from '../../../shared/models/match';
import { RegisterFoulInput, registerFoul } from './foul';

function match(status: MatchStatus = 'firstHalf'): Match {
  return {
    id: 'match-1',
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

function input(overrides: Partial<RegisterFoulInput> = {}): RegisterFoulInput {
  return {
    match: match(),
    team: 'home',
    currentPeriodFoulCount: 3,
    gameClockMs: 754_321,
    timestamp: 10_000,
    sequence: 15,
    eventId: 'foul-15',
    ...overrides,
  };
}

describe('foul domain', () => {
  it('registers a team foul with its accumulated period number', () => {
    const result = registerFoul(input({ playerId: 'p4' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.event).toEqual({
      id: 'foul-15',
      matchId: 'match-1',
      type: 'FOUL',
      period: 1,
      gameClockMs: 754_321,
      timestamp: 10_000,
      sequence: 15,
      undone: false,
      team: 'home',
      playerId: 'p4',
      periodFoulNumber: 4,
    });
    expect(result.value.match.updatedAt).toBe(10_000);
  });

  it('registers an opponent foul in the second period', () => {
    const result = registerFoul(
      input({ match: match('secondHalf'), team: 'away', currentPeriodFoulCount: 0 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.event).toMatchObject({
      team: 'away',
      period: 2,
      periodFoulNumber: 1,
    });
  });

  it.each<MatchStatus>(['ready', 'halftime', 'finished'])(
    'rejects fouls when match is %s',
    (status) => {
      expect(registerFoul(input({ match: match(status) }))).toEqual({
        ok: false,
        error: 'Las faltas solo se pueden registrar durante un periodo en juego.',
      });
    },
  );

  it.each([-1, 1.5, Number.NaN])('rejects invalid current count %s', (count) => {
    expect(registerFoul(input({ currentPeriodFoulCount: count }))).toEqual({
      ok: false,
      error: 'El número actual de faltas no es válido.',
    });
  });

  it('rejects a non-selected player', () => {
    expect(registerFoul(input({ playerId: 'unknown' }))).toEqual({
      ok: false,
      error: 'El jugador de la falta no está convocado.',
    });
  });

  it('does not assign a home player to an opponent foul', () => {
    expect(registerFoul(input({ team: 'away', playerId: 'p1' }))).toEqual({
      ok: false,
      error: 'No se puede asignar un jugador propio a una falta rival.',
    });
  });
});
