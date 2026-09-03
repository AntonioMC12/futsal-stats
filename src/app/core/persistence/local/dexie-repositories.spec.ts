import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { createMatchClock } from '../../clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from '../persistence.tokens';
import { provideLocalPersistence } from '../provide-local-persistence';
import { FutsalStatsDb } from './futsal-stats.db';
import { toLocalMatchEventRecord } from './local-record-mappers';

describe('local Dexie repository adapters', () => {
  let db: FutsalStatsDb;

  beforeEach(async () => {
    await Dexie.delete('futsal-stats');
    TestBed.configureTestingModule({ providers: [provideLocalPersistence()] });
    db = TestBed.inject(FutsalStatsDb);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    db.close();
    TestBed.resetTestingModule();
    await Dexie.delete('futsal-stats');
  });

  it('persists, reads and lists teams through the port', async () => {
    const repository = TestBed.inject(TEAM_REPOSITORY);
    const beta = team('team-b', 'Beta');
    const alpha = team('team-a', 'Alpha');

    await repository.put(beta);
    await repository.put(alpha);

    expect(await repository.get(alpha.id)).toEqual(alpha);
    expect(await repository.list()).toEqual([alpha, beta]);
  });

  it('preserves createdAt and advances local sync metadata on updates', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100);
    const teams = TestBed.inject(TEAM_REPOSITORY);
    const players = TestBed.inject(PLAYER_REPOSITORY);
    const original = team('team-a', 'Alpha');
    await teams.put(original);
    await players.put(player('player-a', original.id, 1, true));
    now.mockReturnValue(200);
    await teams.put({ ...original, name: 'Alpha updated', updatedAt: 200 });
    await players.put(player('player-a', original.id, 2, true));

    expect(await db.teams.get(original.id)).toMatchObject({
      createdAt: 1,
      updatedAt: 200,
      revision: 2,
      syncStatus: 'pending',
      deletedAt: null,
    });
    expect(await db.players.get('player-a')).toMatchObject({
      createdAt: 100,
      updatedAt: 200,
      revision: 2,
      syncStatus: 'pending',
      deletedAt: null,
    });
  });

  it('rejects orphan ownership at the local persistence boundary', async () => {
    await expect(
      TestBed.inject(PLAYER_REPOSITORY).put(player('orphan', 'missing-team', 1, true)),
    ).rejects.toThrow('references missing Team');
    await expect(TestBed.inject(MATCH_REPOSITORY).put(match('orphan', 'ready', 1))).rejects.toThrow(
      'references missing Team',
    );
  });

  it('queries players while excluding inactive players from active counts and rosters', async () => {
    const teams = TestBed.inject(TEAM_REPOSITORY);
    await teams.put(team('team-a', 'Alpha'));
    await teams.put(team('team-b', 'Beta'));
    const repository = TestBed.inject(PLAYER_REPOSITORY);
    const players = [
      player('p-2', 'team-a', 2, true),
      player('p-1', 'team-a', 1, true),
      player('p-3', 'team-a', 3, false),
      player('p-4', 'team-b', 4, true),
    ];
    await Promise.all(players.map((item) => repository.put(item)));

    expect((await repository.listActiveByTeam('team-a')).map(({ id }) => id)).toEqual([
      'p-1',
      'p-2',
    ]);
    expect(await repository.listByIds(['p-3', 'missing', 'p-1'])).toEqual([players[2], players[1]]);
    expect(await repository.countActiveByTeamIds(['team-a', 'team-b', 'team-c'])).toEqual(
      new Map([
        ['team-a', 2],
        ['team-b', 1],
        ['team-c', 0],
      ]),
    );
  });

  it('supports match put, get, list and findActive', async () => {
    await seedMatchOwnership();
    const repository = TestBed.inject(MATCH_REPOSITORY);
    const finished = match('finished', 'finished', 10);
    const active = match('active', 'firstHalf', 20);
    await repository.put(finished);
    await repository.put(active);

    expect(await repository.get(active.id)).toEqual(active);
    expect(await repository.list()).toEqual([active, finished]);
    expect(await repository.findActive()).toEqual(active);
  });

  it('atomically admits only one active match under concurrent creation attempts', async () => {
    await seedMatchOwnership();
    const repository = TestBed.inject(MATCH_REPOSITORY);

    const results = await Promise.all([
      repository.addIfNoActive(match('active-a', 'ready', 1)),
      repository.addIfNoActive(match('active-b', 'ready', 2)),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repository.list()).filter((item) => item.status !== 'finished')).toHaveLength(1);
  });

  it('lists events by sequence and timestamp and commits events with the match snapshot', async () => {
    await seedMatchOwnership();
    const matches = TestBed.inject(MATCH_REPOSITORY);
    const events = TestBed.inject(MATCH_EVENT_REPOSITORY);
    const snapshot = match('match-a', 'firstHalf', 20);
    const laterSequence = event('event-3', snapshot.id, 2, 10);
    const laterTimestamp = event('event-2', snapshot.id, 1, 20);
    const earlierTimestamp = event('event-1', snapshot.id, 1, 10);

    await events.commit(snapshot, [laterSequence, laterTimestamp, earlierTimestamp]);

    expect(await matches.get(snapshot.id)).toEqual(snapshot);
    expect(await events.listByMatch(snapshot.id)).toEqual([
      earlierTimestamp,
      laterTimestamp,
      laterSequence,
    ]);
    expect((await db.events.toArray()).every(({ revision }) => revision === 1)).toBe(true);

    await events.commit({ ...snapshot, updatedAt: 30 }, []);
    expect(await db.matches.get(snapshot.id)).toMatchObject({ revision: 2, updatedAt: 30 });
  });

  it('rolls back the snapshot when appending events fails', async () => {
    await seedMatchOwnership();
    const matches = TestBed.inject(MATCH_REPOSITORY);
    const events = TestBed.inject(MATCH_EVENT_REPOSITORY);
    const original = match('match-a', 'ready', 1);
    const updated = { ...original, status: 'firstHalf' as const, updatedAt: 2 };
    const duplicate = event('duplicate', original.id, 1, 1);
    await matches.put(original);
    await db.events.add(toLocalMatchEventRecord(duplicate));

    await expect(events.commit(updated, [duplicate])).rejects.toThrow();

    expect(await matches.get(original.id)).toEqual(original);
    expect(await db.events.where('matchId').equals(original.id).count()).toBe(1);
  });

  it('deletes a match and its events atomically while preserving teams and players', async () => {
    const teams = TestBed.inject(TEAM_REPOSITORY);
    const players = TestBed.inject(PLAYER_REPOSITORY);
    const matches = TestBed.inject(MATCH_REPOSITORY);
    const events = TestBed.inject(MATCH_EVENT_REPOSITORY);
    const savedTeam = team('team-a', 'Alpha');
    const savedPlayer = player('player-a', savedTeam.id, 1, true);
    const savedMatch = match('match-a', 'finished', 1);
    await teams.put(savedTeam);
    await players.put(savedPlayer);
    await events.commit(savedMatch, [event('event-a', savedMatch.id, 1, 1)]);

    await matches.delete(savedMatch.id);

    expect(await teams.get(savedTeam.id)).toEqual(savedTeam);
    expect(await players.listByIds([savedPlayer.id])).toEqual([savedPlayer]);
    expect(await matches.get(savedMatch.id)).toBeUndefined();
    expect(await events.listByMatch(savedMatch.id)).toEqual([]);
  });
});

async function seedMatchOwnership(): Promise<void> {
  await TestBed.inject(TEAM_REPOSITORY).put(team('team-a', 'Alpha'));
  await TestBed.inject(PLAYER_REPOSITORY).put(player('player-a', 'team-a', 1, true));
}

function team(id: string, name: string): Team {
  return { id, name, shortName: name.slice(0, 3).toUpperCase(), createdAt: 1, updatedAt: 1 };
}

function player(id: string, teamId: string, number: number, active: boolean): Player {
  return { id, teamId, number, name: `Player ${number}`, active };
}

function match(id: string, status: Match['status'], updatedAt: number): Match {
  return {
    id,
    teamId: 'team-a',
    homeTeam: { id: 'team-a', name: 'Alpha', shortName: 'ALP' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: updatedAt,
    status,
    currentPeriod: status === 'secondHalf' || status === 'finished' ? 2 : 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['player-a'],
    startingLineupPlayerIds: ['player-a'],
    createdAt: 1,
    updatedAt,
  };
}

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
