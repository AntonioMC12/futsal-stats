import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { provideLocalPersistence } from '../../../core/persistence/provide-local-persistence';
import { FutsalStatsDb } from '../../../core/persistence/local/futsal-stats.db';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { CsvMatchImportParser } from '../data/csv-match-import-parser';
import { serializeMatchCsv } from '../domain/match-csv';
import { buildMatchStatisticsExport } from '../domain/match-export';
import { ImportMatchFromCsvUseCase } from './import-match-from-csv.use-case';
import { DuplicateImportedMatchError } from '../domain/match-import';

describe('CSV match import integration', () => {
  let db: FutsalStatsDb;

  beforeEach(async () => {
    await Dexie.delete('futsal-stats');
    const activeTeam = {
      id: 'team-target',
      name: 'Destino',
      shortName: 'DES',
      createdAt: 1,
      updatedAt: 1,
    };
    TestBed.configureTestingModule({
      providers: [
        provideLocalPersistence(),
        ImportMatchFromCsvUseCase,
        CsvMatchImportParser,
        { provide: TeamWorkspaceContext, useValue: { activeTeam: () => activeTeam } },
      ],
    });
    db = TestBed.inject(FutsalStatsDb);
    await TestBed.inject(TEAM_REPOSITORY).put(activeTeam);
  });

  afterEach(async () => {
    db.close();
    TestBed.resetTestingModule();
    await Dexie.delete('futsal-stats');
  });

  it('runs export → parse → import → repositories without orphan records', async () => {
    const sourcePlayer: Player = {
      id: 'source-player',
      teamId: 'source-team',
      number: 7,
      name: 'Alex',
      active: true,
    };
    const sourceMatch: Match = {
      id: 'source-match',
      teamId: 'source-team',
      homeTeam: { id: 'source-team', name: 'Origen', shortName: 'ORI' },
      awayTeam: { name: 'Rival', shortName: 'RIV' },
      date: '2026-09-13',
      description: 'Copa',
      status: 'finished',
      currentPeriod: 2,
      periodCount: 2,
      clock: { ...createMatchClock(), remainingMs: 0 },
      squadPlayerIds: [sourcePlayer.id],
      startingLineupPlayerIds: [sourcePlayer.id],
      createdAt: 1,
      updatedAt: 2,
    };
    const sourceEvent: MatchEvent = {
      id: 'source-goal',
      matchId: sourceMatch.id,
      type: 'GOAL_FOR',
      scorerPlayerId: sourcePlayer.id,
      lineupPlayerIds: [sourcePlayer.id],
      scoreBefore: { home: 0, away: 0 },
      scoreAfter: { home: 1, away: 0 },
      period: 1,
      gameClockMs: 600_000,
      timestamp: 1,
      sequence: 1,
      undone: false,
    };
    const csv = serializeMatchCsv(
      buildMatchStatisticsExport(sourceMatch, [sourceEvent], [sourcePlayer]),
    );
    const parsed = await TestBed.inject(CsvMatchImportParser).parseText(csv, 'portable.csv');
    const result = await TestBed.inject(ImportMatchFromCsvUseCase).execute({
      importedMatch: parsed,
      resolutions: [{ csvPlayer: parsed.players[0]!, resolution: 'create' }],
    });

    const savedMatch = await TestBed.inject(MATCH_REPOSITORY).get(result.matchId);
    const savedEvents = await TestBed.inject(MATCH_EVENT_REPOSITORY).listByMatch(result.matchId);
    const savedPlayers = await TestBed.inject(PLAYER_REPOSITORY).listByTeam('team-target');
    expect(savedMatch).toMatchObject({
      status: 'finished',
      source: 'csv-import',
      description: 'Copa',
    });
    expect(savedPlayers).toHaveLength(1);
    expect(savedMatch?.squadPlayerIds).toEqual([savedPlayers[0]!.id]);
    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0]).toMatchObject({ type: 'GOAL_FOR', scorerPlayerId: savedPlayers[0]!.id });
  });

  it('persists a legacy snapshot locally with linked players, no events and duplicate protection', async () => {
    const csv = [
      'fecha,equipo,rival,estado_partido,periodo,reloj,marcador,dorsal,jugador,segundos_jugados,titular,entradas_en_pista',
      '28/08/2026,Apaga,MNG,Primera parte,1,19:18,1-0,1,Ratón,41,Sí,1',
    ].join('\n');
    const parsed = await TestBed.inject(CsvMatchImportParser).parseText(csv, 'legacy.csv');
    const input = {
      importedMatch: parsed,
      resolutions: [{ csvPlayer: parsed.players[0]!, resolution: 'create' as const }],
    };
    const result = await TestBed.inject(ImportMatchFromCsvUseCase).execute(input);
    const saved = await TestBed.inject(MATCH_REPOSITORY).get(result.matchId);
    const players = await TestBed.inject(PLAYER_REPOSITORY).listByTeam('team-target');
    expect(saved?.importMetadata?.legacySnapshot).toMatchObject({
      observedState: 'Primera parte',
      observedScore: { home: 1, away: 0 },
      players: [{ playerId: players[0]!.id, secondsPlayed: 41, starter: true }],
    });
    expect(await TestBed.inject(MATCH_EVENT_REPOSITORY).listByMatch(result.matchId)).toEqual([]);
    await expect(TestBed.inject(ImportMatchFromCsvUseCase).execute(input)).rejects.toBeInstanceOf(
      DuplicateImportedMatchError,
    );
  });
});
