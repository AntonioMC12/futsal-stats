import { MatchEvent } from '../../../shared/models/match-event';

/** Single source of truth for the accumulated-foul counter. */
export function countsAsAccumulatedFoul(event: MatchEvent): boolean {
  if (event.type === 'DISCIPLINE' || event.type === 'BENCH_DISCIPLINE') {
    return (
      event.reason === 'protest' &&
      (event.disciplinaryAction === 'yellow' || event.disciplinaryAction === 'secondYellow')
    );
  }
  if (event.type !== 'FOUL') return false;
  if (event.countsAsAccumulatedFoul !== undefined) return event.countsAsAccumulatedFoul;
  if (event.restart !== undefined) {
    return event.restart === 'direct-free-kick' || event.restart === 'penalty';
  }
  // Historical FOUL events had unequivocally accumulated semantics unless explicitly disabled.
  return event.accumulated !== false;
}
