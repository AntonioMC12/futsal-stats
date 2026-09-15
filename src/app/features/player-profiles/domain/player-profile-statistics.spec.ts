import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import {
  aggregatePlayerHistory,
  buildPlayerHistory,
  filterPlayerHistoryBySeason,
} from './player-profile-statistics';

function match(id: string, season: string, date: string, started = true): Match {
  return {
    id,
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Local', shortName: 'LOC' },
    awayTeam: { name: `Rival ${id}`, shortName: 'RIV' },
    date,
    season,
    competition: 'Liga',
    description: '',
    status: 'finished',
    currentPeriod: 2,
    periodCount: 2,
    clock: { ...createMatchClock(), remainingMs: 600_000 },
    squadPlayerIds: ['p1'],
    startingLineupPlayerIds: started ? ['p1'] : [],
    createdAt: 1,
    updatedAt: 2,
  };
}

function history(
  matchId: string,
  score: { home: number; away: number },
  undoneGoal = false,
): MatchEvent[] {
  const base = (id: string, type: MatchEvent['type'], sequence: number, gameClockMs: number) => ({
    id: `${matchId}-${id}`,
    matchId,
    type,
    period: 1,
    gameClockMs,
    timestamp: sequence,
    sequence,
    undone: false,
  });
  const events: MatchEvent[] = [
    { ...base('start', 'MATCH_STARTED', 1, 1_200_000), type: 'MATCH_STARTED' },
    { ...base('enter', 'PLAYER_ENTERED', 2, 1_200_000), type: 'PLAYER_ENTERED', playerId: 'p1' },
    { ...base('clock', 'CLOCK_STARTED', 3, 1_200_000), type: 'CLOCK_STARTED' },
  ];
  if (score.home > 0) {
    events.push({
      ...base('goal', 'GOAL_FOR', 4, 900_000),
      type: 'GOAL_FOR',
      scorerPlayerId: 'p1',
      lineupPlayerIds: ['p1'],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
    });
  } else {
    events.push({
      ...base('against', 'GOAL_AGAINST', 4, 900_000),
      type: 'GOAL_AGAINST',
      lineupPlayerIds: ['p1'],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 0, away: 1 },
    });
  }
  events.push({
    ...base('foul', 'FOUL', 5, 800_000),
    type: 'FOUL',
    team: 'home',
    playerId: 'p1',
    periodFoulNumber: 1,
  });
  if (undoneGoal) {
    events.push({
      ...base('undo', 'EVENT_UNDONE', 6, 800_000),
      type: 'EVENT_UNDONE',
      targetEventId: `${matchId}-goal`,
    });
  }
  events.push(
    { ...base('stop', 'CLOCK_STOPPED', 7, 600_000), type: 'CLOCK_STOPPED' },
    { ...base('finish', 'MATCH_FINISHED', 8, 600_000), type: 'MATCH_FINISHED' },
  );
  return events;
}

describe('player profile statistics', () => {
  it('reconstructs career ratios and results from finished match events', () => {
    const current = match('current', '2026/27', '2026-09-08');
    const previous = match('previous', '2025/26', '2026-05-08', false);
    const result = buildPlayerHistory('p1', [
      { match: previous, events: history(previous.id, { home: 0, away: 1 }) },
      { match: current, events: history(current.id, { home: 1, away: 0 }) },
    ]);
    const career = aggregatePlayerHistory(result);

    expect(result.map(({ match }) => match.id)).toEqual(['current', 'previous']);
    expect(career).toMatchObject({
      squadSelections: 2,
      appearances: 2,
      starts: 1,
      goals: 1,
      fouls: 2,
      wins: 1,
      losses: 1,
      goalsForOnCourt: 1,
      goalsAgainstOnCourt: 1,
      plusMinus: 0,
    });
    expect(career.goalsPerAppearance).toBe(0.5);
    expect(career.goalsPer40Minutes).toBe(2);
    expect(career.winRate).toBe(50);
  });

  it('keeps seasons isolated and excludes undone goals', () => {
    const current = match('current', '2026/27', '2026-09-08');
    const previous = match('previous', '2025/26', '2026-05-08');
    const all = buildPlayerHistory('p1', [
      { match: current, events: history(current.id, { home: 1, away: 0 }, true) },
      { match: previous, events: history(previous.id, { home: 1, away: 0 }) },
    ]);

    const season = aggregatePlayerHistory(filterPlayerHistoryBySeason(all, '2026/27'));
    expect(season.squadSelections).toBe(1);
    expect(season.goals).toBe(0);
    expect(season.wins).toBe(0);
    expect(aggregatePlayerHistory(all).goals).toBe(1);
  });

  it('ignores active matches and matches where the player was not selected', () => {
    const active = { ...match('active', '2026/27', '2026-09-09'), status: 'firstHalf' as const };
    const other = { ...match('other', '2026/27', '2026-09-07'), squadPlayerIds: ['p2'] };
    expect(
      buildPlayerHistory('p1', [
        { match: active, events: [] },
        { match: other, events: [] },
      ]),
    ).toEqual([]);
  });
});
