import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { buildMatchStatisticsExport } from '../domain/match-export';
import { serializeMatchCsv } from '../domain/match-csv';
import { InvalidCsvFormatError } from '../domain/match-import';
import { CsvMatchImportParser } from './csv-match-import-parser';

const players: Player[] = [
  { id: 'player-1', teamId: 'team-1', number: 7, name: 'Pérez, José', active: true },
  { id: 'player-2', teamId: 'team-1', number: 10, name: 'Álex Muñoz', active: true },
];
const match: Match = {
  id: 'match-source',
  teamId: 'team-1',
  homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
  awayTeam: { name: 'Rival FC', shortName: 'RIV' },
  date: '2026-09-13',
  description: 'Liga',
  status: 'finished',
  currentPeriod: 2,
  periodCount: 2,
  clock: { ...createMatchClock(), remainingMs: 0 },
  squadPlayerIds: players.map(({ id }) => id),
  startingLineupPlayerIds: ['player-1'],
  createdAt: 1,
  updatedAt: 2,
};
const events: MatchEvent[] = [
  {
    id: 'entered',
    matchId: match.id,
    type: 'PLAYER_ENTERED',
    playerId: 'player-1',
    period: 1,
    gameClockMs: 1_200_000,
    timestamp: 10,
    sequence: 1,
    undone: false,
  },
  {
    id: 'goal',
    matchId: match.id,
    type: 'GOAL_FOR',
    scorerPlayerId: 'player-1',
    lineupPlayerIds: ['player-1'],
    scoreBefore: { home: 0, away: 0 },
    scoreAfter: { home: 1, away: 0 },
    period: 1,
    gameClockMs: 900_000,
    timestamp: 20,
    sequence: 2,
    undone: false,
  },
  {
    id: 'finish',
    matchId: match.id,
    type: 'MATCH_FINISHED',
    period: 2,
    gameClockMs: 0,
    timestamp: 30,
    sequence: 3,
    undone: false,
  },
];

describe('CsvMatchImportParser', () => {
  const parser = new CsvMatchImportParser();

  it('round-trips the current exported format and preserves primary event data', async () => {
    const csv = serializeMatchCsv(buildMatchStatisticsExport(match, events, players));
    const result = await parser.parseText(csv, 'partido.csv');

    expect(result.schemaVersion).toBe('futsal-stats-csv/2');
    expect(result.match.statisticsSchemaVersion).toBeUndefined();
    expect(result.source.originalMatchId).toBe(match.id);
    expect(result.match).toMatchObject({
      opponent: 'Rival FC',
      abbreviation: 'RIV',
      date: '2026-09-13',
      description: 'Liga',
      homeScore: 1,
      awayScore: 0,
    });
    expect(result.players.map(({ name }) => name)).toEqual(['Pérez, José', 'Álex Muñoz']);
    expect(result.events.map(({ event }) => event)).toEqual(events);
    expect(result.issues.map(({ code }) => code)).toEqual(['missing-lineups']);
    expect(result.source.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('round-trips tracked shots, saves and received fouls', async () => {
    const tracked = { ...match, statisticsSchemaVersion: 2 as const };
    const extra: MatchEvent[] = [
      {
        ...events[0]!,
        id: 'shot',
        type: 'SHOT',
        playerId: 'player-1',
        outcome: 'on_target',
        sequence: 4,
      },
      { ...events[0]!, id: 'save', type: 'SAVE', playerId: 'player-2', sequence: 5 },
      {
        ...events[0]!,
        id: 'foul',
        type: 'FOUL',
        team: 'away',
        receivedByPlayerId: 'player-1',
        periodFoulNumber: 1,
        countsAsAccumulatedFoul: true,
        restart: 'direct-free-kick',
        sequence: 6,
      },
    ];
    const csv = serializeMatchCsv(
      buildMatchStatisticsExport(tracked, [...events, ...extra], players),
    );
    const result = await parser.parseText(csv, 'tracked.csv');
    expect(result.match.statisticsSchemaVersion).toBe(2);
    expect(result.events.slice(-3).map(({ event }) => event)).toEqual(extra);
  });

  it('produces the same fingerprint for the same semantic CSV', async () => {
    const csv = serializeMatchCsv(buildMatchStatisticsExport(match, events, players));
    const first = await parser.parseText(csv, 'first.csv');
    const second = await parser.parseText(csv, 'renamed.csv');
    expect(first.source.fingerprint).toBe(second.source.fingerprint);
  });

  it('rejects missing columns, broken quotes and duplicate event ids', async () => {
    await expect(parser.parseText('foo,bar\r\n1,2', 'bad.csv')).rejects.toBeInstanceOf(
      InvalidCsvFormatError,
    );
    await expect(
      parser.parseText('fecha,equipo,rival,dorsal,jugador,titular\r\n"broken', 'bad.csv'),
    ).rejects.toBeInstanceOf(InvalidCsvFormatError);

    const exported = buildMatchStatisticsExport(
      match,
      [...events, { ...events[2]!, sequence: 4 }],
      players,
    );
    await expect(parser.parseText(serializeMatchCsv(exported), 'duplicate.csv')).rejects.toThrow(
      'IDs de evento duplicados',
    );
  });

  it('accepts the historical unversioned export with explicit warnings', async () => {
    const csv =
      serializeMatchCsv(buildMatchStatisticsExport(match, events, players)).split(
        '\r\nMETADATOS',
      )[0]! + '\r\n';
    const result = await parser.parseText(csv, 'legacy.csv');
    expect(result.schemaVersion).toBeUndefined();
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['legacy-version', 'missing-description', 'missing-abbreviation']),
    );
  });
});
