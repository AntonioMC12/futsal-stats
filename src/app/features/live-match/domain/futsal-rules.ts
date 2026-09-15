import { MatchEvent } from '../../../shared/models/match-event';

/** Single source of truth for the accumulated-foul counter. */
export function countsAsAccumulatedFoul(event: MatchEvent): boolean {
  if (event.type !== 'FOUL') return false;
  if (event.countsAsAccumulatedFoul !== undefined) return event.countsAsAccumulatedFoul;
  if (event.restart !== undefined) {
    return event.restart === 'direct-free-kick' || event.restart === 'penalty';
  }
  // Historical FOUL events had unequivocally accumulated semantics unless explicitly disabled.
  return event.accumulated !== false;
}
