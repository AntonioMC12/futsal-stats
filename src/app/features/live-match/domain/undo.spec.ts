import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { deriveMatchState } from './derived-match-state';
import { findLastUndoableEvent, undoLastEvent } from './undo';

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

function event(overrides: Partial<MatchEvent> & Pick<MatchEvent, 'id' | 'type'>): MatchEvent {
  return {
    matchId: match.id,
    period: 1,
    gameClockMs: 500_000,
    timestamp: 100,
    sequence: 1,
    undone: false,
    ...overrides,
  } as MatchEvent;
}

describe('undo domain', () => {
  it('creates an append-only compensating event for the latest relevant action', () => {
    const events: MatchEvent[] = [
      event({
        id: 'goal-1',
        type: 'GOAL_FOR',
        lineupPlayerIds: [],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 1, away: 0 },
      }),
      event({ id: 'clock-2', type: 'CLOCK_STOPPED', sequence: 2 }),
      event({ id: 'foul-3', type: 'FOUL', team: 'home', periodFoulNumber: 1, sequence: 3 }),
    ];

    const result = undoLastEvent({
      match,
      events,
      gameClockMs: 450_000,
      timestamp: 200,
      sequence: 4,
      eventId: 'undo-4',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.targetEvent.id).toBe('foul-3');
    expect(result.value.event).toEqual({
      id: 'undo-4',
      matchId: 'match-1',
      type: 'EVENT_UNDONE',
      targetEventId: 'foul-3',
      period: 1,
      gameClockMs: 450_000,
      timestamp: 200,
      sequence: 4,
      undone: false,
    });
    expect(result.value.match.updatedAt).toBe(200);
    expect(events).toHaveLength(3);
  });

  it('restores score and fouls through derived state without deleting history', () => {
    const events: MatchEvent[] = [
      event({
        id: 'goal-1',
        type: 'GOAL_FOR',
        lineupPlayerIds: [],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 1, away: 0 },
      }),
      event({ id: 'foul-2', type: 'FOUL', team: 'away', periodFoulNumber: 1, sequence: 2 }),
      event({ id: 'undo-3', type: 'EVENT_UNDONE', targetEventId: 'foul-2', sequence: 3 }),
      event({ id: 'undo-4', type: 'EVENT_UNDONE', targetEventId: 'goal-1', sequence: 4 }),
    ];

    const state = deriveMatchState(match, events);
    expect(state.score).toEqual({ home: 0, away: 0 });
    expect(state.foulsByPeriod[1]).toBeUndefined();
    expect(events).toHaveLength(4);
  });

  it('allows consecutive undos and skips technical clock events', () => {
    const events: MatchEvent[] = [
      event({
        id: 'goal-1',
        type: 'GOAL_AGAINST',
        lineupPlayerIds: [],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 0, away: 1 },
      }),
      event({ id: 'foul-2', type: 'FOUL', team: 'home', periodFoulNumber: 1, sequence: 2 }),
      event({ id: 'clock-3', type: 'CLOCK_STARTED', sequence: 3 }),
      event({ id: 'undo-4', type: 'EVENT_UNDONE', targetEventId: 'foul-2', sequence: 4 }),
    ];

    expect(findLastUndoableEvent(events)?.id).toBe('goal-1');
  });

  it('fails when no user action can be undone', () => {
    expect(
      undoLastEvent({
        match,
        events: [event({ id: 'clock-1', type: 'CLOCK_STARTED' })],
        gameClockMs: 0,
        timestamp: 2,
        sequence: 2,
        eventId: 'undo-2',
      }),
    ).toEqual({ ok: false, error: 'No hay ninguna acción que se pueda deshacer.' });
  });
});
