import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { selectActiveEvents } from './derived-match-state';

export interface PlayerPlayingTime {
  playedMs: number;
  entries: number;
  percentage: number;
}

export type PlayerPlayingTimes = Readonly<Record<string, PlayerPlayingTime>>;

export function derivePlayerPlayingTimes(
  match: Match,
  events: readonly MatchEvent[],
  currentRemainingMs: number,
): PlayerPlayingTimes {
  const times: Record<string, PlayerPlayingTime> = Object.fromEntries(
    match.squadPlayerIds.map((playerId) => [playerId, { playedMs: 0, entries: 0, percentage: 0 }]),
  );
  const lineup = new Set<string>();
  let clockRunning = false;
  let segmentRemainingMs: number | null = null;
  let matchElapsedMs = 0;

  const accumulateUntil = (remainingMs: number): void => {
    if (!clockRunning || segmentRemainingMs === null) {
      return;
    }
    const elapsedMs = Math.max(0, segmentRemainingMs - remainingMs);
    matchElapsedMs += elapsedMs;
    for (const playerId of lineup) {
      const time = ensurePlayer(times, playerId);
      time.playedMs += elapsedMs;
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
        if (!lineup.has(event.playerId)) {
          lineup.add(event.playerId);
          ensurePlayer(times, event.playerId).entries += 1;
        }
        break;
      case 'PLAYER_LEFT':
        accumulateUntil(event.gameClockMs);
        lineup.delete(event.playerId);
        break;
      case 'SUBSTITUTION':
        accumulateUntil(event.gameClockMs);
        lineup.delete(event.outPlayerId);
        if (!lineup.has(event.inPlayerId)) {
          lineup.add(event.inPlayerId);
          ensurePlayer(times, event.inPlayerId).entries += 1;
        }
        break;
      case 'MATCH_FINISHED':
        accumulateUntil(event.gameClockMs);
        clockRunning = false;
        segmentRemainingMs = null;
        break;
      case 'MATCH_STARTED':
      case 'PERIOD_STARTED':
      case 'FOUL':
      case 'GOAL_FOR':
      case 'GOAL_AGAINST':
      case 'EVENT_UNDONE':
        break;
    }
  }

  accumulateUntil(currentRemainingMs);
  for (const time of Object.values(times)) {
    time.percentage = matchElapsedMs === 0 ? 0 : (time.playedMs / matchElapsedMs) * 100;
  }
  return times;
}

function ensurePlayer(
  times: Record<string, PlayerPlayingTime>,
  playerId: string,
): PlayerPlayingTime {
  return (times[playerId] ??= { playedMs: 0, entries: 0, percentage: 0 });
}
