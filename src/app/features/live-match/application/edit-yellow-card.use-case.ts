import { inject, Injectable } from '@angular/core';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { selectActiveEvents } from '../domain/derived-match-state';

export interface EditYellowCardCommand {
  matchId: string;
  eventId: string;
  newPlayerId: string;
}

export interface EditYellowCardResult {
  match: Match;
  event: EditableYellowCardEvent;
  previousPlayerId: string;
}

export type EditableYellowCardEvent =
  | (Extract<MatchEvent, { type: 'FOUL' }> & { playerId: string; disciplinaryAction: 'yellow' })
  | (Extract<MatchEvent, { type: 'DISCIPLINE' }> & {
      playerId: string;
      disciplinaryAction: 'yellow';
    })
  | (Extract<MatchEvent, { type: 'BENCH_DISCIPLINE' }> & {
      subjectKind: 'player';
      playerId: string;
      disciplinaryAction: 'yellow';
    });

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
    if (!match.squadPlayerIds.includes(command.newPlayerId)) {
      throw new PlayerNotInMatchError('El nuevo jugador no pertenece a la convocatoria.');
    }
    const [player] = await this.players.listByIds([command.newPlayerId]);
    if (!player) {
      throw new InvalidDisciplinaryPlayerError('El jugador seleccionado no está disponible.');
    }

    const currentEvents = await this.events.listByMatch(match.id);
    const source = selectActiveEvents(currentEvents).find((event) => event.id === command.eventId);
    if (!source) throw new YellowCardNotFoundError('No se ha encontrado la tarjeta amarilla.');
    if (!isEditableYellowCard(source)) {
      throw new YellowCardNotFoundError('El evento seleccionado no es una amarilla editable.');
    }

    const timestamp = Date.now();
    const updatedMatch = { ...match, updatedAt: timestamp };
    const updatedEvent: EditableYellowCardEvent =
      source.type === 'FOUL'
        ? {
            ...source,
            foulPlayerId: source.foulPlayerId ?? source.playerId,
            playerId: command.newPlayerId,
          }
        : { ...source, playerId: command.newPlayerId };
    try {
      await this.events.updateEvent(updatedMatch, updatedEvent);
    } catch (cause) {
      throw new DisciplineUpdateError('No se ha podido actualizar la tarjeta.', { cause });
    }
    return {
      match: updatedMatch,
      event: updatedEvent,
      previousPlayerId: source.playerId,
    };
  }
}

export function isEditableYellowCard(event: MatchEvent): event is EditableYellowCardEvent {
  if (event.type === 'FOUL' || event.type === 'DISCIPLINE') {
    return (
      event.team === 'home' && event.disciplinaryAction === 'yellow' && Boolean(event.playerId)
    );
  }
  return (
    event.type === 'BENCH_DISCIPLINE' &&
    event.team === 'home' &&
    event.subjectKind === 'player' &&
    event.disciplinaryAction === 'yellow' &&
    Boolean(event.playerId)
  );
}
