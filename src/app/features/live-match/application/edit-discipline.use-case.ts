import { inject, Injectable } from '@angular/core';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { MatchEvent } from '../../../shared/models/match-event';
import { selectActiveEvents } from '../domain/derived-match-state';
import { isEditableYellowCard } from './edit-yellow-card.use-case';

export type EditDisciplineInput = { eventId: string } & (
  | { action: 'editFoul'; playerId?: string; opponentPlayerNumber?: number; accumulated: boolean }
  | { action: 'removeFoul' }
  | { action: 'removeYellow' }
);
export type EditDisciplineCommand = EditDisciplineInput & { matchId: string };

@Injectable({ providedIn: 'root' })
export class EditDisciplineUseCase {
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly events = inject(MATCH_EVENT_REPOSITORY);
  private readonly players = inject(PLAYER_REPOSITORY);

  async execute(command: EditDisciplineCommand) {
    const match = await this.matches.get(command.matchId);
    if (!match) throw new Error('No se ha encontrado el partido.');
    if (match.status === 'finished')
      throw new Error('El partido está finalizado y no admite cambios.');
    const events = selectActiveEvents(await this.events.listByMatch(match.id));
    const source = events.find((event) => event.id === command.eventId);
    if (!source) throw new Error('La acción ya no está disponible.');
    let event: MatchEvent;
    if (command.action === 'removeYellow') {
      if (!isEditableYellowCard(source)) throw new Error('Selecciona una tarjeta amarilla.');
      const hasSecondYellow = events.some(
        (other) =>
          (other.type === 'FOUL' ||
            other.type === 'DISCIPLINE' ||
            other.type === 'BENCH_DISCIPLINE') &&
          other.team === source.team &&
          other.disciplinaryAction === 'secondYellow' &&
          (source.team === 'home'
            ? other.playerId === source.playerId
            : other.opponentPlayerNumber === source.opponentPlayerNumber),
      );
      if (hasSecondYellow)
        throw new Error(
          'No se puede retirar esta amarilla porque el jugador tiene una expulsión por segunda amarilla.',
        );
      event =
        source.type === 'FOUL'
          ? { ...source, disciplinaryAction: 'none' }
          : { ...source, undone: true };
    } else {
      if (source.type !== 'FOUL') throw new Error('Selecciona una falta.');
      if (command.action === 'removeFoul') {
        // Removing an infringement must retain any sanction recorded with it.
        if (source.disciplinaryAction && source.disciplinaryAction !== 'none') {
          const {
            foulPlayerId,
            foulOpponentPlayerNumber,
            periodFoulNumber,
            countsAsAccumulatedFoul,
            restart,
            accumulated,
            receivedByPlayerId,
            ...card
          } = source;
          event = {
            ...card,
            type: 'DISCIPLINE',
            disciplinaryAction: source.disciplinaryAction,
            reason: 'other',
          };
        } else {
          event = { ...source, undone: true };
        }
      } else {
        if (source.team === 'home') {
          if (
            !command.playerId ||
            !match.squadPlayerIds.includes(command.playerId) ||
            !(await this.players.listByIds([command.playerId])).length
          ) {
            throw new Error('Selecciona un jugador de la convocatoria.');
          }
        } else if (
          command.opponentPlayerNumber !== undefined &&
          (!Number.isSafeInteger(command.opponentPlayerNumber) ||
            command.opponentPlayerNumber < 1 ||
            command.opponentPlayerNumber > 999)
        ) {
          throw new Error('Introduce un dorsal rival entre 1 y 999 o déjalo vacío.');
        }
        event = {
          ...source,
          // Keep the card recipient independent of the corrected offender.
          ...(source.team === 'home'
            ? {
                foulPlayerId: command.playerId,
                ...(source.disciplinaryAction && source.disciplinaryAction !== 'none'
                  ? {}
                  : { playerId: command.playerId }),
              }
            : {
                foulOpponentPlayerNumber: command.opponentPlayerNumber,
                ...(source.disciplinaryAction && source.disciplinaryAction !== 'none'
                  ? {}
                  : { opponentPlayerNumber: command.opponentPlayerNumber }),
              }),
          countsAsAccumulatedFoul: command.accumulated,
          accumulated: command.accumulated,
          restart: command.accumulated
            ? source.restart === 'penalty'
              ? 'penalty'
              : 'direct-free-kick'
            : 'indirect-free-kick',
        };
        if (
          source.team === 'away' &&
          command.opponentPlayerNumber === undefined &&
          source.disciplinaryAction &&
          source.disciplinaryAction !== 'none'
        ) {
          throw new Error('Esta falta tiene una tarjeta asociada; indica el dorsal del infractor.');
        }
      }
    }
    const updatedMatch = { ...match, updatedAt: Date.now() };
    await this.events.updateEvent(updatedMatch, event);
    return { match: updatedMatch, event };
  }
}
