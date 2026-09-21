import { MatchEvent } from '../../../shared/models/match-event';
import { LegacyMatchSnapshot } from '../../../shared/models/match';

export const FUTSAL_STATS_CSV_SCHEMA_VERSION = 'futsal-stats-csv/2';
export const MAX_MATCH_CSV_BYTES = 5 * 1024 * 1024;
export type CsvImportFormat = 'native-current' | 'legacy-player-snapshot' | 'unknown';

export interface ImportedLegacySnapshot extends Omit<LegacyMatchSnapshot, 'players'> {
  players: (Omit<LegacyMatchSnapshot['players'][number], 'playerId'> & {
    importKey: string;
  })[];
}

export type ImportIssueSeverity = 'info' | 'warning' | 'error' | 'fatal';

export interface ImportIssue {
  severity: ImportIssueSeverity;
  code: string;
  message: string;
}

export interface ImportedPlayerDto {
  importKey: string;
  sourceId?: string;
  number: number;
  name: string;
  startingLineup: boolean;
}

export interface ImportedLineupDto {
  playerImportKeys: string[];
  totalSeconds?: number;
}

export interface ImportedMatchEventDto {
  sourceId: string;
  event: MatchEvent;
}

export interface ImportedMatchDto {
  format?: Exclude<CsvImportFormat, 'unknown'>;
  schemaVersion?: string;
  source: {
    type: 'futsal-stats-csv';
    fileName: string;
    fingerprint: string;
    originalMatchId?: string;
  };
  match: {
    opponent: string;
    abbreviation?: string;
    date: string;
    description?: string;
    homeScore?: number;
    awayScore?: number;
    periodCount: number;
    periodDurationMs: number;
    statisticsSchemaVersion?: 2;
  };
  players: ImportedPlayerDto[];
  events: ImportedMatchEventDto[];
  lineups: ImportedLineupDto[];
  legacySnapshot?: ImportedLegacySnapshot;
  issues: ImportIssue[];
}

export type PlayerImportResolutionKind = 'existing' | 'create' | 'ignore' | 'manual';

export interface PlayerImportResolution {
  csvPlayer: ImportedPlayerDto;
  resolution: PlayerImportResolutionKind;
  playerId?: string;
}

export interface ImportMatchResult {
  matchId: string;
  playersCreated: number;
  playersLinked: number;
  eventCount: number;
  substitutionCount: number;
  lineupCount: number;
  issues: ImportIssue[];
}

export class InvalidCsvFormatError extends Error {}
export class UnsupportedCsvVersionError extends Error {}
export class DuplicateImportedMatchError extends Error {
  constructor(readonly existingMatchId: string) {
    super('Este partido ya existe.');
  }
}
export class PlayerResolutionError extends Error {}
export class ImportPersistenceError extends Error {}
