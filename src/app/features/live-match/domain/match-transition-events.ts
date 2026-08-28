import { Match } from '../../../shared/models/match';
import { MatchEvent, MatchEventType } from '../../../shared/models/match-event';

export type MatchClockCommand =
  'START_CLOCK' | 'STOP_CLOCK' | 'RESET_CLOCK' | 'FINISH_PERIOD' | 'START_NEXT_PERIOD';

export interface MatchTransitionEventInput {
  before: Match;
  after: Match;
  command: MatchClockCommand;
  nextSequence: number;
  timestamp: number;
  createId: () => string;
}

export function createEventsForTransition(input: MatchTransitionEventInput): MatchEvent[] {
  const specifications = eventSpecifications(input);
  return specifications.map((specification, index) => ({
    id: input.createId(),
    matchId: input.after.id,
    period: specification.period,
    gameClockMs: specification.gameClockMs,
    timestamp: input.timestamp,
    sequence: input.nextSequence + index,
    undone: false,
    ...specification.event,
  })) as MatchEvent[];
}

interface EventSpecification {
  event: { type: MatchEventType } | { type: 'PLAYER_ENTERED'; playerId: string };
  period: number;
  gameClockMs: number;
}

function eventSpecifications(input: MatchTransitionEventInput): EventSpecification[] {
  const { before, after } = input;
  const period = after.currentPeriod;
  const gameClockMs = after.clock.remainingMs;

  switch (input.command) {
    case 'START_CLOCK':
      if (before.status === 'ready') {
        return [
          specification('MATCH_STARTED', period, gameClockMs),
          specification('PERIOD_STARTED', period, gameClockMs),
          ...after.startingLineupPlayerIds.map((playerId) => ({
            event: { type: 'PLAYER_ENTERED' as const, playerId },
            period,
            gameClockMs,
          })),
          specification('CLOCK_STARTED', period, gameClockMs),
        ];
      }
      return [specification('CLOCK_STARTED', period, gameClockMs)];
    case 'STOP_CLOCK':
      return [specification('CLOCK_STOPPED', period, gameClockMs)];
    case 'RESET_CLOCK':
      return [specification('CLOCK_RESET', period, gameClockMs)];
    case 'FINISH_PERIOD': {
      const events = [specification('PERIOD_ENDED', before.currentPeriod, gameClockMs)];
      if (after.status === 'finished') {
        events.push(specification('MATCH_FINISHED', before.currentPeriod, gameClockMs));
      }
      return events;
    }
    case 'START_NEXT_PERIOD':
      return [
        specification('PERIOD_STARTED', period, gameClockMs),
        specification('CLOCK_STARTED', period, gameClockMs),
      ];
  }
}

function specification(
  type: MatchEventType,
  period: number,
  gameClockMs: number,
): EventSpecification {
  return { event: { type }, period, gameClockMs };
}
