import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { DisciplinaryAction, FoulEvent, FoulTeam } from '../../../shared/models/match-event';

export interface RegisterFoulInput {
  match: Match;
  team: FoulTeam;
  currentPeriodFoulCount: number;
  playerId?: string;
  opponentPlayerNumber?: number;
  opponentPlayerYellowCards?: number;
  sentOffOpponentPlayerNumbers?: readonly number[];
  currentLineupPlayerIds?: readonly string[];
  sentOffPlayerIds?: readonly string[];
  playerYellowCards?: number;
  disciplinaryAction?: DisciplinaryAction;
  matchElapsedMs?: number;
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
  if (input.team === 'home' && input.opponentPlayerNumber !== undefined) {
    return fail('No se puede asignar un dorsal rival a una falta propia.');
  }
  if (input.playerId && !input.match.squadPlayerIds.includes(input.playerId)) {
    return fail('El jugador de la falta no está convocado.');
  }
  const action = input.disciplinaryAction ?? 'none';
  if (input.team === 'home') {
    if (!input.playerId) return fail('Selecciona el jugador que ha cometido la falta.');
    if (input.currentLineupPlayerIds && !input.currentLineupPlayerIds.includes(input.playerId)) {
      return fail('La falta solo se puede asignar a un jugador que está en pista.');
    }
    if (input.sentOffPlayerIds?.includes(input.playerId)) {
      return fail('No se puede registrar una falta a un jugador expulsado.');
    }
    const yellowCards = input.playerYellowCards ?? 0;
    if (action === 'yellow' && yellowCards >= 1) {
      return fail('La siguiente amarilla debe registrarse como segunda amarilla.');
    }
    if (action === 'secondYellow' && yellowCards !== 1) {
      return fail('La segunda amarilla requiere una amarilla previa.');
    }
  } else {
    const number = input.opponentPlayerNumber;
    if (action !== 'none' && number === undefined) {
      return fail('Indica el dorsal del jugador rival que recibe la tarjeta.');
    }
    if (number !== undefined && !isValidOpponentPlayerNumber(number)) {
      return fail('El dorsal rival debe ser un número entero entre 1 y 999.');
    }
    if (number !== undefined && input.sentOffOpponentPlayerNumbers?.includes(number)) {
      return fail('No se pueden registrar más acciones para un rival expulsado.');
    }
    const yellowCards = input.opponentPlayerYellowCards ?? 0;
    if (action === 'yellow' && yellowCards >= 1) {
      return fail('La siguiente amarilla rival debe registrarse como segunda amarilla.');
    }
    if (action === 'secondYellow' && yellowCards !== 1) {
      return fail('La segunda amarilla rival requiere una amarilla previa para ese dorsal.');
    }
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
      opponentPlayerNumber: input.opponentPlayerNumber,
      periodFoulNumber: input.currentPeriodFoulCount + 1,
      accumulated: true,
      disciplinaryAction: action,
      matchElapsedMs: input.matchElapsedMs ?? 0,
    },
  });
}

function isValidOpponentPlayerNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 999;
}
