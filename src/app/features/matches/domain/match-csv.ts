import { MatchStatisticsExport, PlayerMatchExportRow } from './match-export';

export const CSV_UTF8_BOM = '\uFEFF';

const HEADERS: readonly (keyof PlayerMatchExportRow)[] = [
  'date',
  'team',
  'opponent',
  'matchStatus',
  'period',
  'clock',
  'score',
  'number',
  'playerName',
  'goals',
  'playingTime',
  'playingSeconds',
  'goalsForOnCourt',
  'goalsAgainstOnCourt',
  'plusMinus',
  'startingLineup',
  'onCourt',
  'timesEntered',
  'fouls',
  'yellowCards',
  'secondYellowSendOffs',
  'directRedCards',
  'sendOffs',
  'teamFouls',
  'opponentFouls',
  'teamYellowCards',
  'opponentYellowCards',
  'teamDirectRedCards',
  'opponentDirectRedCards',
  'teamSendOffs',
  'opponentSendOffs',
  'firstHalfTime',
  'secondHalfTime',
  'firstHalfSeconds',
  'secondHalfSeconds',
];

const CSV_HEADERS = [
  'fecha',
  'equipo',
  'rival',
  'estado_partido',
  'periodo',
  'reloj',
  'marcador',
  'dorsal',
  'jugador',
  'goles',
  'tiempo_jugado',
  'segundos_jugados',
  'goles_favor_en_pista',
  'goles_contra_en_pista',
  'diferencia_goles',
  'titular',
  'en_pista',
  'entradas_en_pista',
  'faltas',
  'amarillas',
  'segunda_amarilla',
  'rojas_directas',
  'expulsiones',
  'faltas_equipo',
  'faltas_rival',
  'amarillas_equipo',
  'amarillas_rival',
  'rojas_directas_equipo',
  'rojas_directas_rival',
  'expulsiones_equipo',
  'expulsiones_rival',
  'tiempo_primera_mitad',
  'tiempo_segunda_mitad',
  'segundos_primera_mitad',
  'segundos_segunda_mitad',
] as const;

export function serializeMatchCsv(exportData: MatchStatisticsExport): string {
  const lines = [
    CSV_HEADERS.map(escapeCsvField).join(','),
    ...exportData.rows.map((row) => HEADERS.map((header) => escapeCsvField(row[header])).join(',')),
  ];
  const section = (
    title: string,
    headers: string[],
    rows: Record<string, string | number | boolean>[],
  ): void => {
    lines.push(
      '',
      title,
      headers.join(','),
      ...rows.map((row) => headers.map((key) => escapeCsvField(row[key] ?? '')).join(',')),
    );
  };
  section(
    'EVENTOS',
    [
      'eventId',
      'sequence',
      'period',
      'gameTime',
      'gameClockMs',
      'eventType',
      'team',
      'playerId',
      'playerNumber',
      'playerName',
      'secondaryPlayerId',
      'secondaryPlayerNumber',
      'secondaryPlayerName',
      'description',
      'metadata',
      'createdAt',
      'undone',
    ],
    exportData.events,
  );
  section(
    'QUINTETOS',
    [
      'lineup',
      'playerIds',
      'players',
      'totalTime',
      'firstHalfTime',
      'secondHalfTime',
      'totalSeconds',
      'firstHalfSeconds',
      'secondHalfSeconds',
      'stints',
      'goalsFor',
      'goalsAgainst',
      'plusMinus',
    ],
    exportData.lineups,
  );
  return CSV_UTF8_BOM + lines.join('\r\n') + '\r\n';
}

export function createMatchCsvFilename(exportData: MatchStatisticsExport): string {
  const date = exportData.filenameDate || 'sin-fecha';
  const team = slug(exportData.team) || 'equipo';
  const opponent = slug(exportData.opponent) || 'rival';
  return `futsal-stats_${date}_${team}_vs_${opponent}.csv`;
}

export function escapeCsvField(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
