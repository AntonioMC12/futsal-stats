import { createMatchClock, startClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { createEventsForTransition } from './match-transition-events';

function match(): Match {
  return {
    id: 'match-1',
    teamId: 'team-1',
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

describe('match transition events', () => {
  it('creates the complete initial event stream with monotonic sequences', () => {
    const before = match();
    const after = {
      ...before,
      status: 'firstHalf' as const,
      clock: startClock(before.clock, 10_000),
    };
    let id = 0;
    const events = createEventsForTransition({
      before,
      after,
      command: 'START_CLOCK',
      nextSequence: 7,
      timestamp: 10_000,
      createId: () => `event-${++id}`,
    });

    expect(events.map((event) => event.type)).toEqual([
      'MATCH_STARTED',
      'PERIOD_STARTED',
      'PLAYER_ENTERED',
      'PLAYER_ENTERED',
      'PLAYER_ENTERED',
      'PLAYER_ENTERED',
      'PLAYER_ENTERED',
      'CLOCK_STARTED',
    ]);
    expect(events.map((event) => event.sequence)).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
    expect(
      events.filter((event) => event.type === 'PLAYER_ENTERED').map((event) => event.playerId),
    ).toEqual(before.startingLineupPlayerIds);
    expect(events.every((event) => event.matchId === before.id && !event.undone)).toBe(true);
  });

  it('creates one event when a stopped clock resumes', () => {
    const before = { ...match(), status: 'firstHalf' as const };
    before.clock = { ...before.clock, remainingMs: 750_000 };
    const after = { ...before, clock: startClock(before.clock, 20_000) };
    const events = createEventsForTransition({
      before,
      after,
      command: 'START_CLOCK',
      nextSequence: 20,
      timestamp: 20_000,
      createId: () => 'event-20',
    });

    expect(events).toEqual([
      {
        id: 'event-20',
        matchId: before.id,
        type: 'CLOCK_STARTED',
        period: 1,
        gameClockMs: 750_000,
        timestamp: 20_000,
        sequence: 20,
        undone: false,
      },
    ]);
  });

  it('records period and match end separately', () => {
    const before = { ...match(), status: 'secondHalf' as const, currentPeriod: 2 };
    before.clock = { ...before.clock, remainingMs: 0 };
    const after = { ...before, status: 'finished' as const };
    let id = 0;
    const events = createEventsForTransition({
      before,
      after,
      command: 'FINISH_PERIOD',
      nextSequence: 30,
      timestamp: 30_000,
      createId: () => `event-${++id}`,
    });

    expect(events.map((event) => event.type)).toEqual(['PERIOD_ENDED', 'MATCH_FINISHED']);
    expect(events.map((event) => event.sequence)).toEqual([30, 31]);
  });

  it('records clock reset explicitly', () => {
    const before = { ...match(), status: 'firstHalf' as const };
    const events = createEventsForTransition({
      before,
      after: before,
      command: 'RESET_CLOCK',
      nextSequence: 2,
      timestamp: 100,
      createId: () => 'reset-id',
    });
    expect(events[0]?.type).toBe('CLOCK_RESET');
  });
});
