import { lineupId } from '../../../core/utils/lineup-id';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { deriveMatchState, selectActiveEvents } from './derived-match-state';
import { deriveDisciplinaryState } from './discipline';
import { derivePlayerPlayingTimes, PlayerPlayingTime } from './player-playing-time';

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

export interface LineupStatistics {
  id: string;
  playerIds: string[];
  playedMs: number;
  goalsFor: number;
  goalsAgainst: number;
  plusMinus: number;
}

export interface MatchStatistics {
  players: Readonly<Record<string, PlayerMatchStatistics>>;
  lineups: LineupStatistics[];
}

export function deriveMatchStatistics(
  match: Match,
  events: readonly MatchEvent[],
  currentRemainingMs: number,
): MatchStatistics {
  const playingTimes = derivePlayerPlayingTimes(match, events, currentRemainingMs);
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
  const lineups = new Map<string, LineupStatistics>();
  const currentLineup = new Set<string>();
  let clockRunning = false;
  let segmentRemainingMs: number | null = null;

  const ensureLineup = (playerIds: readonly string[]): LineupStatistics | null => {
    if (
      playerIds.length < 3 ||
      playerIds.length > 5 ||
      new Set(playerIds).size !== playerIds.length
    ) {
      return null;
    }
    const id = lineupId(playerIds);
    const existing = lineups.get(id);
    if (existing) {
      return existing;
    }
    const created: LineupStatistics = {
      id,
      playerIds: [...playerIds].sort(),
      playedMs: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      plusMinus: 0,
    };
    lineups.set(id, created);
    return created;
  };

  const accumulateUntil = (remainingMs: number): void => {
    if (!clockRunning || segmentRemainingMs === null) {
      return;
    }
    const elapsedMs = Math.max(0, segmentRemainingMs - remainingMs);
    const lineup = ensureLineup([...currentLineup]);
    if (lineup) {
      lineup.playedMs += elapsedMs;
    }
    segmentRemainingMs = remainingMs;
  };

  for (const event of selectActiveEvents(events)) {
    switch (event.type) {
      case 'CLOCK_STARTED':
        clockRunning = true;
        segmentRemainingMs = event.gameClockMs;
        break;
      case 'CLOCK_STOPPED':
      case 'PERIOD_ENDED':
        accumulateUntil(event.gameClockMs);
        clockRunning = false;
        segmentRemainingMs = null;
        break;
      case 'CLOCK_RESET':
        clockRunning = false;
        segmentRemainingMs = null;
        break;
      case 'PLAYER_ENTERED':
        accumulateUntil(event.gameClockMs);
        currentLineup.add(event.playerId);
        break;
      case 'PLAYER_LEFT':
        accumulateUntil(event.gameClockMs);
        currentLineup.delete(event.playerId);
        break;
      case 'SUBSTITUTION':
        accumulateUntil(event.gameClockMs);
        currentLineup.delete(event.outPlayerId);
        currentLineup.add(event.inPlayerId);
        break;
      case 'FOUL':
        if (
          event.team === 'home' &&
          event.playerId &&
          (event.disciplinaryAction === 'secondYellow' || event.disciplinaryAction === 'directRed')
        ) {
          accumulateUntil(event.gameClockMs);
          currentLineup.delete(event.playerId);
        }
        break;
      case 'RED_CARD_REPLACEMENT':
        if (event.team === 'home' && event.playerId) {
          accumulateUntil(event.gameClockMs);
          currentLineup.add(event.playerId);
        }
        break;
      case 'GOAL_FOR':
        addGoal(players, ensureLineup(event.lineupPlayerIds), event.lineupPlayerIds, 'for');
        if (event.scorerPlayerId && players[event.scorerPlayerId]) {
          players[event.scorerPlayerId].goals += 1;
        }
        break;
      case 'GOAL_AGAINST':
        addGoal(players, ensureLineup(event.lineupPlayerIds), event.lineupPlayerIds, 'against');
        break;
      case 'MATCH_FINISHED':
        accumulateUntil(event.gameClockMs);
        clockRunning = false;
        segmentRemainingMs = null;
        break;
      case 'MATCH_STARTED':
      case 'PERIOD_STARTED':
      case 'EVENT_UNDONE':
        break;
    }
  }

  accumulateUntil(currentRemainingMs);
  const state = deriveMatchState(match, events);
  const currentSegment =
    state.clockRunning && state.runningSegmentStartedAtGameClockMs !== null
      ? Math.max(0, state.runningSegmentStartedAtGameClockMs - currentRemainingMs)
      : 0;
  const discipline = deriveDisciplinaryState(events, state.completedElapsedMs + currentSegment);
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

  return {
    players,
    lineups: [...lineups.values()].sort(
      (left, right) => right.playedMs - left.playedMs || left.id.localeCompare(right.id),
    ),
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
