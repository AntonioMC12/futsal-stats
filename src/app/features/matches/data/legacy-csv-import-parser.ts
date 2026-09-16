import {
  CsvImportFormat,
  ImportedLegacySnapshot,
  ImportedMatchDto,
  ImportedPlayerDto,
  ImportIssue,
  InvalidCsvFormatError,
} from '../domain/match-import';
import { createMatchImportFingerprint } from '../domain/match-import-fingerprint';
import { normalizePlayerName } from '../domain/player-import-resolver';

type CsvRow = readonly string[];
type CsvRecord = Record<string, string>;

const GLOBAL_COLUMNS = {
  faltas_equipo: 'teamFouls',
  faltas_rival: 'opponentFouls',
  amarillas_equipo: 'teamYellowCards',
  amarillas_rival: 'opponentYellowCards',
  expulsiones_equipo: 'teamExpulsions',
  expulsiones_rival: 'opponentExpulsions',
} as const;

export function detectCsvImportFormat(rows: readonly CsvRow[]): CsvImportFormat {
  const headers = new Set((rows[0] ?? []).map(normalizeHeader));
  const sections = rows.some(
    (row) =>
      row.length === 1 &&
      ['EVENTOS', 'QUINTETOS', 'METADATOS'].includes(row[0]?.trim().toUpperCase() ?? ''),
  );
  if (
    sections ||
    ['goles', 'faltas_acumulables', 'tiempo_primera_mitad', 'segundos_primera_mitad'].some(
      (header) => headers.has(header),
    )
  )
    return 'native-current';
  if (
    ['fecha', 'equipo', 'rival', 'dorsal', 'jugador'].every((header) => headers.has(header)) &&
    ['estado_partido', 'reloj', 'marcador', 'tiempo_jugado', 'segundos_jugados', 'en_pista'].some(
      (header) => headers.has(header),
    )
  )
    return 'legacy-player-snapshot';
  return 'unknown';
}

export async function parseLegacyCsv(
  rows: readonly CsvRow[],
  fileName: string,
): Promise<ImportedMatchDto> {
  const headers = (rows[0] ?? []).map(normalizeHeader);
  const records = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
  if (!records.length) throw new InvalidCsvFormatError('El CSV no contiene jugadores.');
  const first = records[0]!;
  const date = parseDate(first['fecha'] ?? '');
  const teamName = first['equipo']?.trim() ?? '';
  const opponent = first['rival']?.trim() ?? '';
  if (!date || !teamName || !opponent)
    throw new InvalidCsvFormatError('No se puede determinar fecha, equipo y rival del CSV.');

  const issues: ImportIssue[] = [
    warning(
      'legacy-partial',
      'CSV antiguo: la cronología, las sustituciones y los quintetos posteriores no están disponibles.',
    ),
  ];
  const players: ImportedPlayerDto[] = [];
  const snapshots: ImportedLegacySnapshot['players'] = [];
  const keys = new Set<string>();
  for (const [index, record] of records.entries()) {
    const numberText = record['dorsal']?.trim() ?? '';
    const number = Number(numberText);
    const name = record['jugador']?.trim() ?? '';
    if (!numberText || !Number.isInteger(number) || number < 0 || number > 99 || !name) {
      throw new InvalidCsvFormatError(`Jugador o dorsal inválido en la fila ${index + 2}.`);
    }
    const importKey = `row:${number}:${normalizePlayerName(name)}`;
    if (keys.has(importKey))
      throw new InvalidCsvFormatError('El CSV contiene jugadores duplicados.');
    keys.add(importKey);
    const starter = optionalBoolean(record['titular'], issues, index + 2, 'titular');
    players.push({ importKey, number, name, startingLineup: starter ?? false });
    const secondsValue = optionalInteger(
      record['segundos_jugados'],
      issues,
      index + 2,
      'segundos_jugados',
    );
    const timeValue = optionalDuration(record['tiempo_jugado'], issues, index + 2, 'tiempo_jugado');
    if (secondsValue !== undefined && timeValue !== undefined && secondsValue !== timeValue) {
      issues.push(
        warning(
          'playing-time-conflict',
          `Fila ${index + 2}: tiempo y segundos jugados no coinciden; se usan los segundos explícitos.`,
        ),
      );
    }
    snapshots.push(
      compact({
        importKey,
        secondsPlayed: secondsValue ?? timeValue,
        goalsForOnCourt: optionalInteger(
          record['goles_favor_en_pista'],
          issues,
          index + 2,
          'goles_favor_en_pista',
        ),
        goalsAgainstOnCourt: optionalInteger(
          record['goles_contra_en_pista'],
          issues,
          index + 2,
          'goles_contra_en_pista',
        ),
        goalDifference: optionalSignedInteger(
          record['diferencia_goles'],
          issues,
          index + 2,
          'diferencia_goles',
        ),
        fouls: optionalInteger(record['faltas'], issues, index + 2, 'faltas'),
        yellowCards: optionalInteger(record['amarillas'], issues, index + 2, 'amarillas'),
        secondYellowCards: optionalInteger(
          record['segunda_amarilla'],
          issues,
          index + 2,
          'segunda_amarilla',
        ),
        directRedCards: optionalInteger(
          record['rojas_directas'],
          issues,
          index + 2,
          'rojas_directas',
        ),
        expulsions: optionalInteger(record['expulsiones'], issues, index + 2, 'expulsiones'),
        starter,
        onCourtAtSnapshot: optionalBoolean(record['en_pista'], issues, index + 2, 'en_pista'),
        courtEntries: optionalInteger(
          record['entradas_en_pista'],
          issues,
          index + 2,
          'entradas_en_pista',
        ),
      }),
    );
    if (
      record['fecha']?.trim() !== first['fecha']?.trim() ||
      record['equipo']?.trim() !== teamName ||
      record['rival']?.trim() !== opponent
    ) {
      issues.push(
        warning(
          'inconsistent-header',
          `Fila ${index + 2}: cabecera del partido distinta; se conserva la primera fila.`,
        ),
      );
    }
  }

  const starterKeys = snapshots
    .filter(({ starter }) => starter === true)
    .map(({ importKey }) => importKey);
  if (starterKeys.length !== 5) {
    issues.push(
      warning(
        'invalid-starting-lineup',
        `No se pudo reconstruir un quinteto inicial válido: se encontraron ${starterKeys.length} titulares.`,
      ),
    );
  }
  const score = parseScore(first['marcador']);
  if (!score)
    issues.push(
      warning('missing-score', 'El marcador observado no está disponible o no es válido.'),
    );
  const observedPeriod = optionalInteger(first['periodo'], issues, 2, 'periodo');
  const observedClockSeconds = optionalDuration(first['reloj'], issues, 2, 'reloj');
  const teamTotals: NonNullable<ImportedLegacySnapshot['teamTotals']> = {};
  for (const [column, key] of Object.entries(GLOBAL_COLUMNS) as [
    keyof typeof GLOBAL_COLUMNS,
    (typeof GLOBAL_COLUMNS)[keyof typeof GLOBAL_COLUMNS],
  ][]) {
    const values = records.map((record, index) =>
      optionalInteger(record[column], issues, index + 2, column),
    );
    const present = values.filter((value): value is number => value !== undefined);
    if (!present.length) continue;
    if (present.length !== records.length || new Set(present).size !== 1) {
      issues.push(
        warning(
          'inconsistent-global',
          `La columna ${column} no coincide en todas las filas; queda sin dato.`,
        ),
      );
    } else teamTotals[key] = present[0];
  }
  const legacySnapshot: ImportedLegacySnapshot = {
    importFormat: 'legacy-player-snapshot',
    reconstructionVersion: 1,
    observedTeamName: teamName,
    ...(first['estado_partido']?.trim() ? { observedState: first['estado_partido'].trim() } : {}),
    ...(observedPeriod !== undefined ? { observedPeriod } : {}),
    ...(observedClockSeconds !== undefined ? { observedClock: first['reloj']?.trim() } : {}),
    ...(score ? { observedScore: { home: score[0], away: score[1] } } : {}),
    ...(Object.keys(teamTotals).length ? { teamTotals } : {}),
    players: snapshots,
    missingData: ['eventTimeline', 'substitutionTimeline', 'lineupHistory'],
  };
  const fingerprint = await createMatchImportFingerprint({
    format: 'legacy-player-snapshot',
    date,
    team: normalizePlayerName(teamName),
    opponent: normalizePlayerName(opponent),
    score: score ?? null,
    players: snapshots
      .map(({ importKey, ...statistics }) => ({ importKey, ...statistics }))
      .sort((left, right) => left.importKey.localeCompare(right.importKey)),
  });
  return {
    format: 'legacy-player-snapshot',
    source: { type: 'futsal-stats-csv', fileName, fingerprint },
    match: {
      opponent,
      date,
      ...(score ? { homeScore: score[0], awayScore: score[1] } : {}),
      periodCount: Math.max(2, observedPeriod ?? 1),
      periodDurationMs: 20 * 60 * 1000,
    },
    players,
    events: [],
    lineups: starterKeys.length === 5 ? [{ playerImportKeys: starterKeys }] : [],
    legacySnapshot,
    issues,
  };
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[\s-]+/g, '_');
}

function parseDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.getFullYear() === Number(match[3]) &&
    parsed.getMonth() === Number(match[2]) - 1 &&
    parsed.getDate() === Number(match[1])
    ? date
    : null;
}

function parseScore(value?: string): [number, number] | null {
  const match = /^(\d+)\s*-\s*(\d+)$/.exec(value?.trim() ?? '');
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function optionalDuration(
  value: string | undefined,
  issues: ImportIssue[],
  row: number,
  column: string,
): number | undefined {
  if (!value?.trim()) return undefined;
  const match = /^(\d+):(\d{2})$/.exec(value.trim());
  if (match && Number(match[2]) < 60) return Number(match[1]) * 60 + Number(match[2]);
  issues.push(warning('invalid-duration', `Fila ${row}: ${column} no es un tiempo MM:SS válido.`));
  return undefined;
}

function optionalInteger(
  value: string | undefined,
  issues: ImportIssue[],
  row: number,
  column: string,
): number | undefined {
  return parseInteger(value, issues, row, column, false);
}

function optionalSignedInteger(
  value: string | undefined,
  issues: ImportIssue[],
  row: number,
  column: string,
): number | undefined {
  return parseInteger(value, issues, row, column, true);
}

function parseInteger(
  value: string | undefined,
  issues: ImportIssue[],
  row: number,
  column: string,
  signed: boolean,
): number | undefined {
  if (!value?.trim()) return undefined;
  const number = Number(value.trim());
  if (Number.isSafeInteger(number) && (signed || number >= 0)) return number;
  issues.push(warning('invalid-number', `Fila ${row}: ${column} no es un número válido.`));
  return undefined;
}

function optionalBoolean(
  value: string | undefined,
  issues: ImportIssue[],
  row: number,
  column: string,
): boolean | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (['si', 'true', '1', 'yes'].includes(normalized)) return true;
  if (['no', 'false', '0'].includes(normalized)) return false;
  issues.push(warning('invalid-boolean', `Fila ${row}: ${column} no es Sí/No válido.`));
  return undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function warning(code: string, message: string): ImportIssue {
  return { severity: 'warning', code, message };
}
