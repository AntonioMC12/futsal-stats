import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { createMatchCsvFilename, CSV_UTF8_BOM, serializeMatchCsv } from './match-csv';
import { buildMatchStatisticsExport } from './match-export';

const players: Player[] = [
  { id: 'p1', teamId: 'team-1', number: 7, name: 'Pérez, José', active: true },
  { id: 'p2', teamId: 'team-1', number: 2, name: 'José "Pepe" García', active: true },
  { id: 'p3', teamId: 'team-1', number: 4, name: 'Álex Muñoz', active: true },
  { id: 'p4', teamId: 'team-1', number: 1, name: 'Iñaki', active: true },
  { id: 'p5', teamId: 'team-1', number: 12, name: 'Portera', active: true },
  { id: 'p6', teamId: 'team-1', number: 20, name: 'Sin minutos', active: true },
];

function finishedMatch(status: Match['status'] = 'finished'): Match {
  const clock = createMatchClock();
  return {
    id: 'match-1',
    homeTeam: { id: 'team-1', name: 'Fútsal Team', shortName: 'FUT' },
    awayTeam: { name: 'Rival FC', shortName: 'RIV' },
    date: new Date(2026, 7, 28, 12).getTime(),
    status,
    currentPeriod: 2,
    periodCount: 2,
    clock: { ...clock, remainingMs: 0 },
    squadPlayerIds: players.map((player) => player.id),
    startingLineupPlayerIds: players.slice(0, 5).map((player) => player.id),
    createdAt: 1,
    updatedAt: 2,
  };
}

function events(): MatchEvent[] {
  const lineup = players.slice(0, 5).map((player) => player.id);
  const base = (id: string, sequence: number, gameClockMs: number) => ({
    id,
    matchId: 'match-1',
    period: 1,
    gameClockMs,
    timestamp: sequence,
    sequence,
    undone: false,
  });
  const goals: MatchEvent[] = [
    ...Array.from({ length: 4 }, (_, index): MatchEvent => ({
      ...base(`for-${index}`, 7 + index, 900_000 - index),
      type: 'GOAL_FOR',
      ...(index < 2 ? { scorerPlayerId: 'p1' } : index === 2 ? { scorerPlayerId: 'p3' } : {}),
      lineupPlayerIds: lineup,
      scoreBefore: { home: index, away: 0 },
      scoreAfter: { home: index + 1, away: 0 },
    })),
    ...Array.from({ length: 2 }, (_, index): MatchEvent => ({
      ...base(`against-${index}`, 11 + index, 800_000 - index),
      type: 'GOAL_AGAINST',
      lineupPlayerIds: lineup,
      scoreBefore: { home: 4, away: index },
      scoreAfter: { home: 4, away: index + 1 },
    })),
  ];
  return [
    ...lineup.map((playerId, index): MatchEvent => ({
      ...base(`entered-${playerId}`, index + 1, 1_200_000),
      type: 'PLAYER_ENTERED',
      playerId,
    })),
    { ...base('start', 6, 1_200_000), type: 'CLOCK_STARTED' },
    ...goals,
    { ...base('stop', 13, 0), type: 'CLOCK_STOPPED' },
    { ...base('finished', 14, 0), type: 'MATCH_FINISHED' },
  ];
}

describe('match statistics CSV', () => {
  it('projects existing statistics and includes zero-minute players in shirt-number order', () => {
    const result = buildMatchStatisticsExport(finishedMatch(), events(), players);

    expect(result.rows.map((row) => row.number)).toEqual([1, 2, 4, 7, 12, 20]);
    expect(result.rows.find((row) => row.number === 7)).toMatchObject({
      date: '28/08/2026',
      team: 'Fútsal Team',
      opponent: 'Rival FC',
      matchStatus: 'Finalizado',
      period: 2,
      clock: '00:00',
      score: '4-2',
      goals: 2,
      playingTime: '20:00',
      playingSeconds: 1_200,
      goalsForOnCourt: 4,
      goalsAgainstOnCourt: 2,
      plusMinus: 2,
      timesEntered: 1,
      startingLineup: 'Sí',
      onCourt: 'No',
    });
    expect(result.rows.find((row) => row.number === 20)).toMatchObject({
      playingTime: '00:00',
      goals: 0,
      playingSeconds: 0,
      goalsForOnCourt: 0,
      goalsAgainstOnCourt: 0,
      plusMinus: 0,
      timesEntered: 0,
      startingLineup: 'No',
      onCourt: 'No',
    });
  });

  it('serializes RFC-style escaping, UTF-8 characters and a BOM for Excel', () => {
    const result = buildMatchStatisticsExport(finishedMatch(), events(), players);
    const csv = serializeMatchCsv(result);

    expect(csv.startsWith(CSV_UTF8_BOM)).toBe(true);
    expect(csv).toContain(
      'fecha,equipo,rival,estado_partido,periodo,reloj,marcador,dorsal,jugador,' +
        'goles,tiempo_jugado,segundos_jugados,goles_favor_en_pista,goles_contra_en_pista,' +
        'diferencia_goles,titular,en_pista,entradas_en_pista',
    );
    expect(csv).not.toContain('match_id');
    expect(csv).not.toContain('player_id');
    expect(csv).not.toContain('match-1');
    expect(csv).not.toContain('team-1');
    expect(csv).not.toContain(',p1,');
    expect(csv).toContain(
      'entradas_en_pista,faltas,amarillas,segunda_amarilla,rojas_directas,expulsiones,' +
        'faltas_equipo,faltas_rival,amarillas_equipo,amarillas_rival,' +
        'rojas_directas_equipo,rojas_directas_rival,expulsiones_equipo,expulsiones_rival',
    );
    expect(csv).toContain('"Pérez, José"');
    expect(csv).toContain('"José ""Pepe"" García"');
    expect(csv).toContain('Álex Muñoz');
    expect(csv).toContain('Iñaki');
    expect(csv).toContain(',Sin minutos,0,00:00,0,0,0,0,No,No,0');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('exports player and team disciplinary statistics without technical ids', () => {
    const disciplinaryEvents: MatchEvent[] = [
      ...events().filter((event) => event.type !== 'MATCH_FINISHED'),
      {
        id: 'yellow',
        matchId: 'match-1',
        type: 'FOUL',
        team: 'home',
        playerId: 'p1',
        accumulated: true,
        disciplinaryAction: 'yellow',
        periodFoulNumber: 1,
        period: 2,
        gameClockMs: 100,
        matchElapsedMs: 1_200_000,
        timestamp: 14,
        sequence: 14,
        undone: false,
      },
      {
        id: 'rival-red',
        matchId: 'match-1',
        type: 'FOUL',
        team: 'away',
        accumulated: true,
        disciplinaryAction: 'directRed',
        periodFoulNumber: 1,
        period: 2,
        gameClockMs: 100,
        matchElapsedMs: 1_200_000,
        timestamp: 15,
        sequence: 15,
        undone: false,
      },
    ];
    const snapshot = buildMatchStatisticsExport(finishedMatch(), disciplinaryEvents, players);
    const player = snapshot.rows.find((row) => row.number === 7);

    expect(player).toMatchObject({
      fouls: 1,
      yellowCards: 1,
      secondYellowSendOffs: 0,
      directRedCards: 0,
      sendOffs: 0,
      teamFouls: 1,
      opponentFouls: 1,
      teamYellowCards: 1,
      opponentSendOffs: 1,
      opponentDirectRedCards: 1,
    });
    const csv = serializeMatchCsv(snapshot);
    expect(csv).not.toContain('yellow');
    expect(csv).not.toContain('rival-red');
  });

  it('creates a descriptive sanitized filename', () => {
    const result = buildMatchStatisticsExport(finishedMatch(), events(), players);
    expect(createMatchCsvFilename(result)).toBe(
      'futsal-stats_2026-08-28_futsal-team_vs_rival-fc.csv',
    );
  });

  it.each<[Match['status'], string]>([
    ['setup', 'Configuración'],
    ['ready', 'Preparado'],
    ['firstHalf', 'Primera parte'],
    ['halftime', 'Descanso'],
    ['secondHalf', 'Segunda parte'],
    ['finished', 'Finalizado'],
  ])('creates a human-readable snapshot while the match is in %s', (status, label) => {
    const snapshot = buildMatchStatisticsExport(finishedMatch(status), events(), players);
    expect(snapshot.rows).toHaveLength(players.length);
    expect(snapshot.rows.every((row) => row.matchStatus === label)).toBe(true);
  });

  it('projects elapsed playing time without stopping a running clock', () => {
    const runningMatch = {
      ...finishedMatch('firstHalf'),
      currentPeriod: 1,
      squadPlayerIds: ['p1'],
      startingLineupPlayerIds: ['p1'],
      clock: {
        ...createMatchClock(),
        running: true,
        startedAtEpochMs: 10_000,
      },
    } satisfies Match;
    const runningEvents: MatchEvent[] = [
      {
        id: 'entered-p1',
        matchId: runningMatch.id,
        type: 'PLAYER_ENTERED',
        playerId: 'p1',
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
      },
      {
        id: 'start',
        matchId: runningMatch.id,
        type: 'CLOCK_STARTED',
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: 2,
        sequence: 2,
        undone: false,
      },
    ];

    const snapshot = buildMatchStatisticsExport(runningMatch, runningEvents, [players[0]!], 70_000);

    expect(snapshot.rows[0]).toMatchObject({
      matchStatus: 'Primera parte',
      period: 1,
      clock: '19:00',
      playingTime: '01:00',
      playingSeconds: 60,
      onCourt: 'Sí',
    });
    expect(runningMatch.clock.running).toBe(true);
    expect(runningEvents).toHaveLength(2);
  });

  it('uses human-readable states and the selected lineup before kickoff', () => {
    const ready = {
      ...finishedMatch('ready'),
      currentPeriod: 1,
      clock: createMatchClock(),
    };
    const snapshot = buildMatchStatisticsExport(ready, [], players, 10_000);

    expect(snapshot.rows[0]).toMatchObject({
      matchStatus: 'Preparado',
      period: 0,
      clock: '20:00',
      onCourt: 'Sí',
    });
    expect(snapshot.rows.at(-1)).toMatchObject({ onCourt: 'No' });
  });
});
