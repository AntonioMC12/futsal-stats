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
  'BENCH_DISCIPLINE',
  'RED_CARD_REPLACEMENT',
  'GOAL_FOR',
  'GOAL_AGAINST',
  'EVENT_UNDONE',
  'MATCH_FINISHED',
] as const;

export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

export type FoulTeam = 'home' | 'away';
export type DisciplinaryAction = 'none' | 'yellow' | 'secondYellow' | 'directRed';
export type BenchDisciplineAction = Exclude<DisciplinaryAction, 'none'>;
export type BenchDisciplineReason = 'protest' | 'other';
export type BenchDisciplineSubjectKind = 'player' | 'opponentPlayer' | 'staff';
export type StaffRole =
  | 'headCoach'
  | 'assistantCoach'
  | 'delegate'
  | 'fitnessCoach'
  | 'physiotherapist'
  | 'doctor'
  | 'other';

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
  opponentPlayerNumber?: number;
  periodFoulNumber: number;
  accumulated?: boolean;
  disciplinaryAction?: DisciplinaryAction;
  matchElapsedMs?: number;
}

export interface BenchDisciplineEvent extends MatchEventBase {
  type: 'BENCH_DISCIPLINE';
  team: FoulTeam;
  subjectKind: BenchDisciplineSubjectKind;
  playerId?: string;
  opponentPlayerNumber?: number;
  staffRole?: StaffRole;
  staffName?: string;
  staffIdentityKey?: string;
  disciplinaryAction: BenchDisciplineAction;
  reason: BenchDisciplineReason;
  context: 'bench';
  countsAsAccumulatedFoul: boolean;
  createsDirectFreeKickWithoutWall: false;
  periodFoulNumber: number;
}

export interface RedCardReplacementEvent extends MatchEventBase {
  type: 'RED_CARD_REPLACEMENT';
  team: FoulTeam;
  reductionEventId: string;
  playerId?: string;
  matchElapsedMs: number;
}

export interface GoalForEvent extends MatchEventBase {
  type: 'GOAL_FOR';
  scorerPlayerId?: string;
  lineupPlayerIds: string[];
  scoreBefore: ScoreSnapshot;
  scoreAfter: ScoreSnapshot;
  matchElapsedMs?: number;
}

export interface GoalAgainstEvent extends MatchEventBase {
  type: 'GOAL_AGAINST';
  lineupPlayerIds: string[];
  scoreBefore: ScoreSnapshot;
  scoreAfter: ScoreSnapshot;
  matchElapsedMs?: number;
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
  | BenchDisciplineEvent
  | RedCardReplacementEvent
  | GoalForEvent
  | GoalAgainstEvent
  | EventUndoneEvent
  | MatchFinishedEvent;
