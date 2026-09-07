import { lineupId } from '../../../core/utils/lineup-id';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { selectActiveEvents } from './derived-match-state';

export interface PlayerPlayingTime {
  playedMs: number;
  firstHalfMs: number;
  secondHalfMs: number;
  entries: number;
  percentage: number;
}

export type PlayerPlayingTimes = Readonly<Record<string, PlayerPlayingTime>>;

export interface LineupPlayingTime {
  id: string;
  playerIds: string[];
  playedMs: number;
  firstHalfMs: number;
  secondHalfMs: number;
  stints: number;
}

export interface PlayerCourtStint {
  id: string;
  period: number;
  startGameClockMs: number;
  endGameClockMs: number | null;
  durationMs: number;
  open: boolean;
}

export interface Participation {
  players: PlayerPlayingTimes;
  lineups: LineupPlayingTime[];
  playerStints: Readonly<Record<string, readonly PlayerCourtStint[]>>;
}
export function derivePlayerPlayingTimes(
  match: Match,
  events: readonly MatchEvent[],
  currentRemainingMs: number,
): PlayerPlayingTimes {
  return deriveParticipation(match, events, currentRemainingMs).players;
}
export function deriveParticipation(
  match: Match,
  events: readonly MatchEvent[],
  currentRemainingMs: number,
): Participation {
  return createParticipationProjection(match, events)(currentRemainingMs);
}

// Replay only when the match/events change; projecting a clock tick never replays events.
export function createParticipationProjection(
  match: Match,
  events: readonly MatchEvent[],
): (currentRemainingMs: number) => Participation {
  const times: Record<string, PlayerPlayingTime> = Object.fromEntries(
    match.squadPlayerIds.map((playerId) => [
      playerId,
      { playedMs: 0, firstHalfMs: 0, secondHalfMs: 0, entries: 0, percentage: 0 },
    ]),
  );
  const lineup = new Set<string>();
  let clockRunning = false;
  let segmentRemainingMs: number | null = null;
  let matchElapsedMs = 0;
  let period = 1;
  let periodOpen = true;
  let activeStint: string | null = null;
  const playerStints: Record<string, PlayerCourtStint[]> = {};
  const openStints = new Map<string, PlayerCourtStint>();
  const enter = (playerId: string, event: MatchEvent): void => {
    if (!periodOpen || openStints.has(playerId)) return;
    const stint: PlayerCourtStint = {
      id: `${event.id}:${playerId}`,
      period,
      startGameClockMs: event.gameClockMs,
      endGameClockMs: null,
      durationMs: 0,
      open: true,
    };
    (playerStints[playerId] ??= []).push(stint);
    openStints.set(playerId, stint);
  };
  const leave = (playerId: string, remainingMs: number): void => {
    const stint = openStints.get(playerId);
    if (!stint) return;
    stint.open = false;
    stint.endGameClockMs = remainingMs;
    openStints.delete(playerId);
  };
  const lineups = new Map<string, LineupPlayingTime>();
  const observeLineup = (): LineupPlayingTime | undefined => {
    if (!periodOpen || lineup.size < 3 || lineup.size > 5) return undefined;
    const id = lineupId([...lineup]);
    let time = lineups.get(id);
    if (!time) {
      time = {
        id,
        playerIds: [...lineup].sort(),
        playedMs: 0,
        firstHalfMs: 0,
        secondHalfMs: 0,
        stints: 0,
      };
      lineups.set(id, time);
    }
    if (activeStint !== id) time.stints += 1;
    activeStint = id;
    return time;
  };
  const addTime = (
    time: { playedMs: number; firstHalfMs: number; secondHalfMs: number },
    elapsedMs: number,
  ): void => {
    time.playedMs += elapsedMs;
    if (period === 1) time.firstHalfMs += elapsedMs;
    if (period === 2) time.secondHalfMs += elapsedMs;
  };

  const accumulateUntil = (remainingMs: number): void => {
    if (!clockRunning || segmentRemainingMs === null) {
      return;
    }
    const elapsedMs = Math.max(0, segmentRemainingMs - remainingMs);
    matchElapsedMs += elapsedMs;
    const lineupTime = observeLineup();
    if (lineupTime) addTime(lineupTime, elapsedMs);
    for (const playerId of lineup) {
      const time = ensurePlayer(times, playerId);
      addTime(time, elapsedMs);
      const stint = openStints.get(playerId);
      if (stint) stint.durationMs += elapsedMs;
    }
    segmentRemainingMs = remainingMs;
  };

  for (const event of selectActiveEvents(events)) {
    switch (event.type) {
      case 'CLOCK_STARTED':
        periodOpen = true;
        period = event.period;
        for (const playerId of lineup) enter(playerId, event);
        observeLineup();
        clockRunning = true;
        segmentRemainingMs = event.gameClockMs;
        break;
      case 'CLOCK_STOPPED':
      case 'PERIOD_ENDED':
        accumulateUntil(event.gameClockMs);
        if (event.type === 'PERIOD_ENDED') {
          for (const playerId of lineup) leave(playerId, event.gameClockMs);
        }
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
          enter(event.playerId, event);
        }
        break;
      case 'PLAYER_LEFT':
        accumulateUntil(event.gameClockMs);
        leave(event.playerId, event.gameClockMs);
        lineup.delete(event.playerId);
        break;
      case 'SUBSTITUTION':
        accumulateUntil(event.gameClockMs);
        leave(event.outPlayerId, event.gameClockMs);
        lineup.delete(event.outPlayerId);
        if (!lineup.has(event.inPlayerId)) {
          lineup.add(event.inPlayerId);
          ensurePlayer(times, event.inPlayerId).entries += 1;
          enter(event.inPlayerId, event);
        }
        break;
      case 'FOUL':
        if (
          event.team === 'home' &&
          event.playerId &&
          (event.disciplinaryAction === 'secondYellow' || event.disciplinaryAction === 'directRed')
        ) {
          accumulateUntil(event.gameClockMs);
          leave(event.playerId, event.gameClockMs);
          lineup.delete(event.playerId);
        }
        break;
      case 'BENCH_DISCIPLINE':
        break;
      case 'RED_CARD_REPLACEMENT':
        if (event.team === 'home' && event.playerId) {
          accumulateUntil(event.gameClockMs);
          if (!lineup.has(event.playerId)) {
            lineup.add(event.playerId);
            ensurePlayer(times, event.playerId).entries += 1;
            enter(event.playerId, event);
          }
        }
        break;
      case 'MATCH_FINISHED':
        accumulateUntil(event.gameClockMs);
        for (const playerId of lineup) leave(playerId, event.gameClockMs);
        clockRunning = false;
        segmentRemainingMs = null;
        break;
      case 'MATCH_STARTED':
      case 'PERIOD_STARTED':
        // Legacy histories may omit PERIOD_ENDED. Never carry an open stint across halves.
        for (const playerId of lineup) leave(playerId, segmentRemainingMs ?? 0);
        clockRunning = false;
        segmentRemainingMs = null;
        periodOpen = true;
        period = event.period;
        for (const playerId of lineup) enter(playerId, event);
        activeStint = null;
        break;
      case 'GOAL_FOR':
      case 'GOAL_AGAINST':
      case 'EVENT_UNDONE':
        break;
    }
    if (event.type === 'PERIOD_ENDED' || event.type === 'MATCH_FINISHED') periodOpen = false;
    // A substitution is atomic, even while the clock is stopped.
    if (
      event.type === 'SUBSTITUTION' ||
      event.type === 'RED_CARD_REPLACEMENT' ||
      (event.type === 'PLAYER_ENTERED' && lineup.size === 5)
    )
      observeLineup();
    if (
      event.type === 'PERIOD_ENDED' ||
      event.type === 'MATCH_FINISHED' ||
      event.type === 'PLAYER_LEFT' ||
      (event.type === 'FOUL' &&
        event.team === 'home' &&
        (event.disciplinaryAction === 'directRed' || event.disciplinaryAction === 'secondYellow'))
    )
      activeStint = null;
  }

  // A paused clock retains open participation stints, but adds no playing time.
  if (clockRunning) observeLineup();
  return (currentRemainingMs) => {
    const delta =
      clockRunning && segmentRemainingMs !== null
        ? Math.max(0, segmentRemainingMs - currentRemainingMs)
        : 0;
    const elapsedMs = matchElapsedMs + delta;
    const players = Object.fromEntries(
      Object.entries(times).map(([id, time]) => {
        const projected = { ...time };
        if (lineup.has(id)) addTime(projected, delta);
        projected.percentage = elapsedMs === 0 ? 0 : (projected.playedMs / elapsedMs) * 100;
        return [id, projected];
      }),
    );
    return {
      players,
      lineups: [...lineups.values()]
        .map((time) => {
          const projected = { ...time };
          if (time.id === activeStint) addTime(projected, delta);
          return projected;
        })
        .sort((a, b) => b.playedMs - a.playedMs),
      playerStints: Object.fromEntries(
        Object.entries(playerStints).map(([id, stints]) => {
          const open = openStints.get(id);
          return [
            id,
            open && delta > 0
              ? [...stints.slice(0, -1), { ...open, durationMs: open.durationMs + delta }]
              : stints,
          ];
        }),
      ),
    };
  };
}

function ensurePlayer(
  times: Record<string, PlayerPlayingTime>,
  playerId: string,
): PlayerPlayingTime {
  return (times[playerId] ??= {
    playedMs: 0,
    firstHalfMs: 0,
    secondHalfMs: 0,
    entries: 0,
    percentage: 0,
  });
}
