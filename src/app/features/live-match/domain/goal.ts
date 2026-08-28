import { isCompleteLineup } from '../../../core/utils/lineup-id';
import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { GoalAgainstEvent, GoalForEvent, ScoreSnapshot } from '../../../shared/models/match-event';

export type GoalSide = 'for' | 'against';

export interface RegisterGoalInput {
  match: Match;
  side: GoalSide;
  currentLineupPlayerIds: readonly string[];
  score: ScoreSnapshot;
  gameClockMs: number;
  timestamp: number;
  sequence: number;
  eventId: string;
}

export interface RegisterGoalResult {
  match: Match;
  event: GoalForEvent | GoalAgainstEvent;
}

export function registerGoal(input: RegisterGoalInput): DomainResult<RegisterGoalResult> {
  if (input.match.status !== 'firstHalf' && input.match.status !== 'secondHalf') {
    return fail('Los goles solo se pueden registrar durante un periodo en juego.');
  }
  if (!isCompleteLineup(input.currentLineupPlayerIds)) {
    return fail('Debe haber exactamente 5 jugadores en pista para registrar un gol.');
  }
  if (
    input.currentLineupPlayerIds.some((playerId) => !input.match.squadPlayerIds.includes(playerId))
  ) {
    return fail('El quinteto contiene jugadores que no están convocados.');
  }
  if (!isValidScore(input.score)) {
    return fail('El marcador actual no es válido.');
  }

  const common = {
    id: input.eventId,
    matchId: input.match.id,
    period: input.match.currentPeriod,
    gameClockMs: input.gameClockMs,
    timestamp: input.timestamp,
    sequence: input.sequence,
    undone: false,
    lineupPlayerIds: [...input.currentLineupPlayerIds],
    scoreBefore: { ...input.score },
  };
  const event: GoalForEvent | GoalAgainstEvent =
    input.side === 'for'
      ? {
          ...common,
          type: 'GOAL_FOR',
          scoreAfter: { home: input.score.home + 1, away: input.score.away },
        }
      : {
          ...common,
          type: 'GOAL_AGAINST',
          scoreAfter: { home: input.score.home, away: input.score.away + 1 },
        };

  return ok({
    match: { ...input.match, updatedAt: input.timestamp },
    event,
  });
}

function isValidScore(score: ScoreSnapshot): boolean {
  return (
    Number.isSafeInteger(score.home) &&
    score.home >= 0 &&
    Number.isSafeInteger(score.away) &&
    score.away >= 0
  );
}
