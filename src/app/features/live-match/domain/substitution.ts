import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { SubstitutionEvent } from '../../../shared/models/match-event';

export interface SubstitutionInput {
  match: Match;
  currentLineupPlayerIds: readonly string[];
  outPlayerId: string;
  inPlayerId: string;
  gameClockMs: number;
  timestamp: number;
  sequence: number;
  eventId: string;
  sentOffPlayerIds?: readonly string[];
}

export interface SubstitutionResult {
  match: Match;
  event: SubstitutionEvent;
}

export function makeSubstitution(input: SubstitutionInput): DomainResult<SubstitutionResult> {
  if (!['firstHalf', 'halftime', 'secondHalf'].includes(input.match.status)) {
    return fail('Las sustituciones solo están disponibles durante el partido.');
  }
  if (!isValidPlayingLineup(input.currentLineupPlayerIds)) {
    return fail('Debe haber entre 3 y 5 jugadores diferentes en pista.');
  }
  if (input.outPlayerId === input.inPlayerId) {
    return fail('Selecciona dos jugadores diferentes.');
  }

  const lineup = new Set(input.currentLineupPlayerIds);
  if (!lineup.has(input.outPlayerId)) {
    return fail('El jugador que sale no está en pista.');
  }
  if (!input.match.squadPlayerIds.includes(input.inPlayerId)) {
    return fail('El jugador que entra no está convocado.');
  }
  if (lineup.has(input.inPlayerId)) {
    return fail('El jugador que entra ya está en pista.');
  }
  if (input.sentOffPlayerIds?.includes(input.inPlayerId)) {
    return fail('Un jugador expulsado no puede volver a entrar.');
  }

  return ok({
    match: { ...input.match, updatedAt: input.timestamp },
    event: {
      id: input.eventId,
      matchId: input.match.id,
      type: 'SUBSTITUTION',
      period: input.match.currentPeriod,
      gameClockMs: input.gameClockMs,
      timestamp: input.timestamp,
      sequence: input.sequence,
      undone: false,
      outPlayerId: input.outPlayerId,
      inPlayerId: input.inPlayerId,
    },
  });
}

function isValidPlayingLineup(playerIds: readonly string[]): boolean {
  return (
    playerIds.length >= 3 && playerIds.length <= 5 && new Set(playerIds).size === playerIds.length
  );
}
