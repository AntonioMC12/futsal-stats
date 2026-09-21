import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { SaveEvent, ShotEvent } from '../../../shared/models/match-event';

interface Input {
  match: Match;
  playerId: string;
  currentLineupPlayerIds: readonly string[];
  gameClockMs: number;
  timestamp: number;
  sequence: number;
  eventId: string;
}

function validate(input: Input): string | null {
  if (input.match.statisticsSchemaVersion !== 2)
    return 'Este partido no registra disparos ni paradas.';
  if (input.match.status !== 'firstHalf' && input.match.status !== 'secondHalf')
    return 'La acción solo se puede registrar durante un periodo en juego.';
  if (
    !input.playerId ||
    !input.match.squadPlayerIds.includes(input.playerId) ||
    !input.currentLineupPlayerIds.includes(input.playerId)
  )
    return 'Selecciona un jugador del quinteto actual.';
  return null;
}

export function registerShot(
  input: Input & { outcome: ShotEvent['outcome'] },
): DomainResult<{ match: Match; event: ShotEvent }> {
  const error = validate(input);
  if (error) return fail(error);
  if (input.outcome !== 'on_target' && input.outcome !== 'off_target')
    return fail('Resultado del disparo no válido.');
  return ok({
    match: { ...input.match, updatedAt: input.timestamp },
    event: {
      id: input.eventId,
      matchId: input.match.id,
      type: 'SHOT',
      playerId: input.playerId,
      outcome: input.outcome,
      period: input.match.currentPeriod,
      gameClockMs: input.gameClockMs,
      timestamp: input.timestamp,
      sequence: input.sequence,
      undone: false,
    },
  });
}

export function registerSave(input: Input): DomainResult<{ match: Match; event: SaveEvent }> {
  const error = validate(input);
  if (error) return fail(error);
  return ok({
    match: { ...input.match, updatedAt: input.timestamp },
    event: {
      id: input.eventId,
      matchId: input.match.id,
      type: 'SAVE',
      playerId: input.playerId,
      period: input.match.currentPeriod,
      gameClockMs: input.gameClockMs,
      timestamp: input.timestamp,
      sequence: input.sequence,
      undone: false,
    },
  });
}
