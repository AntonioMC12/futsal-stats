import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { createMatchClock } from '../../clock/match-clock';
import { BuiltInDataInitializer } from '../../initialization/built-in-data.initializer';
import {
  APAGA_PLAYER_IDS,
  APAGA_SEED_KEY,
  APAGA_TEAM_ID,
  LEGACY_APAGA_TEAM_ID,
} from '../../initialization/built-in-teams';
import { createId, isUuid } from '../../utils/id';
import { deriveMatchState } from '../../../features/live-match/domain/derived-match-state';
import { deriveMatchStatistics } from '../../../features/live-match/domain/match-statistics';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import { DexieMatchRepository } from './dexie-match.repository';
import { DexieMatchEventRepository } from './dexie-match-event.repository';
import { FutsalStatsDb } from './futsal-stats.db';
import { fromLocalMatchEventRecord, fromLocalMatchRecord } from './local-record-mappers';

describe('Dexie cloud data model migration', () => {
  afterEach(async () => {
    TestBed.resetTestingModule();
    await Dexie.delete('futsal-stats');
  });

  it('upgrades v2 IDs and every internal reference without changing derived statistics', async () => {
    await Dexie.delete('futsal-stats');
    const fixture = legacyFixture();
    const legacy = createVersion2Database();
    await legacy.table('teams').bulkPut(fixture.teams);
    await legacy.table('players').bulkPut(fixture.players);
    await legacy.table('matches').bulkPut([fixture.match]);
    await legacy.table('events').bulkPut(fixture.events);
    legacy.close();

    const beforeMatch: Match = {
      ...fixture.match,
      teamId: fixture.match.homeTeam.id!,
    };
    const beforeState = deriveMatchState(beforeMatch, fixture.events);
    const beforeStatistics = statisticsByNumber(
      deriveMatchStatistics(beforeMatch, fixture.events, 1_000_000),
      fixture.players,
    );
    const db = new FutsalStatsDb();
    const [teams, players, matches, events] = await Promise.all([
      db.teams.toArray(),
      db.players.toArray(),
      db.matches.toArray(),
      db.events.orderBy('[matchId+sequence]').toArray(),
    ]);

    expect([teams.length, players.length, matches.length, events.length]).toEqual([1, 6, 1, 12]);
    expect([...teams, ...players, ...matches, ...events].every(({ id }) => isUuid(id))).toBe(true);
    expect(
      [...teams, ...players, ...matches, ...events].every((record) => record.revision === 1),
    ).toBe(true);
    expect(
      [...teams, ...players, ...matches, ...events].every(
        (record) => record.syncStatus === 'pending',
      ),
    ).toBe(true);

    const migratedMatchRecord = matches[0]!;
    const migratedMatch = fromLocalMatchRecord(migratedMatchRecord);
    const migratedEvents = events.map(fromLocalMatchEventRecord);
    const playerIds = new Set(players.map(({ id }) => id));
    expect(migratedMatch.teamId).toBe(teams[0]!.id);
    expect(migratedMatch.homeTeam.id).toBe(teams[0]!.id);
    expect(migratedMatch.squadPlayerIds.every((id) => playerIds.has(id))).toBe(true);
    expect(migratedEvents.every(({ matchId }) => matchId === migratedMatch.id)).toBe(true);
    expect(migratedEvents.map(({ sequence }) => sequence)).toEqual(
      fixture.events.map(({ sequence }) => sequence),
    );
    const migratedUndo = migratedEvents.find((event) => event.type === 'EVENT_UNDONE');
    const migratedFoul = migratedEvents.find((event) => event.type === 'FOUL');
    expect(migratedUndo?.targetEventId).toBe(migratedFoul?.id);

    const afterState = deriveMatchState(migratedMatch, migratedEvents);
    const afterStatistics = statisticsByNumber(
      deriveMatchStatistics(migratedMatch, migratedEvents, 1_000_000),
      players,
    );
    expect(afterState.score).toEqual(beforeState.score);
    expect(afterState.foulsByPeriod).toEqual(beforeState.foulsByPeriod);
    expect(afterState.currentLineupPlayerIds).toHaveLength(
      beforeState.currentLineupPlayerIds.length,
    );
    expect(afterStatistics).toEqual(beforeStatistics);

    TestBed.configureTestingModule({
      providers: [
        DexieMatchRepository,
        DexieMatchEventRepository,
        { provide: FutsalStatsDb, useValue: db },
      ],
    });
    expect((await TestBed.inject(DexieMatchRepository).findActive())?.id).toBe(migratedMatch.id);
    await TestBed.inject(DexieMatchEventRepository).commit({ ...migratedMatch, updatedAt: 3_000 }, [
      {
        id: createId(),
        matchId: migratedMatch.id,
        type: 'CLOCK_STARTED',
        period: 1,
        gameClockMs: 1_000_000,
        timestamp: 3_000,
        sequence: 13,
        undone: false,
      },
    ]);
    db.close();
    TestBed.resetTestingModule();

    const reopened = new FutsalStatsDb();
    expect(await reopened.events.where('matchId').equals(migratedMatch.id).count()).toBe(13);
    expect((await reopened.matches.get(migratedMatch.id))?.updatedAt).toBe(3_000);
    reopened.close();
  });

  it('maps the legacy built-in seed to stable UUIDs without duplicating it', async () => {
    await Dexie.delete('futsal-stats');
    const legacy = createVersion2Database();
    await legacy.table('teams').put({
      id: LEGACY_APAGA_TEAM_ID,
      seedKey: APAGA_SEED_KEY,
      name: 'Apaga editado',
      shortName: 'APA',
      createdAt: 10,
      updatedAt: 20,
    });
    await legacy.table('players').bulkPut(
      APAGA_PLAYER_IDS.map((_, index) => ({
        id: `built-in-player-apaga-${String(index + 1).padStart(2, '0')}`,
        teamId: LEGACY_APAGA_TEAM_ID,
        number: index + 1,
        name: `Legacy ${index + 1}`,
        active: true,
      })),
    );
    legacy.close();

    const db = new FutsalStatsDb();
    TestBed.configureTestingModule({
      providers: [BuiltInDataInitializer, { provide: FutsalStatsDb, useValue: db }],
    });
    await TestBed.inject(BuiltInDataInitializer).ensureBuiltInTeams();

    expect(await db.teams.where('seedKey').equals(APAGA_SEED_KEY).count()).toBe(1);
    expect((await db.teams.get(APAGA_TEAM_ID))?.name).toBe('Apaga editado');
    expect(await db.players.where('teamId').equals(APAGA_TEAM_ID).count()).toBe(16);
    expect((await db.players.toArray()).map(({ id }) => id).sort()).toEqual(
      [...APAGA_PLAYER_IDS].sort(),
    );
    db.close();
  });

  it('preserves an existing valid UUID during upgrade', async () => {
    await Dexie.delete('futsal-stats');
    const id = '25d85e17-9a0b-4fd3-b3d3-190210edcfa1';
    const legacy = createVersion2Database();
    await legacy.table('teams').put({
      id,
      name: 'UUID Team',
      shortName: 'UID',
      createdAt: 10,
      updatedAt: 20,
    });
    legacy.close();

    const db = new FutsalStatsDb();
    expect((await db.teams.toArray())[0]?.id).toBe(id);
    db.close();
  });

  it('rolls back the upgrade when legacy relationships are orphaned', async () => {
    await Dexie.delete('futsal-stats');
    const legacy = createVersion2Database();
    await legacy.table('players').put({
      id: 'orphan-player',
      teamId: 'missing-team',
      number: 1,
      name: 'Orphan',
      active: true,
    });
    legacy.close();

    const db = new FutsalStatsDb();
    await expect(db.open()).rejects.toThrow('references missing Team');
    db.close();

    const recovered = createVersion2Database();
    await recovered.open();
    expect(recovered.verno).toBe(2);
    expect(await recovered.table('players').get('orphan-player')).toBeDefined();
    recovered.close();
  });
});

function createVersion2Database(): Dexie {
  const db = new Dexie('futsal-stats');
  db.version(1).stores({
    teams: 'id, name, updatedAt',
    players: 'id, teamId, number, active',
    matches: 'id, status, date, updatedAt',
    events: 'id, matchId, sequence, type, timestamp',
  });
  db.version(2).stores({
    teams: 'id, name, updatedAt, &seedKey',
    players: 'id, teamId, number, active',
    matches: 'id, status, date, updatedAt',
    events: 'id, matchId, sequence, type, timestamp',
  });
  return db;
}

function legacyFixture(): {
  teams: Team[];
  players: Player[];
  match: Omit<Match, 'teamId'>;
  events: MatchEvent[];
} {
  const teams: Team[] = [
    { id: 'legacy-team', name: 'Legacy', shortName: 'LEG', createdAt: 100, updatedAt: 200 },
  ];
  const players = Array.from({ length: 6 }, (_, index): Player => ({
    id: `legacy-player-${index + 1}`,
    teamId: 'legacy-team',
    number: index + 1,
    name: `Player ${index + 1}`,
    active: true,
  }));
  const lineup = players.slice(0, 5).map(({ id }) => id);
  const match: Omit<Match, 'teamId'> = {
    id: 'legacy-match',
    homeTeam: { id: 'legacy-team', name: 'Legacy', shortName: 'LEG' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: 1_000,
    status: 'firstHalf',
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: players.map(({ id }) => id),
    startingLineupPlayerIds: lineup,
    createdAt: 1_000,
    updatedAt: 2_000,
  };
  const base = (id: string, sequence: number, gameClockMs: number) => ({
    id,
    matchId: match.id,
    period: 1,
    gameClockMs,
    timestamp: 2_000 + sequence,
    sequence,
    undone: false,
  });
  const events: MatchEvent[] = [
    { ...base('start', 1, 1_200_000), type: 'MATCH_STARTED' },
    ...lineup.map((playerId, index): MatchEvent => ({
      ...base(`enter-${index + 1}`, index + 2, 1_200_000),
      type: 'PLAYER_ENTERED',
      playerId,
    })),
    { ...base('clock-start', 7, 1_200_000), type: 'CLOCK_STARTED' },
    {
      ...base('goal', 8, 1_100_000),
      type: 'GOAL_FOR',
      scorerPlayerId: players[0]!.id,
      lineupPlayerIds: lineup,
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
      matchElapsedMs: 100_000,
    },
    {
      ...base('foul', 9, 1_050_000),
      type: 'FOUL',
      team: 'home',
      playerId: players[1]!.id,
      periodFoulNumber: 1,
      accumulated: true,
    },
    {
      ...base('substitution', 10, 1_020_000),
      type: 'SUBSTITUTION',
      outPlayerId: players[4]!.id,
      inPlayerId: players[5]!.id,
    },
    { ...base('undo', 11, 1_010_000), type: 'EVENT_UNDONE', targetEventId: 'foul' },
    { ...base('clock-stop', 12, 1_000_000), type: 'CLOCK_STOPPED' },
  ];
  return { teams, players, match, events };
}

function statisticsByNumber(
  statistics: ReturnType<typeof deriveMatchStatistics>,
  players: readonly Pick<Player, 'id' | 'number'>[],
) {
  const numbersById = new Map(players.map(({ id, number }) => [id, number]));
  return {
    players: Object.fromEntries(
      Object.entries(statistics.players)
        .map(([id, value]) => [numbersById.get(id), value] as const)
        .sort(([left], [right]) => (left ?? 0) - (right ?? 0)),
    ),
    lineups: statistics.lineups
      .map(({ id: _, playerIds: __, ...values }) => values)
      .sort((left, right) => left.playedMs - right.playedMs),
  };
}
