import { TestBed } from '@angular/core/testing';
import {
  MATCH_EVENT_REPOSITORY, MATCH_REPOSITORY, PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { ImportedMatchDto } from '../domain/match-import';
import { ImportMatchFromCsvUseCase } from './import-match-from-csv.use-case';

function dto(): ImportedMatchDto {
  return {
    schemaVersion: 'futsal-stats-csv/1',
    source: { type: 'futsal-stats-csv', fileName: 'match.csv', fingerprint: 'fingerprint', originalMatchId: 'source-match' },
    match: { opponent: 'Rival', abbreviation: 'RIV', date: '2026-09-13', homeScore: 1, awayScore: 0, periodCount: 2, periodDurationMs: 1_200_000 },
    players: [{ importKey: 'source-player', sourceId: 'source-player', number: 7, name: 'Alex', startingLineup: true }],
    events: [{
      sourceId: 'source-event',
      event: {
        id: 'source-event', matchId: 'source-match', type: 'GOAL_FOR', scorerPlayerId: 'source-player',
        lineupPlayerIds: ['source-player'], scoreBefore: { home: 0, away: 0 }, scoreAfter: { home: 1, away: 0 },
        period: 1, gameClockMs: 900_000, timestamp: 1, sequence: 1, undone: false,
      },
    }],
    lineups: [{ playerImportKeys: ['source-player'], totalSeconds: 10 }],
    issues: [],
  };
}

describe('ImportMatchFromCsvUseCase', () => {
  it('creates missing players, remaps ids and commits one finished match', async () => {
    const importMatch = vi.fn(async (_match: Match, _events: readonly MatchEvent[], _players: readonly unknown[]) => undefined);
    TestBed.configureTestingModule({ providers: [
      ImportMatchFromCsvUseCase,
      { provide: TeamWorkspaceContext, useValue: { activeTeam: () => ({ id: 'team', name: 'Inter', shortName: 'INT' }) } },
      { provide: PLAYER_REPOSITORY, useValue: { listByTeam: async () => [] } },
      { provide: MATCH_REPOSITORY, useValue: { listByTeam: async () => [], delete: vi.fn() } },
      { provide: MATCH_EVENT_REPOSITORY, useValue: { importMatch } },
    ] });
    const source = dto();
    const result = await TestBed.inject(ImportMatchFromCsvUseCase).execute({
      importedMatch: source,
      resolutions: [{ csvPlayer: source.players[0]!, resolution: 'create' }],
    });

    expect(result).toMatchObject({ playersCreated: 1, eventCount: 1, substitutionCount: 0 });
    expect(importMatch).toHaveBeenCalledOnce();
    const [savedMatch, savedEvents, savedPlayers] = importMatch.mock.calls[0]!;
    expect(savedPlayers).toHaveLength(1);
    expect(savedMatch).toMatchObject({ status: 'finished', teamId: 'team', source: 'csv-import' });
    expect(savedMatch.id).not.toBe('source-match');
    expect(savedEvents[0]!.id).not.toBe('source-event');
    expect(savedEvents[0]!.matchId).toBe(savedMatch.id);
    expect(savedEvents[0]!.type === 'GOAL_FOR' && savedEvents[0].scorerPlayerId).toBe(savedMatch.squadPlayerIds[0]);
  });

  it('blocks a second import with the same fingerprint', async () => {
    TestBed.configureTestingModule({ providers: [
      ImportMatchFromCsvUseCase,
      { provide: TeamWorkspaceContext, useValue: { activeTeam: () => ({ id: 'team', name: 'Inter', shortName: 'INT' }) } },
      { provide: PLAYER_REPOSITORY, useValue: {} },
      { provide: MATCH_REPOSITORY, useValue: { listByTeam: async () => [{ id: 'existing', importMetadata: { fingerprint: 'fingerprint' } }] } },
      { provide: MATCH_EVENT_REPOSITORY, useValue: {} },
    ] });
    await expect(TestBed.inject(ImportMatchFromCsvUseCase).execute({ importedMatch: dto(), resolutions: [] }))
      .rejects.toMatchObject({ existingMatchId: 'existing' });
  });
});
