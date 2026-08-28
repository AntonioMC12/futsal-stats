import { formatGameClock } from '../../../core/clock/match-clock';
import { MatchEvent } from '../../../shared/models/match-event';
import { selectActiveEvents } from './derived-match-state';

export interface MatchTimelineItem {
  eventId: string;
  type: MatchEvent['type'];
  period: number;
  gameClock: string;
  label: string;
}

export function createMatchTimeline(
  events: readonly MatchEvent[],
  playerNames: Readonly<Record<string, string>> = {},
): MatchTimelineItem[] {
  return selectActiveEvents(events)
    .filter((event) => event.type !== 'EVENT_UNDONE')
    .reverse()
    .map((event) => ({
      eventId: event.id,
      type: event.type,
      period: event.period,
      gameClock: formatGameClock(event.gameClockMs),
      label: eventLabel(event, playerNames),
    }));
}

function eventLabel(event: MatchEvent, playerNames: Readonly<Record<string, string>>): string {
  switch (event.type) {
    case 'MATCH_STARTED':
      return 'Partido iniciado';
    case 'CLOCK_STARTED':
      return 'Reloj iniciado';
    case 'CLOCK_STOPPED':
      return 'Reloj detenido';
    case 'CLOCK_RESET':
      return 'Reloj reiniciado';
    case 'PERIOD_STARTED':
      return event.period === 1 ? 'Primera parte iniciada' : `Periodo ${event.period} iniciado`;
    case 'PERIOD_ENDED':
      return `Periodo ${event.period} finalizado`;
    case 'PLAYER_ENTERED':
      return `${playerName(event.playerId, playerNames)} entra en pista`;
    case 'PLAYER_LEFT':
      return `${playerName(event.playerId, playerNames)} sale de pista`;
    case 'SUBSTITUTION':
      return `Cambio: ${playerName(event.outPlayerId, playerNames)} → ${playerName(event.inPlayerId, playerNames)}`;
    case 'FOUL':
      return `${event.team === 'home' ? 'Falta propia' : 'Falta rival'} · ${event.periodFoulNumber}ª`;
    case 'GOAL_FOR':
      return `Gol a favor · ${event.scoreAfter.home}-${event.scoreAfter.away}`;
    case 'GOAL_AGAINST':
      return `Gol en contra · ${event.scoreAfter.home}-${event.scoreAfter.away}`;
    case 'MATCH_FINISHED':
      return 'Partido finalizado';
    case 'EVENT_UNDONE':
      return 'Evento deshecho';
  }
}

function playerName(playerId: string, playerNames: Readonly<Record<string, string>>): string {
  return playerNames[playerId] ?? 'Jugador';
}
