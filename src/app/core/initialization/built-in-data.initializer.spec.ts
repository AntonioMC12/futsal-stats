import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { DexiePlayerRepository } from '../persistence/local/dexie-player.repository';
import { DexieTeamRepository } from '../persistence/local/dexie-team.repository';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import {
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from '../persistence/persistence.tokens';
import { MatchSetupService } from '../../features/match-setup/application/match-setup.service';
import { BuiltInDataInitializer } from './built-in-data.initializer';
import { APAGA_ROSTER, APAGA_SEED_KEY, APAGA_TEAM_ID } from './built-in-teams';

describe('BuiltInDataInitializer', () => {
  let db: FutsalStatsDb;
  let initializer: BuiltInDataInitializer;

  beforeEach(async () => {
    await Dexie.delete('futsal-stats');
    configureTestingModule();
  });

  afterEach(async () => {
    db.close();
    TestBed.resetTestingModule();
    await Dexie.delete('futsal-stats');
  });

  it('creates Apaga and its exact active roster in an empty database', async () => {
    await initializer.ensureBuiltInTeams();

    const teams = await db.teams.toArray();
    const players = await db.players.where('teamId').equals(APAGA_TEAM_ID).sortBy('number');
    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({
      id: APAGA_TEAM_ID,
      seedKey: APAGA_SEED_KEY,
      name: 'Apaga',
      shortName: 'APA',
    });
    expect(players.map(({ number, name }) => ({ number, name }))).toEqual(APAGA_ROSTER);
    expect(players).toHaveLength(16);
    expect(players.every((player) => player.active)).toBe(true);
  });

  it('is idempotent and safe under repeated concurrent initialization', async () => {
    await Promise.all([
      initializer.ensureBuiltInTeams(),
      initializer.ensureBuiltInTeams(),
      initializer.ensureBuiltInTeams(),
    ]);

    expect(await db.teams.where('seedKey').equals(APAGA_SEED_KEY).count()).toBe(1);
    expect(await db.players.where('teamId').equals(APAGA_TEAM_ID).count()).toBe(16);
  });

  it('preserves existing teams and does not overwrite later edits to Apaga', async () => {
    const userTeam = {
      id: 'user-team',
      name: 'Equipo Usuario',
      shortName: 'USR',
      createdAt: 1,
      updatedAt: 1,
    };
    await db.teams.put(userTeam);
    await initializer.ensureBuiltInTeams();
    const apaga = await db.teams.get(APAGA_TEAM_ID);
    await db.teams.put({ ...apaga!, name: 'Apaga editado', updatedAt: 10 });
    const firstPlayer = await db.players.get('built-in-player-apaga-01');
    await db.players.put({ ...firstPlayer!, name: 'MELLI EDITADO' });

    await initializer.ensureBuiltInTeams();

    expect(await db.teams.get('user-team')).toEqual(userTeam);
    expect((await db.teams.get(APAGA_TEAM_ID))?.name).toBe('Apaga editado');
    expect((await db.players.get('built-in-player-apaga-01'))?.name).toBe('MELLI EDITADO');
    expect(await db.players.where('teamId').equals(APAGA_TEAM_ID).count()).toBe(16);
  });

  it('upgrades an existing version 1 database without modifying its data', async () => {
    db.close();
    TestBed.resetTestingModule();
    const legacy = new Dexie('futsal-stats');
    legacy.version(1).stores({
      teams: 'id, name, updatedAt',
      players: 'id, teamId, number, active',
      matches: 'id, status, date, updatedAt',
      events: 'id, matchId, sequence, type, timestamp',
    });
    const legacyTeam = {
      id: 'legacy-team',
      name: 'Equipo anterior',
      shortName: 'ANT',
      createdAt: 1,
      updatedAt: 1,
    };
    await legacy.table('teams').put(legacyTeam);
    legacy.close();

    configureTestingModule();
    await initializer.ensureBuiltInTeams();

    expect(await db.teams.get('legacy-team')).toEqual(legacyTeam);
    expect(await db.teams.where('seedKey').equals(APAGA_SEED_KEY).count()).toBe(1);
    expect(await db.players.where('teamId').equals(APAGA_TEAM_ID).count()).toBe(16);
  });

  it('persists across database instances and is recreated after a full database reset', async () => {
    await initializer.ensureBuiltInTeams();
    db.close();

    const reopened = new FutsalStatsDb();
    expect((await reopened.teams.where('seedKey').equals(APAGA_SEED_KEY).first())?.name).toBe(
      'Apaga',
    );
    expect(await reopened.players.where('teamId').equals(APAGA_TEAM_ID).count()).toBe(16);
    reopened.close();

    await Dexie.delete('futsal-stats');
    TestBed.resetTestingModule();
    configureTestingModule();
    await initializer.ensureBuiltInTeams();

    expect(await db.teams.where('seedKey').equals(APAGA_SEED_KEY).count()).toBe(1);
    expect(await db.players.where('teamId').equals(APAGA_TEAM_ID).count()).toBe(16);
  });

  it('makes Apaga and all 16 ordered players available to match setup', async () => {
    await initializer.ensureBuiltInTeams();
    const setup = TestBed.inject(MatchSetupService);

    expect(await setup.listTeams()).toContainEqual({
      team: expect.objectContaining({ id: APAGA_TEAM_ID, name: 'Apaga' }),
      playerCount: 16,
    });
    expect((await setup.listPlayers(APAGA_TEAM_ID)).map((player) => player.number)).toEqual(
      APAGA_ROSTER.map((player) => player.number),
    );
  });

  function configureTestingModule(): void {
    TestBed.configureTestingModule({
      providers: [
        FutsalStatsDb,
        BuiltInDataInitializer,
        DexieTeamRepository,
        DexiePlayerRepository,
        { provide: TEAM_REPOSITORY, useExisting: DexieTeamRepository },
        { provide: PLAYER_REPOSITORY, useExisting: DexiePlayerRepository },
        MatchSetupService,
        { provide: MATCH_REPOSITORY, useValue: {} },
      ],
    });
    db = TestBed.inject(FutsalStatsDb);
    initializer = TestBed.inject(BuiltInDataInitializer);
  }
});
