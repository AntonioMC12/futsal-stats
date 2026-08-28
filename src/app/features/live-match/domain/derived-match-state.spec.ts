import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent, MatchEventBase } from '../../../shared/models/match-event';
import { deriveMatchState, selectActiveEvents } from './derived-match-state';

const match: Match = {
  id: 'match-1',
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

function base(id: string, sequence: number, gameClockMs = 1_200_000): MatchEventBase {
  return {
    id,
    matchId: match.id,
    period: 1,
    gameClockMs,
    timestamp: sequence * 100,
    sequence,
    undone: false,
    type: 'MATCH_STARTED',
  };
}

describe('derived match state', () => {
  it('reconstructs status, lineup, score, fouls and elapsed time', () => {
    const events: MatchEvent[] = [
      { ...base('start', 1), type: 'MATCH_STARTED' },
      { ...base('period', 2), type: 'PERIOD_STARTED' },
      ...['p1', 'p2', 'p3', 'p4', 'p5'].map((playerId, index): MatchEvent => ({
        ...base(`enter-${playerId}`, 3 + index),
        type: 'PLAYER_ENTERED',
        playerId,
      })),
      { ...base('clock-1', 8), type: 'CLOCK_STARTED' },
      { ...base('stop-1', 9, 900_000), type: 'CLOCK_STOPPED' },
      { ...base('clock-2', 10, 900_000), type: 'CLOCK_STARTED' },
      {
        ...base('goal', 11, 850_000),
        type: 'GOAL_FOR',
        lineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 1, away: 0 },
      },
      {
        ...base('foul', 12, 800_000),
        type: 'FOUL',
        team: 'home',
        periodFoulNumber: 1,
      },
      {
        ...base('change', 13, 700_000),
        type: 'SUBSTITUTION',
        outPlayerId: 'p5',
        inPlayerId: 'p6',
      },
      { ...base('stop-2', 14, 600_000), type: 'CLOCK_STOPPED' },
    ];

    const state = deriveMatchState(match, events);
    expect(state.status).toBe('firstHalf');
    expect(state.currentLineupPlayerIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p6']);
    expect(state.score).toEqual({ home: 1, away: 0 });
    expect(state.foulsByPeriod[1]).toEqual({ home: 1, away: 0 });
    expect(state.completedElapsedMs).toBe(600_000);
    expect(state.clockRunning).toBe(false);
  });

  it('exposes an open clock segment for a live projection', () => {
    const events: MatchEvent[] = [
      { ...base('start', 1), type: 'MATCH_STARTED' },
      { ...base('clock', 2, 500_000), type: 'CLOCK_STARTED' },
    ];
    const state = deriveMatchState(match, events);
    expect(state.clockRunning).toBe(true);
    expect(state.runningSegmentStartedAtGameClockMs).toBe(500_000);
  });

  it('ignores events reverted through EVENT_UNDONE without deleting history', () => {
    const events: MatchEvent[] = [
      { ...base('start', 1), type: 'MATCH_STARTED' },
      {
        ...base('goal', 2),
        type: 'GOAL_FOR',
        lineupPlayerIds: [],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 1, away: 0 },
      },
      { ...base('undo', 3), type: 'EVENT_UNDONE', targetEventId: 'goal' },
    ];

    expect(deriveMatchState(match, events).score).toEqual({ home: 0, away: 0 });
    expect(selectActiveEvents(events).map((event) => event.id)).toEqual(['start', 'undo']);
    expect(events).toHaveLength(3);
  });

  it('recalculates score when an earlier goal is undone', () => {
    const events: MatchEvent[] = [
      {
        ...base('goal-1', 1),
        type: 'GOAL_FOR',
        lineupPlayerIds: [],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 1, away: 0 },
      },
      {
        ...base('goal-2', 2),
        type: 'GOAL_FOR',
        lineupPlayerIds: [],
        scoreBefore: { home: 1, away: 0 },
        scoreAfter: { home: 2, away: 0 },
      },
      { ...base('undo', 3), type: 'EVENT_UNDONE', targetEventId: 'goal-1' },
    ];
    expect(deriveMatchState(match, events).score).toEqual({ home: 1, away: 0 });
  });

  it('uses sequence rather than array order', () => {
    const events: MatchEvent[] = [
      { ...base('stop', 3, 1_000_000), type: 'CLOCK_STOPPED' },
      { ...base('clock', 2), type: 'CLOCK_STARTED' },
      { ...base('start', 1), type: 'MATCH_STARTED' },
    ];
    expect(deriveMatchState(match, events).completedElapsedMs).toBe(200_000);
  });

  it('accumulates fouls independently by period and respects undo', () => {
    const events: MatchEvent[] = [
      {
        ...base('home-1', 1),
        type: 'FOUL',
        team: 'home',
        periodFoulNumber: 1,
      },
      {
        ...base('home-2', 2),
        type: 'FOUL',
        team: 'home',
        periodFoulNumber: 2,
      },
      {
        ...base('away-1', 3),
        type: 'FOUL',
        team: 'away',
        periodFoulNumber: 1,
      },
      {
        ...base('home-p2', 4),
        type: 'FOUL',
        team: 'home',
        period: 2,
        periodFoulNumber: 1,
      },
      { ...base('undo', 5), type: 'EVENT_UNDONE', targetEventId: 'home-2' },
    ];
    expect(deriveMatchState(match, events).foulsByPeriod).toEqual({
      1: { home: 1, away: 1 },
      2: { home: 1, away: 0 },
    });
  });
});
