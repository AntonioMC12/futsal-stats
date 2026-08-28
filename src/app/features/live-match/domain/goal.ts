import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { GoalAgainstEvent, GoalForEvent, ScoreSnapshot } from '../../../shared/models/match-event';

export type GoalSide = 'for' | 'against';

export interface RegisterGoalInput {
  match: Match;
  side: GoalSide;
  scorerPlayerId?: string;
  currentLineupPlayerIds: readonly string[];
  score: ScoreSnapshot;
  gameClockMs: number;
  timestamp: number;
  sequence: number;
  eventId: string;
  matchElapsedMs?: number;
}

export interface RegisterGoalResult {
  match: Match;
  event: GoalForEvent | GoalAgainstEvent;
}

export function registerGoal(input: RegisterGoalInput): DomainResult<RegisterGoalResult> {
  if (input.match.status !== 'firstHalf' && input.match.status !== 'secondHalf') {
    return fail('Los goles solo se pueden registrar durante un periodo en juego.');
  }
  if (!isValidPlayingLineup(input.currentLineupPlayerIds)) {
    return fail('Debe haber entre 3 y 5 jugadores diferentes en pista para registrar un gol.');
  }
  if (
    input.currentLineupPlayerIds.some((playerId) => !input.match.squadPlayerIds.includes(playerId))
  ) {
    return fail('El quinteto contiene jugadores que no están convocados.');
  }
  if (input.scorerPlayerId && input.side !== 'for') {
    return fail('Solo los goles a favor pueden tener goleador.');
  }
  if (input.scorerPlayerId && !input.currentLineupPlayerIds.includes(input.scorerPlayerId)) {
    return fail('El goleador debe estar en pista al registrar el gol.');
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
    matchElapsedMs: input.matchElapsedMs ?? 0,
  };
  const event: GoalForEvent | GoalAgainstEvent =
    input.side === 'for'
      ? {
          ...common,
          type: 'GOAL_FOR',
          ...(input.scorerPlayerId ? { scorerPlayerId: input.scorerPlayerId } : {}),
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

function isValidPlayingLineup(playerIds: readonly string[]): boolean {
  return (
    playerIds.length >= 3 && playerIds.length <= 5 && new Set(playerIds).size === playerIds.length
  );
}

function isValidScore(score: ScoreSnapshot): boolean {
  return (
    Number.isSafeInteger(score.home) &&
    score.home >= 0 &&
    Number.isSafeInteger(score.away) &&
    score.away >= 0
  );
}
