import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { createMatchClock } from '../../clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from '../persistence.tokens';
import { provideLocalPersistence } from '../provide-local-persistence';
import { FutsalStatsDb } from './futsal-stats.db';
import {
  deserializeTeamDataBundle,
  loadTeamDataBundle,
  serializeTeamDataBundle,
} from './team-data-bundle';

describe('Team data bundle', () => {
  let db: FutsalStatsDb;

  beforeEach(async () => {
    await Dexie.delete('futsal-stats');
    TestBed.configureTestingModule({ providers: [provideLocalPersistence()] });
    db = TestBed.inject(FutsalStatsDb);
  });

  afterEach(async () => {
    db.close();
    TestBed.resetTestingModule();
    await Dexie.delete('futsal-stats');
  });

  it('serializes and restores all records, metadata and relationships deterministically', async () => {
    await TestBed.inject(TEAM_REPOSITORY).put({
      id: 'team-a',
      name: 'Alpha',
      shortName: 'ALP',
      createdAt: 100,
      updatedAt: 200,
    });
    await TestBed.inject(PLAYER_REPOSITORY).put({
      id: 'player-a',
      teamId: 'team-a',
      number: 1,
      name: 'Player',
      active: true,
    });
    const match: Match = {
      id: 'match-a',
      teamId: 'team-a',
      homeTeam: { id: 'team-a', name: 'Alpha', shortName: 'ALP' },
      awayTeam: { name: 'Rival', shortName: 'RIV' },
      date: 300,
      status: 'firstHalf',
      currentPeriod: 1,
      periodCount: 2,
      clock: createMatchClock(),
      squadPlayerIds: ['player-a'],
      startingLineupPlayerIds: ['player-a'],
      createdAt: 300,
      updatedAt: 400,
    };
    const events: MatchEvent[] = [
      event('event-b', match.id, 2, 600),
      event('event-a', match.id, 1, 500),
    ];
    await TestBed.inject(MATCH_EVENT_REPOSITORY).commit(match, events);

    const bundle = await loadTeamDataBundle(db, 'team-a');
    expect(bundle).not.toBeNull();
    const serialized = serializeTeamDataBundle(bundle!);
    const restored = deserializeTeamDataBundle(serialized);

    expect(restored).toEqual(bundle);
    expect(restored.events.map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(restored.team).toMatchObject({ createdAt: 100, updatedAt: 200, revision: 1 });
    expect(restored.players[0]).toMatchObject({
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
      syncStatus: 'pending',
    });
    expect(serializeTeamDataBundle({ ...restored, events: [...restored.events].reverse() })).toBe(
      serialized,
    );
    expect(await TestBed.inject(MATCH_REPOSITORY).listByTeam('team-a')).toEqual([match]);
    expect(
      (await TestBed.inject(PLAYER_REPOSITORY).listByTeam('team-a')).map(({ id }) => id),
    ).toEqual(['player-a']);
  });
});

function event(id: string, matchId: string, sequence: number, timestamp: number): MatchEvent {
  return {
    id,
    matchId,
    type: 'MATCH_STARTED',
    period: 1,
    gameClockMs: 1,
    timestamp,
    sequence,
    undone: false,
  };
}
