import { lineupId } from '../../../core/utils/lineup-id';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { selectActiveEvents } from './derived-match-state';
import { deriveDisciplinaryState } from './discipline';
import {
  createParticipationProjection,
  PlayerPlayingTime,
  LineupPlayingTime,
  PlayerCourtStint,
} from './player-playing-time';

export interface PlayerMatchStatistics extends PlayerPlayingTime {
  goals: number;
  goalsForOnCourt: number;
  goalsAgainstOnCourt: number;
  plusMinus: number;
  fouls: number;
  yellowCards: number;
  secondYellowSendOffs: number;
  directRedCards: number;
  sendOffs: number;
}

export interface LineupStatistics extends LineupPlayingTime {
  goalsFor: number;
  goalsAgainst: number;
  plusMinus: number;
}

export interface MatchStatistics {
  players: Readonly<Record<string, PlayerMatchStatistics>>;
  lineups: LineupStatistics[];
  playerStints: Readonly<Record<string, readonly PlayerCourtStint[]>>;
}

export function deriveMatchStatistics(
  match: Match,
  events: readonly MatchEvent[],
  currentRemainingMs: number,
): MatchStatistics {
  return createMatchStatisticsProjection(match, events)(currentRemainingMs);
}

export function createMatchStatisticsProjection(
  match: Match,
  events: readonly MatchEvent[],
): (remainingMs: number) => MatchStatistics {
  const projectParticipation = createParticipationProjection(match, events);
  // Exclude the live segment here; only its time projection changes on a clock tick.
  const participation = projectParticipation(Number.POSITIVE_INFINITY);
  const playingTimes = participation.players;
  const players: Record<string, PlayerMatchStatistics> = Object.fromEntries(
    Object.entries(playingTimes).map(([playerId, time]) => [
      playerId,
      {
        ...time,
        goals: 0,
        goalsForOnCourt: 0,
        goalsAgainstOnCourt: 0,
        plusMinus: 0,
        fouls: 0,
        yellowCards: 0,
        secondYellowSendOffs: 0,
        directRedCards: 0,
        sendOffs: 0,
      },
    ]),
  );
  const lineups = new Map<string, LineupStatistics>(
    participation.lineups.map((time) => [
      time.id,
      {
        ...time,
        goalsFor: 0,
        goalsAgainst: 0,
        plusMinus: 0,
      },
    ]),
  );
  for (const event of selectActiveEvents(events)) {
    if (event.type === 'GOAL_FOR' || event.type === 'GOAL_AGAINST') {
      addGoal(
        players,
        lineups.get(lineupId(event.lineupPlayerIds)) ?? null,
        event.lineupPlayerIds,
        event.type === 'GOAL_FOR' ? 'for' : 'against',
      );
      if (event.type === 'GOAL_FOR' && event.scorerPlayerId && players[event.scorerPlayerId]) {
        players[event.scorerPlayerId].goals += 1;
      }
    }
  }
  const discipline = deriveDisciplinaryState(events, 0);
  for (const player of Object.values(players)) {
    player.plusMinus = player.goalsForOnCourt - player.goalsAgainstOnCourt;
  }
  for (const [playerId, disciplinary] of Object.entries(discipline.players)) {
    const player = players[playerId];
    if (player) Object.assign(player, disciplinary);
  }
  for (const lineup of lineups.values()) {
    lineup.plusMinus = lineup.goalsFor - lineup.goalsAgainst;
  }

  return (remainingMs) => {
    const projected = projectParticipation(remainingMs);
    return {
      players: Object.fromEntries(
        Object.entries(projected.players).map(([id, time]) => [id, { ...players[id], ...time }]),
      ),
      lineups: projected.lineups.map((time) => ({ ...lineups.get(time.id)!, ...time })),
      playerStints: projected.playerStints,
    };
  };
}

function addGoal(
  players: Record<string, PlayerMatchStatistics>,
  lineup: LineupStatistics | null,
  playerIds: readonly string[],
  side: 'for' | 'against',
): void {
  for (const playerId of playerIds) {
    const player = players[playerId];
    if (!player) {
      continue;
    }
    if (side === 'for') {
      player.goalsForOnCourt += 1;
    } else {
      player.goalsAgainstOnCourt += 1;
    }
  }
  if (!lineup) {
    return;
  }
  if (side === 'for') {
    lineup.goalsFor += 1;
  } else {
    lineup.goalsAgainst += 1;
  }
}
