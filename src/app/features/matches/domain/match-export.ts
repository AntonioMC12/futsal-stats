import { formatGameClock, projectRemaining } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { deriveMatchState } from '../../live-match/domain/derived-match-state';
import { deriveDisciplinaryState } from '../../live-match/domain/discipline';
import { deriveMatchStatistics } from '../../live-match/domain/match-statistics';

export interface PlayerMatchExportRow {
  date: string;
  team: string;
  opponent: string;
  matchStatus: string;
  period: number;
  clock: string;
  score: string;
  number: number | '';
  playerName: string;
  goals: number;
  playingTime: string;
  playingSeconds: number;
  goalsForOnCourt: number;
  goalsAgainstOnCourt: number;
  plusMinus: number;
  startingLineup: 'Sí' | 'No';
  onCourt: 'Sí' | 'No';
  timesEntered: number;
  fouls: number;
  yellowCards: number;
  secondYellowSendOffs: number;
  directRedCards: number;
  sendOffs: number;
  teamFouls: number;
  opponentFouls: number;
  teamYellowCards: number;
  opponentYellowCards: number;
  teamDirectRedCards: number;
  opponentDirectRedCards: number;
  teamSendOffs: number;
  opponentSendOffs: number;
}

export interface MatchStatisticsExport {
  filenameDate: string;
  team: string;
  opponent: string;
  rows: PlayerMatchExportRow[];
}

export function buildMatchStatisticsExport(
  match: Match,
  events: readonly MatchEvent[],
  players: readonly Player[],
  atEpochMs = Date.now(),
): MatchStatisticsExport {
  const state = deriveMatchState(match, events);
  const remainingMs = projectRemaining(match.clock, atEpochMs);
  const statistics = deriveMatchStatistics(match, events, remainingMs);
  const currentSegment =
    state.clockRunning && state.runningSegmentStartedAtGameClockMs !== null
      ? Math.max(0, state.runningSegmentStartedAtGameClockMs - remainingMs)
      : 0;
  const discipline = deriveDisciplinaryState(events, state.completedElapsedMs + currentSegment);
  const playersById = new Map(players.map((player) => [player.id, player]));
  const starters = new Set(match.startingLineupPlayerIds);
  const playersOnCourt = new Set(
    match.status === 'finished'
      ? []
      : match.status === 'ready'
        ? match.startingLineupPlayerIds
        : state.currentLineupPlayerIds,
  );
  const date = formatDisplayDate(match.date);
  const score = `${state.score.home}-${state.score.away}`;

  const rows = match.squadPlayerIds
    .map((playerId): PlayerMatchExportRow => {
      const player = playersById.get(playerId);
      const stats = statistics.players[playerId] ?? {
        playedMs: 0,
        entries: 0,
        percentage: 0,
        goals: 0,
        goalsForOnCourt: 0,
        goalsAgainstOnCourt: 0,
        plusMinus: 0,
        fouls: 0,
        yellowCards: 0,
        secondYellowSendOffs: 0,
        directRedCards: 0,
        sendOffs: 0,
      };
      return {
        date,
        team: match.homeTeam.name,
        opponent: match.awayTeam.name,
        matchStatus: formatMatchStatus(match.status),
        period: match.status === 'setup' || match.status === 'ready' ? 0 : match.currentPeriod,
        clock: formatGameClock(remainingMs),
        score,
        number: player?.number ?? '',
        playerName: player?.name ?? 'Jugador no disponible',
        goals: stats.goals,
        playingTime: formatGameClock(stats.playedMs),
        playingSeconds: Math.floor(stats.playedMs / 1_000),
        goalsForOnCourt: stats.goalsForOnCourt,
        goalsAgainstOnCourt: stats.goalsAgainstOnCourt,
        plusMinus: stats.plusMinus,
        startingLineup: starters.has(playerId) ? 'Sí' : 'No',
        onCourt: playersOnCourt.has(playerId) ? 'Sí' : 'No',
        timesEntered: stats.entries,
        fouls: stats.fouls,
        yellowCards: stats.yellowCards,
        secondYellowSendOffs: stats.secondYellowSendOffs,
        directRedCards: stats.directRedCards,
        sendOffs: stats.sendOffs,
        teamFouls: discipline.teams.home.fouls,
        opponentFouls: discipline.teams.away.fouls,
        teamYellowCards: discipline.teams.home.yellowCards,
        opponentYellowCards: discipline.teams.away.yellowCards,
        teamDirectRedCards: discipline.teams.home.directRedCards,
        opponentDirectRedCards: discipline.teams.away.directRedCards,
        teamSendOffs: discipline.teams.home.sendOffs,
        opponentSendOffs: discipline.teams.away.sendOffs,
      };
    })
    .sort(compareRows);

  return {
    filenameDate: formatFilenameDate(match.date),
    team: match.homeTeam.name,
    opponent: match.awayTeam.name,
    rows,
  };
}

function compareRows(left: PlayerMatchExportRow, right: PlayerMatchExportRow): number {
  const leftNumber = left.number === '' ? Number.POSITIVE_INFINITY : left.number;
  const rightNumber = right.number === '' ? Number.POSITIVE_INFINITY : right.number;
  return leftNumber - rightNumber || left.playerName.localeCompare(right.playerName);
}

function formatDisplayDate(timestamp: number): string {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatFilenameDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMatchStatus(status: Match['status']): string {
  switch (status) {
    case 'setup':
      return 'Configuración';
    case 'ready':
      return 'Preparado';
    case 'firstHalf':
      return 'Primera parte';
    case 'halftime':
      return 'Descanso';
    case 'secondHalf':
      return 'Segunda parte';
    case 'finished':
      return 'Finalizado';
  }
}
