import { Match } from '../../../shared/models/match';
import { EventUndoneEvent, MatchEvent } from '../../../shared/models/match-event';
import { DomainResult, fail, ok } from '../../../core/utils/result';
import { selectActiveEvents } from './derived-match-state';

export type UndoableMatchEvent = Extract<
  MatchEvent,
  {
    type:
      | 'GOAL_FOR'
      | 'GOAL_AGAINST'
      | 'FOUL'
      | 'BENCH_DISCIPLINE'
      | 'SUBSTITUTION'
      | 'RED_CARD_REPLACEMENT';
  }
>;

export interface UndoLastEventInput {
  match: Match;
  events: readonly MatchEvent[];
  gameClockMs: number;
  timestamp: number;
  sequence: number;
  eventId: string;
}

export interface UndoLastEventResult {
  match: Match;
  event: EventUndoneEvent;
  targetEvent: UndoableMatchEvent;
}

export function findLastUndoableEvent(events: readonly MatchEvent[]): UndoableMatchEvent | null {
  const activeEvents = selectActiveEvents(events);
  for (let index = activeEvents.length - 1; index >= 0; index -= 1) {
    const event = activeEvents[index];
    if (isUndoableEvent(event)) {
      return event;
    }
  }
  return null;
}

export function undoLastEvent(input: UndoLastEventInput): DomainResult<UndoLastEventResult> {
  const targetEvent = findLastUndoableEvent(input.events);
  if (!targetEvent) {
    return fail('No hay ninguna acción que se pueda deshacer.');
  }

  const event: EventUndoneEvent = {
    id: input.eventId,
    matchId: input.match.id,
    type: 'EVENT_UNDONE',
    targetEventId: targetEvent.id,
    period: input.match.currentPeriod,
    gameClockMs: input.gameClockMs,
    timestamp: input.timestamp,
    sequence: input.sequence,
    undone: false,
  };

  return ok({
    match: { ...input.match, updatedAt: input.timestamp },
    event,
    targetEvent,
  });
}

function isUndoableEvent(event: MatchEvent): event is UndoableMatchEvent {
  return (
    event.type === 'GOAL_FOR' ||
    event.type === 'GOAL_AGAINST' ||
    event.type === 'FOUL' ||
    event.type === 'BENCH_DISCIPLINE' ||
    event.type === 'SUBSTITUTION' ||
    event.type === 'RED_CARD_REPLACEMENT'
  );
}
