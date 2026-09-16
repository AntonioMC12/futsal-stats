import { Injectable } from '@angular/core';
import { MATCH_EVENT_TYPES, MatchEvent } from '../../../shared/models/match-event';
import {
  FUTSAL_STATS_CSV_SCHEMA_VERSION,
  ImportedLineupDto,
  ImportedMatchDto,
  ImportedMatchEventDto,
  ImportedPlayerDto,
  ImportIssue,
  InvalidCsvFormatError,
  UnsupportedCsvVersionError,
} from '../domain/match-import';
import { createMatchImportFingerprint } from '../domain/match-import-fingerprint';
import { normalizePlayerName } from '../domain/player-import-resolver';
import { detectCsvImportFormat, parseLegacyCsv } from './legacy-csv-import-parser';

type CsvRow = string[];
type CsvRecord = Record<string, string>;

const REQUIRED_HEADERS = ['fecha', 'equipo', 'rival', 'dorsal', 'jugador', 'titular'] as const;
const KNOWN_SECTIONS = new Set(['EVENTOS', 'QUINTETOS', 'METADATOS']);

export interface CsvImportAdapter {
  supports(rows: readonly CsvRow[]): boolean;
  parse(rows: readonly CsvRow[], fileName: string): Promise<ImportedMatchDto>;
}

@Injectable({ providedIn: 'root' })
export class CsvMatchImportParser implements CsvImportAdapter {
  supports(rows: readonly CsvRow[]): boolean {
    const headers = rows[0] ?? [];
    return REQUIRED_HEADERS.every((header) => headers.includes(header));
  }

  async parseText(input: string, fileName: string): Promise<ImportedMatchDto> {
    const rows = parseCsv(input.replace(/^\uFEFF/, ''));
    const format = detectCsvImportFormat(rows);
    if (format === 'legacy-player-snapshot') return parseLegacyCsv(rows, fileName);
    if (format === 'unknown') {
      throw new InvalidCsvFormatError('El CSV no tiene un formato reconocido de Futsal Stats.');
    }
    if (!this.supports(rows)) {
      throw new InvalidCsvFormatError('El CSV no tiene las columnas requeridas de Futsal Stats.');
    }
    return this.parse(rows, fileName);
  }

  async parse(rows: readonly CsvRow[], fileName: string): Promise<ImportedMatchDto> {
    const sections = splitSections(rows);
    const metadata = recordFromSection(sections.get('METADATOS'));
    const schemaVersion = metadata['schemaVersion'];
    if (
      schemaVersion &&
      schemaVersion !== FUTSAL_STATS_CSV_SCHEMA_VERSION &&
      schemaVersion !== 'futsal-stats-csv/1'
    ) {
      throw new UnsupportedCsvVersionError(`Versión de CSV no soportada: ${schemaVersion}`);
    }

    const issues: ImportIssue[] = [];
    if (!schemaVersion) {
      issues.push(
        issue(
          'warning',
          'legacy-version',
          'El archivo no declara versión; se ha aplicado el formato histórico compatible.',
        ),
      );
    }
    const mainRecords = records(sections.get('MAIN') ?? []);
    if (mainRecords.length === 0)
      throw new InvalidCsvFormatError('El CSV no contiene jugadores ni datos del partido.');

    const first = mainRecords[0]!;
    const opponent = first['rival']?.trim();
    if (!opponent) throw new InvalidCsvFormatError('No se puede identificar el rival.');
    const date = parseDate(first['fecha'] ?? '');
    if (!date) throw new InvalidCsvFormatError('No se puede determinar una fecha válida.');

    const eventRecords = records(sections.get('EVENTOS') ?? []);
    const events = parseEvents(eventRecords, issues);
    const lineupRecords = records(sections.get('QUINTETOS') ?? []);
    const sourceIds = playerSourceIds(eventRecords, lineupRecords);
    const players = parsePlayers(mainRecords, sourceIds);
    validateUniquePlayerKeys(players);
    validateEvents(events, players, issues);
    const lineups = parseLineups(sections.get('QUINTETOS') ?? [], players, issues);
    if (lineups.length === 0) {
      issues.push(
        issue(
          'warning',
          'missing-lineups',
          'El archivo no contiene quintetos explícitos; se reconstruirán desde los eventos.',
        ),
      );
    }
    if (!metadata['description']) {
      issues.push(
        issue('warning', 'missing-description', 'El archivo no contiene descripción del partido.'),
      );
    }
    if (!metadata['opponentShortName']) {
      issues.push(
        issue('warning', 'missing-abbreviation', 'El archivo no contiene abreviación del rival.'),
      );
    }

    const score = parseScore(first['marcador'] ?? '');
    const originalMatchId = metadata['matchId'] || events[0]?.event.matchId || undefined;
    const periodCount = Math.max(
      2,
      ...events.map(({ event }) => event.period).filter(Number.isFinite),
    );
    const periodDurationMs = Math.max(
      20 * 60 * 1000,
      ...events.map(({ event }) => event.gameClockMs),
    );
    const fingerprint = await createMatchImportFingerprint({
      date,
      opponent: normalizePlayerName(opponent),
      players: players.map(({ number, name }) => [number, normalizePlayerName(name)]),
      events: events.map(({ event }) => sanitizeEventForFingerprint(event)),
    });

    return {
      format: 'native-current',
      schemaVersion,
      source: {
        type: 'futsal-stats-csv',
        fileName,
        fingerprint,
        originalMatchId,
      },
      match: {
        opponent,
        abbreviation: metadata['opponentShortName'] || undefined,
        date,
        description: metadata['description'] || undefined,
        homeScore: score?.[0],
        awayScore: score?.[1],
        periodCount,
        periodDurationMs,
      },
      players,
      events,
      lineups,
      issues,
    };
  }
}

export function parseCsv(input: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (quoted)
    throw new InvalidCsvFormatError('El CSV contiene un campo entrecomillado incompleto.');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.some((item) => item.length > 100) || rows.length > 20_000) {
    throw new InvalidCsvFormatError('El CSV supera los límites estructurales admitidos.');
  }
  return rows;
}

function splitSections(rows: readonly CsvRow[]): Map<string, CsvRow[]> {
  const sections = new Map<string, CsvRow[]>([['MAIN', []]]);
  let name = 'MAIN';
  for (const row of rows) {
    const title = row.length === 1 ? row[0]?.trim().toUpperCase() : undefined;
    if (title && KNOWN_SECTIONS.has(title)) {
      name = title;
      sections.set(name, []);
    } else if (!row.every((cell) => cell.trim() === '')) {
      sections.get(name)!.push(row);
    }
  }
  return sections;
}

function records(rows: readonly CsvRow[]): CsvRecord[] {
  const [headers, ...values] = rows;
  if (!headers) return [];
  return values.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), row[index] ?? ''])),
  );
}

function recordFromSection(rows?: readonly CsvRow[]): CsvRecord {
  return records(rows ?? [])[0] ?? {};
}

function parsePlayers(
  recordsToParse: CsvRecord[],
  sourceIds: Map<string, string>,
): ImportedPlayerDto[] {
  return recordsToParse.map((record, index) => {
    const number = Number(record['dorsal']);
    const name = record['jugador']?.trim() ?? '';
    if (!Number.isInteger(number) || number < 0 || !name) {
      throw new InvalidCsvFormatError(`Jugador inválido en la fila ${index + 2}.`);
    }
    const lookup = `${number}:${normalizePlayerName(name)}`;
    const sourceId = sourceIds.get(lookup);
    return {
      importKey: sourceId ?? `row:${lookup}`,
      sourceId,
      number,
      name,
      startingLineup: normalizeYes(record['titular']),
    };
  });
}

function playerSourceIds(
  eventRecords: CsvRecord[],
  lineupRecords: CsvRecord[],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const record of eventRecords) {
    addPlayerSource(result, record['playerId'], record['playerNumber'], record['playerName']);
    addPlayerSource(
      result,
      record['foulPlayerId'],
      record['foulPlayerNumber'],
      record['foulPlayerName'],
    );
    addPlayerSource(
      result,
      record['secondaryPlayerId'],
      record['secondaryPlayerNumber'],
      record['secondaryPlayerName'],
    );
  }
  for (const record of lineupRecords) {
    const ids = (record['playerIds'] ?? '').split('|').filter(Boolean);
    const labels = [
      ...(record['players'] ?? '').matchAll(/(?:^| \| )#(\d+) (.*?)(?= \| #\d+ |$)/g),
    ];
    labels.forEach((label, index) => addPlayerSource(result, ids[index], label[1], label[2]));
  }
  return result;
}

function addPlayerSource(
  result: Map<string, string>,
  id?: string,
  number?: string,
  name?: string,
): void {
  if (!id || !name || !Number.isFinite(Number(number))) return;
  result.set(`${Number(number)}:${normalizePlayerName(name)}`, id);
}

function parseEvents(eventRecords: CsvRecord[], issues: ImportIssue[]): ImportedMatchEventDto[] {
  if (eventRecords.length === 0) {
    issues.push(
      issue(
        'warning',
        'missing-events',
        'El archivo no contiene eventos; las estadísticas no podrán reconstruirse.',
      ),
    );
    return [];
  }
  return eventRecords.map((record, index) => {
    let event: MatchEvent;
    try {
      event = JSON.parse(record['metadata'] ?? '') as MatchEvent;
    } catch {
      throw new InvalidCsvFormatError(`Los datos del evento ${index + 1} son ilegibles.`);
    }
    if (!event || !MATCH_EVENT_TYPES.includes(event.type) || !record['eventId']) {
      throw new InvalidCsvFormatError(`El evento ${index + 1} no es válido.`);
    }
    const sequence = Number(record['sequence']);
    const period = Number(record['period']);
    const gameClockMs = Number(record['gameClockMs']);
    const timestamp = Number(record['createdAt']);
    if (![sequence, period, gameClockMs, timestamp].every(Number.isFinite) || gameClockMs < 0) {
      throw new InvalidCsvFormatError(
        `El tiempo o secuencia del evento ${index + 1} no es válido.`,
      );
    }
    event = {
      ...event,
      id: record['eventId'],
      sequence,
      period,
      gameClockMs,
      timestamp,
      undone: normalizeBoolean(record['undone']),
    };
    if (event.type === 'FOUL' && event.countsAsAccumulatedFoul === undefined) {
      if (event.accumulated === undefined) {
        issues.push(
          issue(
            'warning',
            'ambiguous-legacy-foul',
            `La falta ${event.sequence} no declara si era acumulativa; se aplica la semántica histórica.`,
          ),
        );
      }
      event = {
        ...event,
        countsAsAccumulatedFoul: event.accumulated !== false,
        restart: event.accumulated === false ? 'indirect-free-kick' : 'direct-free-kick',
      };
    }
    return { sourceId: event.id, event };
  });
}

function parseLineups(
  rows: readonly CsvRow[],
  players: ImportedPlayerDto[],
  issues: ImportIssue[],
): ImportedLineupDto[] {
  const sourceToKey = new Map(
    players
      .filter((player) => player.sourceId)
      .map((player) => [player.sourceId!, player.importKey]),
  );
  return records(rows).map((record, index) => {
    const sourceIds = (record['playerIds'] ?? '').split('|').filter(Boolean);
    if (sourceIds.length > 5)
      issues.push(
        issue('error', 'lineup-too-large', `El quinteto ${index + 1} contiene más de 5 jugadores.`),
      );
    const playerImportKeys = sourceIds
      .map((id) => sourceToKey.get(id))
      .filter((id): id is string => Boolean(id));
    if (playerImportKeys.length !== sourceIds.length)
      issues.push(
        issue(
          'warning',
          'lineup-reference',
          `El quinteto ${index + 1} contiene referencias no disponibles.`,
        ),
      );
    const totalSeconds = Number(record['totalSeconds']);
    return { playerImportKeys, ...(Number.isFinite(totalSeconds) ? { totalSeconds } : {}) };
  });
}

function validateUniquePlayerKeys(players: ImportedPlayerDto[]): void {
  if (new Set(players.map(({ importKey }) => importKey)).size !== players.length) {
    throw new InvalidCsvFormatError('El CSV contiene jugadores duplicados.');
  }
}

function validateEvents(
  events: ImportedMatchEventDto[],
  players: ImportedPlayerDto[],
  issues: ImportIssue[],
): void {
  if (new Set(events.map(({ sourceId }) => sourceId)).size !== events.length) {
    throw new InvalidCsvFormatError('El CSV contiene IDs de evento duplicados.');
  }
  const playerIds = new Set(players.flatMap(({ sourceId }) => (sourceId ? [sourceId] : [])));
  const eventIds = new Set(events.map(({ sourceId }) => sourceId));
  for (const { event } of events) {
    const record = event as unknown as Record<string, unknown>;
    for (const key of [
      'playerId',
      'foulPlayerId',
      'scorerPlayerId',
      'outPlayerId',
      'inPlayerId',
    ] as const) {
      const id = record[key];
      if (typeof id === 'string' && id && !playerIds.has(id)) {
        issues.push(
          issue(
            'fatal',
            'missing-player-reference',
            `El evento ${event.sequence} referencia un jugador que no está en la convocatoria.`,
          ),
        );
      }
    }
    for (const key of ['targetEventId', 'reductionEventId', 'relatedEventId'] as const) {
      const id = record[key];
      if (typeof id === 'string' && id && !eventIds.has(id)) {
        issues.push(
          issue(
            'fatal',
            'missing-event-reference',
            `El evento ${event.sequence} contiene una referencia de evento inválida.`,
          ),
        );
      }
    }
    const lineup = record['lineupPlayerIds'];
    if (Array.isArray(lineup)) {
      if (lineup.length > 5)
        issues.push(
          issue(
            'error',
            'event-lineup-too-large',
            `El evento ${event.sequence} contiene más de 5 jugadores en pista.`,
          ),
        );
      if (lineup.some((id) => typeof id !== 'string' || !playerIds.has(id))) {
        issues.push(
          issue(
            'fatal',
            'event-lineup-reference',
            `El evento ${event.sequence} contiene un jugador en pista que no está en la convocatoria.`,
          ),
        );
      }
    }
  }
}

function parseDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) || parsed.getDate() !== Number(match[1]) ? null : date;
}

function parseScore(value: string): [number, number] | null {
  const match = /^(\d+)\s*-\s*(\d+)$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function normalizeYes(value?: string): boolean {
  return ['sí', 'si', 'yes', 'true', '1'].includes((value ?? '').trim().toLocaleLowerCase('es'));
}

function normalizeBoolean(value?: string): boolean {
  return ['true', '1', 'sí', 'si'].includes((value ?? '').trim().toLocaleLowerCase('es'));
}

function issue(severity: ImportIssue['severity'], code: string, message: string): ImportIssue {
  return { severity, code, message };
}

function sanitizeEventForFingerprint(event: MatchEvent): Record<string, unknown> {
  const { id: _id, matchId: _matchId, timestamp: _timestamp, ...semantic } = event;
  return semantic;
}
