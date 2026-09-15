import { inject, Injectable } from '@angular/core';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { selectActiveEvents } from '../domain/derived-match-state';

interface EditYellowCardCommandBase {
  matchId: string;
  eventId: string;
}

export type EditYellowCardCommand = EditYellowCardCommandBase &
  (
    | { newPlayerId: string; newOpponentPlayerNumber?: never }
    | { newPlayerId?: never; newOpponentPlayerNumber: number }
  );

export interface EditYellowCardResult {
  match: Match;
  event: EditableYellowCardEvent;
  previousPlayerId?: string;
  previousOpponentPlayerNumber?: number;
}

export type EditableYellowCardEvent =
  | (Extract<MatchEvent, { type: 'FOUL' }> & { disciplinaryAction: 'yellow' })
  | (Extract<MatchEvent, { type: 'DISCIPLINE' }> & { disciplinaryAction: 'yellow' })
  | (Extract<MatchEvent, { type: 'BENCH_DISCIPLINE' }> & { disciplinaryAction: 'yellow' });

export class YellowCardNotFoundError extends Error {}
export class InvalidDisciplinaryPlayerError extends Error {}
export class PlayerNotInMatchError extends Error {}
export class MatchReadonlyError extends Error {}
export class DisciplineUpdateError extends Error {}

@Injectable({ providedIn: 'root' })
export class EditYellowCardUseCase {
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly events = inject(MATCH_EVENT_REPOSITORY);
  private readonly players = inject(PLAYER_REPOSITORY);

  async execute(command: EditYellowCardCommand): Promise<EditYellowCardResult> {
    const match = await this.matches.get(command.matchId);
    if (!match) throw new YellowCardNotFoundError('No se ha encontrado el partido.');
    if (match.status === 'finished') {
      throw new MatchReadonlyError('El partido está finalizado y no admite cambios.');
    }
    const currentEvents = await this.events.listByMatch(match.id);
    const source = selectActiveEvents(currentEvents).find((event) => event.id === command.eventId);
    if (!source) throw new YellowCardNotFoundError('No se ha encontrado la tarjeta amarilla.');
    if (!isEditableYellowCard(source)) {
      throw new YellowCardNotFoundError('El evento seleccionado no es una amarilla editable.');
    }

    if (source.team === 'home') {
      if (!command.newPlayerId) {
        throw new InvalidDisciplinaryPlayerError('Selecciona un jugador válido.');
      }
      if (!match.squadPlayerIds.includes(command.newPlayerId)) {
        throw new PlayerNotInMatchError('El nuevo jugador no pertenece a la convocatoria.');
      }
      const [player] = await this.players.listByIds([command.newPlayerId]);
      if (!player) {
        throw new InvalidDisciplinaryPlayerError('El jugador seleccionado no está disponible.');
      }
    } else if (!isValidOpponentNumber(command.newOpponentPlayerNumber)) {
      throw new InvalidDisciplinaryPlayerError('Introduce un dorsal rival entre 1 y 999.');
    }

    const timestamp = Date.now();
    const updatedMatch = { ...match, updatedAt: timestamp };
    const updatedEvent = updateCardSubject(source, command);
    try {
      await this.events.updateEvent(updatedMatch, updatedEvent);
    } catch (cause) {
      throw new DisciplineUpdateError('No se ha podido actualizar la tarjeta.', { cause });
    }
    return {
      match: updatedMatch,
      event: updatedEvent,
      previousPlayerId: source.playerId,
      previousOpponentPlayerNumber: source.opponentPlayerNumber,
    };
  }
}

export function isEditableYellowCard(event: MatchEvent): event is EditableYellowCardEvent {
  if (event.type === 'FOUL' || event.type === 'DISCIPLINE') {
    return (
      event.disciplinaryAction === 'yellow' &&
      (event.team === 'home' ? Boolean(event.playerId) : event.opponentPlayerNumber !== undefined)
    );
  }
  return (
    event.type === 'BENCH_DISCIPLINE' &&
    event.disciplinaryAction === 'yellow' &&
    (event.team === 'home'
      ? event.subjectKind === 'player' && Boolean(event.playerId)
      : event.subjectKind === 'opponentPlayer' && event.opponentPlayerNumber !== undefined)
  );
}

function updateCardSubject(
  source: EditableYellowCardEvent,
  command: EditYellowCardCommand,
): EditableYellowCardEvent {
  if (source.team === 'home') {
    const newPlayerId = command.newPlayerId!;
    return source.type === 'FOUL'
      ? {
          ...source,
          foulPlayerId: source.foulPlayerId ?? source.playerId,
          playerId: newPlayerId,
        }
      : { ...source, playerId: newPlayerId };
  }

  const newOpponentPlayerNumber = command.newOpponentPlayerNumber!;
  return source.type === 'FOUL'
    ? {
        ...source,
        foulOpponentPlayerNumber: source.foulOpponentPlayerNumber ?? source.opponentPlayerNumber,
        opponentPlayerNumber: newOpponentPlayerNumber,
      }
    : { ...source, opponentPlayerNumber: newOpponentPlayerNumber };
}

function isValidOpponentNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 1 && value <= 999;
}
