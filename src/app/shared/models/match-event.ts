export const MATCH_EVENT_TYPES = [
  'MATCH_STARTED',
  'CLOCK_STARTED',
  'CLOCK_STOPPED',
  'CLOCK_RESET',
  'PERIOD_STARTED',
  'PERIOD_ENDED',
  'PLAYER_ENTERED',
  'PLAYER_LEFT',
  'SUBSTITUTION',
  'FOUL',
  'GOAL_FOR',
  'GOAL_AGAINST',
  'EVENT_UNDONE',
  'MATCH_FINISHED',
] as const;

export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

export type FoulTeam = 'home' | 'away';

export interface MatchEventBase {
  id: string;
  matchId: string;
  type: MatchEventType;
  period: number;
  gameClockMs: number;
  timestamp: number;
  sequence: number;
  undone: boolean;
}

export interface MatchStartedEvent extends MatchEventBase {
  type: 'MATCH_STARTED';
}

export interface ClockStartedEvent extends MatchEventBase {
  type: 'CLOCK_STARTED';
}

export interface ClockStoppedEvent extends MatchEventBase {
  type: 'CLOCK_STOPPED';
}

export interface ClockResetEvent extends MatchEventBase {
  type: 'CLOCK_RESET';
}

export interface PeriodStartedEvent extends MatchEventBase {
  type: 'PERIOD_STARTED';
}

export interface PeriodEndedEvent extends MatchEventBase {
  type: 'PERIOD_ENDED';
}

export interface PlayerEnteredEvent extends MatchEventBase {
  type: 'PLAYER_ENTERED';
  playerId: string;
}

export interface PlayerLeftEvent extends MatchEventBase {
  type: 'PLAYER_LEFT';
  playerId: string;
}

export interface SubstitutionEvent extends MatchEventBase {
  type: 'SUBSTITUTION';
  outPlayerId: string;
  inPlayerId: string;
}

export interface FoulEvent extends MatchEventBase {
  type: 'FOUL';
  team: FoulTeam;
  playerId?: string;
  periodFoulNumber: number;
}

export interface GoalForEvent extends MatchEventBase {
  type: 'GOAL_FOR';
  lineupPlayerIds: string[];
  scoreBefore: ScoreSnapshot;
  scoreAfter: ScoreSnapshot;
}

export interface GoalAgainstEvent extends MatchEventBase {
  type: 'GOAL_AGAINST';
  lineupPlayerIds: string[];
  scoreBefore: ScoreSnapshot;
  scoreAfter: ScoreSnapshot;
}

export interface EventUndoneEvent extends MatchEventBase {
  type: 'EVENT_UNDONE';
  targetEventId: string;
}

export interface MatchFinishedEvent extends MatchEventBase {
  type: 'MATCH_FINISHED';
}

export interface ScoreSnapshot {
  home: number;
  away: number;
}

export type MatchEvent =
  | MatchStartedEvent
  | ClockStartedEvent
  | ClockStoppedEvent
  | ClockResetEvent
  | PeriodStartedEvent
  | PeriodEndedEvent
  | PlayerEnteredEvent
  | PlayerLeftEvent
  | SubstitutionEvent
  | FoulEvent
  | GoalForEvent
  | GoalAgainstEvent
  | EventUndoneEvent
  | MatchFinishedEvent;
