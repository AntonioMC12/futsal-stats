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
export type MatchDate = string | number;

export interface Match {
  id: string;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  date: MatchDate;
  description: string;
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

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function matchDateTimestamp(value: MatchDate): number {
  if (typeof value === 'number') return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}
