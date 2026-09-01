import { MatchEvent } from '../../../shared/models/match-event';
import { createMatchTimeline } from './match-timeline';

describe('match timeline', () => {
  it('shows active events newest first with formatted game time', () => {
    const events: MatchEvent[] = [
      {
        id: 'start',
        matchId: 'match-1',
        type: 'MATCH_STARTED',
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
      },
      {
        id: 'stop',
        matchId: 'match-1',
        type: 'CLOCK_STOPPED',
        period: 1,
        gameClockMs: 754_000,
        timestamp: 2,
        sequence: 2,
        undone: false,
      },
    ];

    expect(createMatchTimeline(events)).toEqual([
      {
        eventId: 'stop',
        type: 'CLOCK_STOPPED',
        period: 1,
        gameClock: '12:34',
        label: 'Reloj detenido',
      },
      {
        eventId: 'start',
        type: 'MATCH_STARTED',
        period: 1,
        gameClock: '20:00',
        label: 'Partido iniciado',
      },
    ]);
  });

  it('hides undone events and the technical undo event', () => {
    const events: MatchEvent[] = [
      {
        id: 'reset',
        matchId: 'match-1',
        type: 'CLOCK_RESET',
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
      },
      {
        id: 'undo',
        matchId: 'match-1',
        type: 'EVENT_UNDONE',
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: 2,
        sequence: 2,
        undone: false,
        targetEventId: 'reset',
      },
    ];
    expect(createMatchTimeline(events)).toEqual([]);
  });

  it('uses player names in substitutions when available', () => {
    const events: MatchEvent[] = [
      {
        id: 'change',
        matchId: 'match-1',
        type: 'SUBSTITUTION',
        period: 1,
        gameClockMs: 600_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
        outPlayerId: 'p1',
        inPlayerId: 'p6',
      },
    ];
    expect(createMatchTimeline(events, { p1: 'Juan', p6: 'Luis' })[0]?.label).toBe(
      'Cambio: Juan → Luis',
    );
  });

  it('shows the accumulated foul number', () => {
    const events: MatchEvent[] = [
      {
        id: 'foul-4',
        matchId: 'match-1',
        type: 'FOUL',
        period: 1,
        gameClockMs: 500_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
        team: 'home',
        periodFoulNumber: 4,
      },
    ];
    expect(createMatchTimeline(events)[0]?.label).toBe('Falta propia · 4ª');
  });

  it('includes the rival jersey number in card events', () => {
    const events: MatchEvent[] = [
      {
        id: 'rival-yellow',
        matchId: 'match-1',
        type: 'FOUL',
        period: 1,
        gameClockMs: 742_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
        team: 'away',
        opponentPlayerNumber: 7,
        disciplinaryAction: 'yellow',
        periodFoulNumber: 3,
      },
    ];
    expect(createMatchTimeline(events)[0]?.label).toBe('🟨 Amarilla rival #7 · 3ª');
  });

  it('describes bench context, reason and accumulated-foul effect', () => {
    const event: MatchEvent = {
      id: 'bench-card',
      matchId: 'match-1',
      type: 'BENCH_DISCIPLINE',
      team: 'away',
      subjectKind: 'staff',
      staffRole: 'physiotherapist',
      staffName: 'Ana',
      staffIdentityKey: 'away:physiotherapist:ana',
      disciplinaryAction: 'directRed',
      reason: 'protest',
      context: 'bench',
      countsAsAccumulatedFoul: true,
      createsDirectFreeKickWithoutWall: false,
      periodFoulNumber: 5,
      period: 1,
      gameClockMs: 600_000,
      timestamp: 1,
      sequence: 1,
      undone: false,
    };

    expect(createMatchTimeline([event])[0]?.label).toBe(
      '🟥 Banquillo rival · Fisioterapeuta · Ana · Protesta / desobediencia · +1 falta rival',
    );
  });

  it('shows the scorer number and name while preserving anonymous goals', () => {
    const common = {
      matchId: 'match-1',
      period: 1,
      gameClockMs: 763_000,
      timestamp: 1,
      undone: false,
      lineupPlayerIds: ['p1', 'p2', 'p3'],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
    };
    const events: MatchEvent[] = [
      { ...common, id: 'known', sequence: 1, type: 'GOAL_FOR', scorerPlayerId: 'p1' },
      { ...common, id: 'anonymous', sequence: 2, type: 'GOAL_FOR' },
    ];

    const timeline = createMatchTimeline(events, { p1: 'Álex' }, { p1: 7 });
    expect(timeline[0]?.label).toBe('Gol a favor · 1-0');
    expect(timeline[1]?.label).toBe('Gol #7 Álex · 1-0');
  });
});
