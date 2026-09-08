import { describe, expect, it } from 'vitest';
import { Match } from '../../../shared/models/match';
import { GoalForEvent } from '../../../shared/models/match-event';
import { eventFromCloud, eventToCloud, matchFromCloud, matchToCloud } from './cloud-record-mappers';

describe('cloud record mappers', () => {
  it('round-trips a match and its player snapshots', () => {
    const match: Match = {
      id: 'match-1',
      teamId: 'team-1',
      homeTeam: { id: 'team-1', name: 'Local', shortName: 'LOC' },
      awayTeam: { name: 'Rival', shortName: 'RIV' },
      date: '2026-09-07',
      description: 'Liga',
      status: 'ready',
      currentPeriod: 1,
      periodCount: 2,
      clock: {
        periodDurationMs: 1_200_000,
        remainingMs: 1_200_000,
        running: false,
        startedAtEpochMs: null,
      },
      squadPlayerIds: ['p1', 'p2'],
      startingLineupPlayerIds: ['p1'],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_001_000,
    };
    const row = matchToCloud(match);
    row['match_players'] = [
      { player_id: 'p1', in_squad: true, is_starter: true },
      { player_id: 'p2', in_squad: true, is_starter: false },
    ];
    expect(matchFromCloud(row)).toEqual(match);
  });

  it('stores event-specific data in metadata and restores ordered goal lineups', () => {
    const event: GoalForEvent = {
      id: 'event-1',
      matchId: 'match-1',
      type: 'GOAL_FOR',
      period: 1,
      gameClockMs: 30_000,
      timestamp: 1_700_000_000_000,
      sequence: 2,
      undone: false,
      scorerPlayerId: 'p1',
      lineupPlayerIds: ['p1', 'p2'],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
    };
    const row = eventToCloud(event);
    row['match_event_lineup_players'] = [
      { player_id: 'p2', position: 1 },
      { player_id: 'p1', position: 0 },
    ];
    expect(eventFromCloud(row)).toEqual(event);
  });
});
