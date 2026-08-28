import { createMatchClock } from '../../../core/clock/match-clock';
import { Match, MatchStatus } from '../../../shared/models/match';
import { makeSubstitution, SubstitutionInput } from './substitution';

function match(status: MatchStatus = 'firstHalf'): Match {
  return {
    id: 'match-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: 1,
    status,
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    createdAt: 1,
    updatedAt: 1,
  };
}

function input(overrides: Partial<SubstitutionInput> = {}): SubstitutionInput {
  return {
    match: match(),
    currentLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    outPlayerId: 'p5',
    inPlayerId: 'p6',
    gameClockMs: 754_321,
    timestamp: 10_000,
    sequence: 12,
    eventId: 'event-12',
    ...overrides,
  };
}

describe('substitution domain', () => {
  it('creates an exact substitution event and preserves a five-player lineup', () => {
    const result = makeSubstitution(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.match.updatedAt).toBe(10_000);
    expect(result.value.event).toEqual({
      id: 'event-12',
      matchId: 'match-1',
      type: 'SUBSTITUTION',
      period: 1,
      gameClockMs: 754_321,
      timestamp: 10_000,
      sequence: 12,
      undone: false,
      outPlayerId: 'p5',
      inPlayerId: 'p6',
    });
  });

  it.each<MatchStatus>(['ready', 'finished'])(
    'rejects substitutions when match is %s',
    (status) => {
      expect(makeSubstitution(input({ match: match(status) })).ok).toBe(false);
    },
  );

  it('requires a complete five-player lineup', () => {
    expect(makeSubstitution(input({ currentLineupPlayerIds: ['p1', 'p2'] }))).toEqual({
      ok: false,
      error: 'El quinteto actual debe tener exactamente 5 jugadores.',
    });
  });

  it('requires the outgoing player to be on court', () => {
    expect(makeSubstitution(input({ outPlayerId: 'p7' }))).toEqual({
      ok: false,
      error: 'El jugador que sale no está en pista.',
    });
  });

  it('requires the incoming player to be selected for the match', () => {
    expect(makeSubstitution(input({ inPlayerId: 'unknown' }))).toEqual({
      ok: false,
      error: 'El jugador que entra no está convocado.',
    });
  });

  it('does not allow a player who is already on court to enter', () => {
    expect(makeSubstitution(input({ inPlayerId: 'p4' }))).toEqual({
      ok: false,
      error: 'El jugador que entra ya está en pista.',
    });
  });

  it('allows substitutions during halftime', () => {
    expect(makeSubstitution(input({ match: match('halftime') })).ok).toBe(true);
  });
});
