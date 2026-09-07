import { MatchEventType } from '../../../shared/models/match-event';
export function shouldAutoStopClock(type: MatchEventType): boolean {
  return type === 'GOAL_FOR' || type === 'GOAL_AGAINST' || type === 'FOUL';
}
