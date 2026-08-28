import { Match } from '../../../shared/models/match';
import { MatchEvent, ScoreSnapshot } from '../../../shared/models/match-event';
import { MatchStatus } from '../../../shared/models/match';

export interface PeriodFouls {
  home: number;
  away: number;
}

export interface DerivedMatchState {
  status: MatchStatus;
  currentPeriod: number;
  clockRunning: boolean;
  score: ScoreSnapshot;
  currentLineupPlayerIds: string[];
  foulsByPeriod: Readonly<Record<number, PeriodFouls>>;
  completedElapsedMs: number;
  runningSegmentStartedAtGameClockMs: number | null;
  activeEvents: MatchEvent[];
}

export function deriveMatchState(match: Match, events: readonly MatchEvent[]): DerivedMatchState {
  const activeEvents = selectActiveEvents(events);
  const lineup = new Set<string>();
  const foulsByPeriod: Record<number, PeriodFouls> = {};
  let status: MatchStatus = 'ready';
  let currentPeriod = 1;
  let clockRunning = false;
  let score: ScoreSnapshot = { home: 0, away: 0 };
  let completedElapsedMs = 0;
  let runningSegmentStartedAtGameClockMs: number | null = null;

  for (const event of activeEvents) {
    switch (event.type) {
      case 'MATCH_STARTED':
        status = 'firstHalf';
        currentPeriod = event.period;
        break;
      case 'PERIOD_STARTED':
        currentPeriod = event.period;
        status = event.period === 1 ? 'firstHalf' : 'secondHalf';
        break;
      case 'CLOCK_STARTED':
        clockRunning = true;
        runningSegmentStartedAtGameClockMs = event.gameClockMs;
        break;
      case 'CLOCK_STOPPED':
        completedElapsedMs += elapsedSegment(runningSegmentStartedAtGameClockMs, event.gameClockMs);
        clockRunning = false;
        runningSegmentStartedAtGameClockMs = null;
        break;
      case 'CLOCK_RESET':
        clockRunning = false;
        runningSegmentStartedAtGameClockMs = null;
        break;
      case 'PERIOD_ENDED':
        completedElapsedMs += elapsedSegment(runningSegmentStartedAtGameClockMs, event.gameClockMs);
        clockRunning = false;
        runningSegmentStartedAtGameClockMs = null;
        status = event.period < match.periodCount ? 'halftime' : status;
        break;
      case 'PLAYER_ENTERED':
        lineup.add(event.playerId);
        break;
      case 'PLAYER_LEFT':
        lineup.delete(event.playerId);
        break;
      case 'SUBSTITUTION':
        lineup.delete(event.outPlayerId);
        lineup.add(event.inPlayerId);
        break;
      case 'FOUL': {
        const fouls = foulsByPeriod[event.period] ?? { home: 0, away: 0 };
        foulsByPeriod[event.period] = {
          ...fouls,
          [event.team]: fouls[event.team] + 1,
        };
        break;
      }
      case 'GOAL_FOR':
        score = { ...score, home: score.home + 1 };
        break;
      case 'GOAL_AGAINST':
        score = { ...score, away: score.away + 1 };
        break;
      case 'MATCH_FINISHED':
        status = 'finished';
        clockRunning = false;
        runningSegmentStartedAtGameClockMs = null;
        break;
      case 'EVENT_UNDONE':
        break;
    }
  }

  return {
    status,
    currentPeriod,
    clockRunning,
    score,
    currentLineupPlayerIds: [...lineup],
    foulsByPeriod,
    completedElapsedMs,
    runningSegmentStartedAtGameClockMs,
    activeEvents,
  };
}

export function selectActiveEvents(events: readonly MatchEvent[]): MatchEvent[] {
  const ordered = [...events].sort(compareEvents);
  const undoneIds = new Set<string>();
  for (const event of ordered) {
    if (event.type === 'EVENT_UNDONE' && !event.undone) {
      undoneIds.add(event.targetEventId);
    }
  }
  return ordered.filter((event) => !event.undone && !undoneIds.has(event.id));
}

function elapsedSegment(startRemainingMs: number | null, endRemainingMs: number): number {
  return startRemainingMs === null ? 0 : Math.max(0, startRemainingMs - endRemainingMs);
}

function compareEvents(left: MatchEvent, right: MatchEvent): number {
  return left.sequence - right.sequence || left.timestamp - right.timestamp;
}
