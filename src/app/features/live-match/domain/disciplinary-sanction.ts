import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import {
  BenchDisciplineAction,
  DisciplineEvent,
  DisciplineReason,
  FoulTeam,
} from '../../../shared/models/match-event';

export interface RegisterDisciplinarySanctionInput {
  match: Match;
  team: FoulTeam;
  playerId?: string;
  opponentPlayerNumber?: number;
  disciplinaryAction: BenchDisciplineAction;
  reason: DisciplineReason;
  currentLineupPlayerIds: readonly string[];
  currentYellowCards: number;
  subjectSentOff: boolean;
  gameClockMs: number;
  matchElapsedMs: number;
  timestamp: number;
  sequence: number;
  eventId: string;
}

export function registerDisciplinarySanction(
  input: RegisterDisciplinarySanctionInput,
): DomainResult<{ match: Match; event: DisciplineEvent }> {
  if (input.match.status !== 'firstHalf' && input.match.status !== 'secondHalf') {
    return fail('Las tarjetas solo se pueden registrar durante un periodo en juego.');
  }
  if (input.subjectSentOff) return fail('La persona seleccionada ya está expulsada.');
  if (input.team === 'home') {
    if (!input.playerId || !input.currentLineupPlayerIds.includes(input.playerId)) {
      return fail('Selecciona un jugador propio que esté en pista.');
    }
  } else if (
    !Number.isSafeInteger(input.opponentPlayerNumber) ||
    input.opponentPlayerNumber === undefined ||
    input.opponentPlayerNumber < 1 ||
    input.opponentPlayerNumber > 999
  ) {
    return fail('Indica un dorsal rival válido entre 1 y 999.');
  }
  if (input.disciplinaryAction === 'yellow' && input.currentYellowCards >= 1) {
    return fail('La siguiente amarilla debe registrarse como segunda amarilla.');
  }
  if (input.disciplinaryAction === 'secondYellow' && input.currentYellowCards !== 1) {
    return fail('La segunda amarilla requiere una amarilla previa.');
  }
  return ok({
    match: { ...input.match, updatedAt: input.timestamp },
    event: {
      id: input.eventId,
      matchId: input.match.id,
      type: 'DISCIPLINE',
      team: input.team,
      playerId: input.playerId,
      opponentPlayerNumber: input.opponentPlayerNumber,
      disciplinaryAction: input.disciplinaryAction,
      reason: input.reason,
      period: input.match.currentPeriod,
      gameClockMs: input.gameClockMs,
      matchElapsedMs: input.matchElapsedMs,
      timestamp: input.timestamp,
      sequence: input.sequence,
      undone: false,
    },
  });
}
