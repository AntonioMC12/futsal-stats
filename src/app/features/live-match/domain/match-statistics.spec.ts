import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent, MatchEventBase } from '../../../shared/models/match-event';
import { deriveMatchStatistics } from './match-statistics';

const match: Match = {
  id: 'match-1',
  homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
  awayTeam: { name: 'Rival', shortName: 'RIV' },
  date: 1,
  status: 'firstHalf',
  currentPeriod: 1,
  periodCount: 2,
  clock: createMatchClock(),
  squadPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
  startingLineupPlayerIds: ['a', 'b', 'c', 'd', 'e'],
  createdAt: 1,
  updatedAt: 1,
};

function base(id: string, sequence: number, gameClockMs: number): MatchEventBase {
  return {
    id,
    matchId: match.id,
    type: 'MATCH_STARTED',
    period: 1,
    gameClockMs,
    timestamp: sequence,
    sequence,
    undone: false,
  };
}

function goal(
  id: string,
  sequence: number,
  gameClockMs: number,
  type: 'GOAL_FOR' | 'GOAL_AGAINST',
  playerIds: string[],
): MatchEvent {
  return {
    ...base(id, sequence, gameClockMs),
    type,
    lineupPlayerIds: playerIds,
    scoreBefore: { home: 0, away: 0 },
    scoreAfter: type === 'GOAL_FOR' ? { home: 1, away: 0 } : { home: 0, away: 1 },
  };
}

function scenario(): MatchEvent[] {
  const first = ['a', 'b', 'c', 'd', 'e'];
  const second = ['b', 'c', 'd', 'e', 'f'];
  return [
    ...first.map((playerId, index): MatchEvent => ({
      ...base(`enter-${playerId}`, index + 1, 1_200_000),
      type: 'PLAYER_ENTERED',
      playerId,
    })),
    { ...base('clock', 6, 1_200_000), type: 'CLOCK_STARTED' },
    goal('goal-for-1', 7, 1_080_000, 'GOAL_FOR', first),
    {
      ...base('change', 8, 900_000),
      type: 'SUBSTITUTION',
      outPlayerId: 'a',
      inPlayerId: 'f',
    },
    goal('goal-against', 9, 720_000, 'GOAL_AGAINST', second),
    goal('goal-for-2', 10, 600_000, 'GOAL_FOR', second),
    { ...base('stop', 11, 300_000), type: 'CLOCK_STOPPED' },
  ];
}

describe('match statistics', () => {
  it('calculates minutes, on-court goals and plus/minus by player', () => {
    const statistics = deriveMatchStatistics(match, scenario(), 300_000);
    expect(statistics.players['a']).toEqual({
      playedMs: 300_000,
      entries: 1,
      percentage: (300_000 / 900_000) * 100,
      goalsForOnCourt: 1,
      goalsAgainstOnCourt: 0,
      plusMinus: 1,
    });
    expect(statistics.players['b']).toEqual({
      playedMs: 900_000,
      entries: 1,
      percentage: 100,
      goalsForOnCourt: 2,
      goalsAgainstOnCourt: 1,
      plusMinus: 1,
    });
    expect(statistics.players['f']).toEqual({
      playedMs: 600_000,
      entries: 1,
      percentage: (600_000 / 900_000) * 100,
      goalsForOnCourt: 1,
      goalsAgainstOnCourt: 1,
      plusMinus: 0,
    });
  });

  it('calculates time and goals for each stable lineup', () => {
    const lineups = deriveMatchStatistics(match, scenario(), 300_000).lineups;
    expect(lineups).toEqual([
      {
        id: 'b|c|d|e|f',
        playerIds: ['b', 'c', 'd', 'e', 'f'],
        playedMs: 600_000,
        goalsFor: 1,
        goalsAgainst: 1,
        plusMinus: 0,
      },
      {
        id: 'a|b|c|d|e',
        playerIds: ['a', 'b', 'c', 'd', 'e'],
        playedMs: 300_000,
        goalsFor: 1,
        goalsAgainst: 0,
        plusMinus: 1,
      },
    ]);
  });

  it('projects live time for the current lineup', () => {
    const events = scenario().slice(0, -1);
    const lineups = deriveMatchStatistics(match, events, 240_000).lineups;
    expect(lineups.find((lineup) => lineup.id === 'b|c|d|e|f')?.playedMs).toBe(660_000);
  });

  it('merges separate stints of the same lineup using its stable id', () => {
    const events: MatchEvent[] = [
      ...scenario(),
      {
        ...base('change-back', 12, 300_000),
        type: 'SUBSTITUTION',
        outPlayerId: 'f',
        inPlayerId: 'a',
      },
      { ...base('resume', 13, 300_000), type: 'CLOCK_STARTED' },
      { ...base('final-stop', 14, 0), type: 'CLOCK_STOPPED' },
    ];
    const lineups = deriveMatchStatistics(match, events, 0).lineups;
    expect(lineups).toHaveLength(2);
    expect(lineups.find((lineup) => lineup.id === 'a|b|c|d|e')?.playedMs).toBe(600_000);
  });

  it('removes undone goals from player and lineup statistics', () => {
    const events = [
      ...scenario(),
      { ...base('undo', 12, 300_000), type: 'EVENT_UNDONE' as const, targetEventId: 'goal-for-2' },
    ];
    const statistics = deriveMatchStatistics(match, events, 300_000);
    expect(statistics.players['f']?.goalsForOnCourt).toBe(0);
    expect(statistics.players['f']?.plusMinus).toBe(-1);
    expect(statistics.lineups.find((lineup) => lineup.id === 'b|c|d|e|f')).toMatchObject({
      goalsFor: 0,
      goalsAgainst: 1,
      plusMinus: -1,
    });
  });
});
