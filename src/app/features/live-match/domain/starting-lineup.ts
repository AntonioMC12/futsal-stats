import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';

export const INITIAL_LINEUP_SIZE = 5;

export function configureStartingLineup(
  match: Match,
  playerIds: readonly string[],
  now: number,
): DomainResult<Match> {
  if (match.status !== 'ready') {
    return fail('El quinteto inicial solo se puede editar antes de iniciar el partido.');
  }

  const uniquePlayerIds = [...new Set(playerIds)];
  if (playerIds.length !== INITIAL_LINEUP_SIZE || uniquePlayerIds.length !== INITIAL_LINEUP_SIZE) {
    return fail('Selecciona exactamente 5 jugadores para el quinteto inicial.');
  }

  const squadIds = new Set(match.squadPlayerIds);
  if (uniquePlayerIds.some((playerId) => !squadIds.has(playerId))) {
    return fail('El quinteto inicial solo puede incluir jugadores convocados.');
  }

  return ok({
    ...match,
    startingLineupPlayerIds: uniquePlayerIds,
    updatedAt: now,
  });
}

export function hasValidStartingLineup(match: Match): boolean {
  const uniquePlayerIds = new Set(match.startingLineupPlayerIds);
  const squadIds = new Set(match.squadPlayerIds);
  return (
    match.startingLineupPlayerIds.length === INITIAL_LINEUP_SIZE &&
    uniquePlayerIds.size === INITIAL_LINEUP_SIZE &&
    [...uniquePlayerIds].every((playerId) => squadIds.has(playerId))
  );
}
