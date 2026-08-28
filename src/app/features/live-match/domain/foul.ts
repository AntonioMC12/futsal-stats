import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { FoulEvent, FoulTeam } from '../../../shared/models/match-event';

export interface RegisterFoulInput {
  match: Match;
  team: FoulTeam;
  currentPeriodFoulCount: number;
  playerId?: string;
  gameClockMs: number;
  timestamp: number;
  sequence: number;
  eventId: string;
}

export interface RegisterFoulResult {
  match: Match;
  event: FoulEvent;
}

export function registerFoul(input: RegisterFoulInput): DomainResult<RegisterFoulResult> {
  if (input.match.status !== 'firstHalf' && input.match.status !== 'secondHalf') {
    return fail('Las faltas solo se pueden registrar durante un periodo en juego.');
  }
  if (!Number.isSafeInteger(input.currentPeriodFoulCount) || input.currentPeriodFoulCount < 0) {
    return fail('El número actual de faltas no es válido.');
  }
  if (input.team === 'away' && input.playerId) {
    return fail('No se puede asignar un jugador propio a una falta rival.');
  }
  if (input.playerId && !input.match.squadPlayerIds.includes(input.playerId)) {
    return fail('El jugador de la falta no está convocado.');
  }

  return ok({
    match: { ...input.match, updatedAt: input.timestamp },
    event: {
      id: input.eventId,
      matchId: input.match.id,
      type: 'FOUL',
      period: input.match.currentPeriod,
      gameClockMs: input.gameClockMs,
      timestamp: input.timestamp,
      sequence: input.sequence,
      undone: false,
      team: input.team,
      playerId: input.playerId,
      periodFoulNumber: input.currentPeriodFoulCount + 1,
    },
  });
}
