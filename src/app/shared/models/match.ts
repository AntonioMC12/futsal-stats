import { MatchClockState } from '../../core/clock/match-clock';
import { TeamRef } from './team';

export const MATCH_STATUSES = [
  'setup',
  'ready',
  'firstHalf',
  'halftime',
  'secondHalf',
  'finished',
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export interface Match {
  id: string;
  teamId: string;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  date: number;
  status: MatchStatus;
  currentPeriod: number;
  periodCount: number;
  clock: MatchClockState;
  squadPlayerIds: string[];
  startingLineupPlayerIds: string[];
  createdAt: number;
  updatedAt: number;
}

export const ACTIVE_MATCH_STATUSES: readonly MatchStatus[] = [
  'ready',
  'firstHalf',
  'halftime',
  'secondHalf',
];

export function isMatchActive(match: Pick<Match, 'status'>): boolean {
  return ACTIVE_MATCH_STATUSES.includes(match.status);
}

export function isMatchFinished(match: Pick<Match, 'status'>): boolean {
  return match.status === 'finished';
}
