import { eventLabel } from '../../live-match/domain/match-timeline';
import { formatGameClock, projectRemaining } from '../../../core/clock/match-clock';
import {
  Match,
  MatchDate,
  localDateString,
  matchDateTimestamp,
} from '../../../shared/models/match';
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
  firstHalfTime: string;
  secondHalfTime: string;
  firstHalfSeconds: number;
  secondHalfSeconds: number;
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
  events: Record<string, string | number | boolean>[];
  lineups: Record<string, string | number | boolean>[];
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
        firstHalfMs: 0,
        secondHalfMs: 0,
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
        firstHalfTime: formatGameClock(stats.firstHalfMs),
        secondHalfTime: formatGameClock(stats.secondHalfMs),
        firstHalfSeconds: stats.firstHalfMs / 1_000,
        secondHalfSeconds: stats.secondHalfMs / 1_000,
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
    events: [...events]
      .sort((a, b) => a.sequence - b.sequence || a.timestamp - b.timestamp)
      .map((event) => {
        const playerId =
          event.type === 'SUBSTITUTION'
            ? event.outPlayerId
            : event.type === 'GOAL_FOR'
              ? event.scorerPlayerId
              : 'playerId' in event
                ? event.playerId
                : undefined;
        const secondaryPlayerId = event.type === 'SUBSTITUTION' ? event.inPlayerId : undefined;
        const player = playerId ? playersById.get(playerId) : undefined;
        const secondary = secondaryPlayerId ? playersById.get(secondaryPlayerId) : undefined;
        return {
          eventId: event.id,
          sequence: event.sequence,
          period: event.period,
          gameTime: formatGameClock(event.gameClockMs),
          gameClockMs: event.gameClockMs,
          eventType: event.type,
          team:
            'team' in event
              ? event.team
              : event.type === 'GOAL_AGAINST'
                ? 'away'
                : playerId || event.type === 'GOAL_FOR'
                  ? 'home'
                  : '',
          playerId: playerId ?? '',
          playerNumber:
            player?.number ??
            ('opponentPlayerNumber' in event ? (event.opponentPlayerNumber ?? '') : ''),
          playerName: player?.name ?? '',
          secondaryPlayerId: secondaryPlayerId ?? '',
          secondaryPlayerNumber: secondary?.number ?? '',
          secondaryPlayerName: secondary?.name ?? '',
          description: eventLabel(
            event,
            Object.fromEntries(players.map((p) => [p.id, p.name])),
            Object.fromEntries(players.map((p) => [p.id, p.number])),
            discipline.goalReleaseEventIds.has(event.id),
          ),
          metadata: JSON.stringify(event),
          createdAt: event.timestamp,
          undone: event.undone || !state.activeEvents.some((active) => active.id === event.id),
        };
      }),
    lineups: statistics.lineups.map((lineup, index) => ({
      lineup: index + 1,
      playerIds: lineup.playerIds.join('|'),
      players: lineup.playerIds
        .map((id) => {
          const player = playersById.get(id);
          return player ? '#' + player.number + ' ' + player.name : id;
        })
        .join(' | '),
      totalTime: formatGameClock(lineup.playedMs),
      firstHalfTime: formatGameClock(lineup.firstHalfMs),
      secondHalfTime: formatGameClock(lineup.secondHalfMs),
      totalSeconds: lineup.playedMs / 1000,
      firstHalfSeconds: lineup.firstHalfMs / 1000,
      secondHalfSeconds: lineup.secondHalfMs / 1000,
      stints: lineup.stints,
      goalsFor: lineup.goalsFor,
      goalsAgainst: lineup.goalsAgainst,
      plusMinus: lineup.plusMinus,
    })),
  };
}

function compareRows(left: PlayerMatchExportRow, right: PlayerMatchExportRow): number {
  const leftNumber = left.number === '' ? Number.POSITIVE_INFINITY : left.number;
  const rightNumber = right.number === '' ? Number.POSITIVE_INFINITY : right.number;
  return leftNumber - rightNumber || left.playerName.localeCompare(right.playerName);
}

function formatDisplayDate(value: MatchDate): string {
  const timestamp = matchDateTimestamp(value);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatFilenameDate(value: MatchDate): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = matchDateTimestamp(value);
  if (!timestamp) return 'unknown-date';
  const date = new Date(timestamp);
  return localDateString(date);
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
