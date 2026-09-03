import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { registerBenchDiscipline, RegisterBenchDisciplineInput } from './bench-discipline';
import { deriveMatchState } from './derived-match-state';
import { deriveDisciplinaryState } from './discipline';

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
  squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
  startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
  createdAt: 1,
  updatedAt: 1,
};

function input(
  overrides: Partial<RegisterBenchDisciplineInput> = {},
): RegisterBenchDisciplineInput {
  return {
    match,
    team: 'home',
    subjectKind: 'player',
    playerId: 'p6',
    disciplinaryAction: 'yellow',
    reason: 'protest',
    currentPeriodFoulCount: 3,
    currentLineupPlayerIds: match.startingLineupPlayerIds,
    currentYellowCards: 0,
    subjectSentOff: false,
    gameClockMs: 900_000,
    timestamp: 10,
    sequence: 10,
    eventId: 'bench-10',
    ...overrides,
  };
}

function benchEvent(
  id: string,
  sequence: number,
  overrides: Partial<Extract<MatchEvent, { type: 'BENCH_DISCIPLINE' }>> = {},
): Extract<MatchEvent, { type: 'BENCH_DISCIPLINE' }> {
  return {
    id,
    matchId: match.id,
    type: 'BENCH_DISCIPLINE',
    team: 'home',
    subjectKind: 'staff',
    staffRole: 'headCoach',
    staffIdentityKey: 'home:headCoach:sin-nombre',
    disciplinaryAction: 'yellow',
    reason: 'protest',
    context: 'bench',
    countsAsAccumulatedFoul: true,
    createsDirectFreeKickWithoutWall: false,
    periodFoulNumber: sequence,
    period: 1,
    gameClockMs: 900_000,
    timestamp: sequence,
    sequence,
    undone: false,
    ...overrides,
  };
}

function lineupEvents(): MatchEvent[] {
  return match.startingLineupPlayerIds.map((playerId, index) => ({
    id: `enter-${playerId}`,
    matchId: match.id,
    type: 'PLAYER_ENTERED',
    playerId,
    period: 1,
    gameClockMs: 1_200_000,
    timestamp: index + 1,
    sequence: index + 1,
    undone: false,
  }));
}

describe('bench discipline domain', () => {
  it('registers one accumulated foul for a protest card without creating a special restart', () => {
    const result = registerBenchDiscipline(input());
    expect(result).toMatchObject({
      ok: true,
      value: {
        event: {
          type: 'BENCH_DISCIPLINE',
          playerId: 'p6',
          periodFoulNumber: 4,
          countsAsAccumulatedFoul: true,
          createsDirectFreeKickWithoutWall: false,
        },
      },
    });
  });

  it('keeps a non-protest card out of the accumulated-foul count', () => {
    const result = registerBenchDiscipline(input({ reason: 'other' }));
    expect(result).toMatchObject({
      ok: true,
      value: { event: { periodFoulNumber: 3, countsAsAccumulatedFoul: false } },
    });
  });

  it('supports a rival substitute by jersey number without a rival roster', () => {
    const result = registerBenchDiscipline(
      input({
        team: 'away',
        subjectKind: 'opponentPlayer',
        playerId: undefined,
        opponentPlayerNumber: 7,
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        event: {
          team: 'away',
          subjectKind: 'opponentPlayer',
          opponentPlayerNumber: 7,
          countsAsAccumulatedFoul: true,
        },
      },
    });
    if (!result.ok) return;
    const discipline = deriveDisciplinaryState([result.value.event], 0);
    expect(discipline.teams.away).toMatchObject({ fouls: 1, yellowCards: 1 });
    expect(discipline.opponentPlayers[0]).toMatchObject({ jerseyNumber: 7, yellowCards: 1 });
    expect(discipline.reductions).toHaveLength(0);
  });

  it('requires a genuine substitute and enforces the global yellow-card sequence', () => {
    expect(registerBenchDiscipline(input({ playerId: 'p1' }))).toEqual({
      ok: false,
      error: 'La disciplina de banquillo solo admite jugadores que sean suplentes.',
    });
    expect(registerBenchDiscipline(input({ disciplinaryAction: 'secondYellow' }))).toEqual({
      ok: false,
      error: 'La segunda amarilla requiere una amarilla previa.',
    });
    expect(
      registerBenchDiscipline(input({ disciplinaryAction: 'secondYellow', currentYellowCards: 1 }))
        .ok,
    ).toBe(true);
  });

  it('creates stable match-local staff identities and distinguishes named people', () => {
    const first = registerBenchDiscipline(
      input({ subjectKind: 'staff', playerId: undefined, staffRole: 'physiotherapist' }),
    );
    const named = registerBenchDiscipline(
      input({
        subjectKind: 'staff',
        playerId: undefined,
        staffRole: 'physiotherapist',
        staffName: '  Carlos   Pérez ',
      }),
    );
    expect(first.ok && first.value.event.staffIdentityKey).toBe('home:physiotherapist:sin-nombre');
    expect(named.ok && named.value.event.staffIdentityKey).toBe(
      'home:physiotherapist:carlos pérez',
    );
    expect(named.ok && named.value.event.staffName).toBe('Carlos Pérez');
  });

  it.each([
    { reason: 'protest' as const, expectedFouls: 5, counts: true },
    { reason: 'other' as const, expectedFouls: 4, counts: false },
  ])(
    'handles a physiotherapist card with reason $reason without assuming every card is a foul',
    ({ reason, expectedFouls, counts }) => {
      const result = registerBenchDiscipline(
        input({
          subjectKind: 'staff',
          playerId: undefined,
          staffRole: 'physiotherapist',
          reason,
          currentPeriodFoulCount: 4,
        }),
      );
      expect(result).toMatchObject({
        ok: true,
        value: {
          event: {
            periodFoulNumber: expectedFouls,
            countsAsAccumulatedFoul: counts,
            createsDirectFreeKickWithoutWall: false,
          },
        },
      });
    },
  );

  it('validates and projects a second yellow for the same match-local staff identity', () => {
    const second = registerBenchDiscipline(
      input({
        subjectKind: 'staff',
        playerId: undefined,
        staffRole: 'doctor',
        staffName: 'Ana',
        disciplinaryAction: 'secondYellow',
        currentYellowCards: 1,
      }),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const first = benchEvent('first-yellow', 1, {
      staffRole: 'doctor',
      staffName: 'Ana',
      staffIdentityKey: 'home:doctor:ana',
    });
    const discipline = deriveDisciplinaryState([first, second.value.event], 0);
    expect(discipline.staffMembers[0]).toMatchObject({
      role: 'doctor',
      name: 'Ana',
      yellowCards: 2,
      secondYellowSendOffs: 1,
      sentOff: true,
    });
    expect(discipline.reductions).toHaveLength(0);
  });

  it('projects the RFEF example from four to six fouls without numerical reductions', () => {
    const normalFouls: MatchEvent[] = Array.from({ length: 4 }, (_, index) => ({
      id: `foul-${index}`,
      matchId: match.id,
      type: 'FOUL',
      team: 'home',
      playerId: 'p1',
      periodFoulNumber: index + 1,
      accumulated: true,
      disciplinaryAction: 'none',
      period: 1,
      gameClockMs: 1_000_000 - index,
      timestamp: index + 10,
      sequence: index + 10,
      undone: false,
    }));
    const events = [
      ...normalFouls,
      benchEvent('coach', 14, { periodFoulNumber: 5 }),
      benchEvent('substitute', 15, {
        subjectKind: 'player',
        playerId: 'p6',
        staffRole: undefined,
        staffIdentityKey: undefined,
        periodFoulNumber: 6,
      }),
    ];

    expect(deriveMatchState(match, events).foulsByPeriod[1]?.home).toBe(6);
    expect(deriveDisciplinaryState(events, 0).reductions).toHaveLength(0);
  });

  it('keeps the accumulated foul in its period while preserving the personal card', () => {
    const firstPeriod = benchEvent('first-period-card', 1, {
      subjectKind: 'player',
      playerId: 'p6',
      staffRole: undefined,
      staffIdentityKey: undefined,
    });
    const secondPeriod = benchEvent('second-period-card', 2, {
      team: 'away',
      subjectKind: 'opponentPlayer',
      opponentPlayerNumber: 9,
      staffRole: undefined,
      staffIdentityKey: undefined,
      period: 2,
    });
    const derived = deriveMatchState(match, [firstPeriod, secondPeriod]);
    const discipline = deriveDisciplinaryState([firstPeriod, secondPeriod], 0);
    expect(derived.foulsByPeriod[1]).toEqual({ home: 1, away: 0 });
    expect(derived.foulsByPeriod[2]).toEqual({ home: 0, away: 1 });
    expect(discipline.players['p6']?.yellowCards).toBe(1);
    expect(discipline.opponentPlayers[0]?.yellowCards).toBe(1);
  });

  it('sends off a substitute without changing the lineup or creating a reduction', () => {
    const event = benchEvent('red-substitute', 6, {
      subjectKind: 'player',
      playerId: 'p6',
      staffRole: undefined,
      staffIdentityKey: undefined,
      disciplinaryAction: 'directRed',
      reason: 'other',
      countsAsAccumulatedFoul: false,
      periodFoulNumber: 0,
    });
    const events = [...lineupEvents(), event];
    const discipline = deriveDisciplinaryState(events, 0);

    expect(deriveMatchState(match, events).currentLineupPlayerIds).toEqual(
      match.startingLineupPlayerIds,
    );
    expect(discipline.sentOffPlayerIds).toContain('p6');
    expect(discipline.reductions).toHaveLength(0);
    expect(discipline.teams.home.fouls).toBe(0);
  });

  it('applies a later on-court second yellow normally after a bench yellow', () => {
    const events: MatchEvent[] = [
      ...lineupEvents(),
      benchEvent('bench-yellow', 6, {
        subjectKind: 'player',
        playerId: 'p6',
        staffRole: undefined,
        staffIdentityKey: undefined,
      }),
      {
        id: 'substitution',
        matchId: match.id,
        type: 'SUBSTITUTION',
        outPlayerId: 'p5',
        inPlayerId: 'p6',
        period: 1,
        gameClockMs: 800_000,
        timestamp: 7,
        sequence: 7,
        undone: false,
      },
      {
        id: 'on-court-second-yellow',
        matchId: match.id,
        type: 'FOUL',
        team: 'home',
        playerId: 'p6',
        periodFoulNumber: 2,
        accumulated: true,
        disciplinaryAction: 'secondYellow',
        matchElapsedMs: 100_000,
        period: 1,
        gameClockMs: 700_000,
        timestamp: 8,
        sequence: 8,
        undone: false,
      },
    ];

    expect(deriveDisciplinaryState(events, 100_000).players['p6']?.yellowCards).toBe(2);
    expect(deriveDisciplinaryState(events, 100_000).reductions).toHaveLength(1);
    expect(deriveMatchState(match, events).currentLineupPlayerIds).not.toContain('p6');
  });

  it('sends off a substituted player on the bench without removing a court player', () => {
    const firstYellow: MatchEvent = {
      id: 'on-court-yellow',
      matchId: match.id,
      type: 'FOUL',
      team: 'home',
      playerId: 'p5',
      periodFoulNumber: 1,
      accumulated: true,
      disciplinaryAction: 'yellow',
      period: 1,
      gameClockMs: 900_000,
      timestamp: 6,
      sequence: 6,
      undone: false,
    };
    const substitution: MatchEvent = {
      id: 'substitution',
      matchId: match.id,
      type: 'SUBSTITUTION',
      outPlayerId: 'p5',
      inPlayerId: 'p6',
      period: 1,
      gameClockMs: 850_000,
      timestamp: 7,
      sequence: 7,
      undone: false,
    };
    const secondYellow = benchEvent('bench-second-yellow', 8, {
      subjectKind: 'player',
      playerId: 'p5',
      staffRole: undefined,
      staffIdentityKey: undefined,
      disciplinaryAction: 'secondYellow',
      periodFoulNumber: 2,
    });
    const events = [...lineupEvents(), firstYellow, substitution, secondYellow];
    const discipline = deriveDisciplinaryState(events, 0);

    expect(deriveMatchState(match, events).currentLineupPlayerIds).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p6',
    ]);
    expect(discipline.players['p5']).toMatchObject({ yellowCards: 2, sendOffs: 1 });
    expect(discipline.sentOffPlayerIds).toContain('p5');
    expect(discipline.reductions).toHaveLength(0);
    expect(discipline.teams.home.fouls).toBe(2);
  });

  it('sends off staff for a protest with one foul and no numerical reduction', () => {
    const event = benchEvent('staff-red', 1, { disciplinaryAction: 'directRed' });
    const discipline = deriveDisciplinaryState([event], 0);
    expect(discipline.teams.home).toMatchObject({ fouls: 1, directRedCards: 1, sendOffs: 1 });
    expect(discipline.staffMembers[0]).toMatchObject({
      role: 'headCoach',
      sentOff: true,
      directRedCards: 1,
    });
    expect(discipline.reductions).toHaveLength(0);
  });

  it('undo removes the card, foul and staff send-off through event projection', () => {
    const red = benchEvent('staff-red', 1, { disciplinaryAction: 'directRed' });
    const undo: MatchEvent = {
      id: 'undo',
      matchId: match.id,
      type: 'EVENT_UNDONE',
      targetEventId: red.id,
      period: 1,
      gameClockMs: 900_000,
      timestamp: 2,
      sequence: 2,
      undone: false,
    };
    const state = deriveDisciplinaryState([red, undo], 0);
    expect(state.teams.home.fouls).toBe(0);
    expect(state.staffMembers).toHaveLength(0);
    expect(deriveMatchState(match, [red, undo]).foulsByPeriod[1]).toBeUndefined();
  });
});
