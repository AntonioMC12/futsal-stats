import { describe, expect, it } from 'vitest';
import { Match } from '../../../shared/models/match';
import { GoalForEvent, MatchEvent } from '../../../shared/models/match-event';
import {
  eventFromCloud,
  eventToCloud,
  matchFromCloud,
  matchToCloud,
  playerProfileFromCloud,
  playerProfileToCloud,
} from './cloud-record-mappers';

describe('cloud record mappers', () => {
  it('round-trips a match and its player snapshots', () => {
    const match: Match = {
      id: 'match-1',
      teamId: 'team-1',
      homeTeam: { id: 'team-1', name: 'Local', shortName: 'LOC' },
      awayTeam: { name: 'Rival', shortName: 'RIV' },
      date: '2026-09-07',
      season: '2026/27',
      competition: 'Liga Autonómica',
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
      statisticsSchemaVersion: 2,
    };
    const row = matchToCloud(match);
    expect(row['season']).toBe('2026/27');
    expect(row['competition']).toBe('Liga Autonómica');
    row['match_players'] = [
      { player_id: 'p1', in_squad: true, is_starter: true },
      { player_id: 'p2', in_squad: true, is_starter: false },
    ];
    expect(matchFromCloud(row)).toEqual(match);
  });

  it('round-trips partial legacy import metadata through cloud JSON', () => {
    const match: Match = {
      id: 'legacy-1',
      teamId: 'team-1',
      homeTeam: { id: 'team-1', name: 'Apaga', shortName: 'APA' },
      awayTeam: { name: 'MNG', shortName: '' },
      date: '2026-08-28',
      description: '',
      status: 'finished',
      currentPeriod: 1,
      periodCount: 2,
      clock: {
        periodDurationMs: 1_200_000,
        remainingMs: 0,
        running: false,
        startedAtEpochMs: null,
      },
      squadPlayerIds: ['p1'],
      startingLineupPlayerIds: ['p1'],
      createdAt: 1,
      updatedAt: 2,
      source: 'csv-import',
      importMetadata: {
        fileName: 'legacy.csv',
        importedAt: '2026-09-16T00:00:00Z',
        fingerprint: 'fingerprint',
        legacySnapshot: {
          importFormat: 'legacy-player-snapshot',
          reconstructionVersion: 1,
          observedTeamName: 'Apaga',
          observedScore: { home: 1, away: 0 },
          players: [{ playerId: 'p1', secondsPlayed: 41 }],
          missingData: ['eventTimeline', 'substitutionTimeline', 'lineupHistory'],
        },
      },
    };
    const row = matchToCloud(match);
    row['match_players'] = [{ player_id: 'p1', in_squad: true, is_starter: true }];
    expect(matchFromCloud(row).importMetadata?.legacySnapshot).toEqual(
      match.importMetadata?.legacySnapshot,
    );
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

  it('round-trips shot, save and foul receiver metadata', () => {
    const base = {
      id: 'event-1',
      matchId: 'match-1',
      period: 1,
      gameClockMs: 30_000,
      timestamp: 1_700_000_000_000,
      sequence: 2,
      undone: false,
    };
    const events: MatchEvent[] = [
      { ...base, type: 'SHOT', playerId: 'p1', outcome: 'off_target' },
      { ...base, type: 'SAVE', playerId: 'p2' },
      { ...base, type: 'FOUL', team: 'away', receivedByPlayerId: 'p1', periodFoulNumber: 1 },
    ];
    for (const event of events) {
      expect(eventFromCloud(eventToCloud(event))).toEqual(event);
    }
  });

  it('round-trips an extended player profile', () => {
    const profile = {
      playerId: 'player-1',
      teamId: 'team-1',
      photoUrl: 'https://example.com/player.jpg',
      preferredFoot: 'both' as const,
      notes: 'Capitán',
      metadata: { objective: 'pressing' },
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_001_000,
    };
    expect(playerProfileFromCloud(playerProfileToCloud(profile))).toEqual(profile);
  });
});
