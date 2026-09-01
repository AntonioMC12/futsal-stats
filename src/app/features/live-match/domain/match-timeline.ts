import { formatGameClock } from '../../../core/clock/match-clock';
import { MatchEvent } from '../../../shared/models/match-event';
import { selectActiveEvents } from './derived-match-state';
import { deriveDisciplinaryState } from './discipline';

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
  playerNumbers: Readonly<Record<string, number>> = {},
): MatchTimelineItem[] {
  const discipline = deriveDisciplinaryState(events, 0);
  return selectActiveEvents(events)
    .filter((event) => event.type !== 'EVENT_UNDONE')
    .reverse()
    .map((event) => ({
      eventId: event.id,
      type: event.type,
      period: event.period,
      gameClock: formatGameClock(event.gameClockMs),
      label: eventLabel(
        event,
        playerNames,
        playerNumbers,
        discipline.goalReleaseEventIds.has(event.id),
      ),
    }));
}

function eventLabel(
  event: MatchEvent,
  playerNames: Readonly<Record<string, string>>,
  playerNumbers: Readonly<Record<string, number>>,
  releasedReduction: boolean,
): string {
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
      return foulLabel(event, playerNames);
    case 'BENCH_DISCIPLINE':
      return benchDisciplineLabel(event, playerNames, playerNumbers);
    case 'RED_CARD_REPLACEMENT':
      return event.team === 'home'
        ? `${playerName(event.playerId ?? '', playerNames)} entra tras expulsión`
        : 'Rival repone jugador tras expulsión';
    case 'GOAL_FOR':
      return `${event.scorerPlayerId ? `Gol ${playerLabel(event.scorerPlayerId, playerNames, playerNumbers)}` : 'Gol a favor'} · ${event.scoreAfter.home}-${event.scoreAfter.away}${releasedReduction ? ' · finaliza inferioridad rival' : ''}`;
    case 'GOAL_AGAINST':
      return `Gol en contra · ${event.scoreAfter.home}-${event.scoreAfter.away}${releasedReduction ? ' · finaliza inferioridad' : ''}`;
    case 'MATCH_FINISHED':
      return 'Partido finalizado';
    case 'EVENT_UNDONE':
      return 'Evento deshecho';
  }
}

function benchDisciplineLabel(
  event: Extract<MatchEvent, { type: 'BENCH_DISCIPLINE' }>,
  playerNames: Readonly<Record<string, string>>,
  playerNumbers: Readonly<Record<string, number>>,
): string {
  const card =
    event.disciplinaryAction === 'yellow'
      ? '🟨'
      : event.disciplinaryAction === 'secondYellow'
        ? '🟨🟨'
        : '🟥';
  const side = event.team === 'home' ? 'Banquillo' : 'Banquillo rival';
  const subject =
    event.subjectKind === 'player' && event.playerId
      ? playerLabel(event.playerId, playerNames, playerNumbers)
      : event.subjectKind === 'opponentPlayer'
        ? `#${event.opponentPlayerNumber}`
        : `${staffRoleLabel(event.staffRole)}${event.staffName ? ` · ${event.staffName}` : ''}`;
  const reason = event.reason === 'protest' ? 'Protesta / desobediencia' : 'Otra conducta';
  const foul = event.countsAsAccumulatedFoul
    ? event.team === 'home'
      ? ' · +1 falta'
      : ' · +1 falta rival'
    : '';
  return `${card} ${side} · ${subject} · ${reason}${foul}`;
}

function staffRoleLabel(
  role?: Extract<MatchEvent, { type: 'BENCH_DISCIPLINE' }>['staffRole'],
): string {
  switch (role) {
    case 'headCoach':
      return 'Entrenador';
    case 'assistantCoach':
      return '2.º entrenador';
    case 'delegate':
      return 'Delegado';
    case 'fitnessCoach':
      return 'Preparador físico';
    case 'physiotherapist':
      return 'Fisioterapeuta';
    case 'doctor':
      return 'Médico';
    case 'other':
      return 'Otro miembro del staff';
    default:
      return 'Staff';
  }
}

function foulLabel(
  event: Extract<MatchEvent, { type: 'FOUL' }>,
  playerNames: Readonly<Record<string, string>>,
): string {
  if (!event.playerId && (event.disciplinaryAction ?? 'none') === 'none') {
    return `${event.team === 'home' ? 'Falta propia' : 'Falta rival'} · ${event.periodFoulNumber}ª`;
  }
  const who =
    event.team === 'home'
      ? playerName(event.playerId ?? '', playerNames)
      : `rival${event.opponentPlayerNumber === undefined ? '' : ` #${event.opponentPlayerNumber}`}`;
  const action = event.disciplinaryAction ?? 'none';
  const prefix =
    action === 'yellow'
      ? '🟨 Amarilla'
      : action === 'secondYellow'
        ? '🟨🟨 Segunda amarilla · expulsado'
        : action === 'directRed'
          ? '🟥 Roja directa'
          : event.team === 'home'
            ? 'Falta propia'
            : 'Falta rival';
  return `${prefix} ${who} · ${event.periodFoulNumber}ª`;
}

function playerName(playerId: string, playerNames: Readonly<Record<string, string>>): string {
  return playerNames[playerId] ?? 'Jugador';
}

function playerLabel(
  playerId: string,
  playerNames: Readonly<Record<string, string>>,
  playerNumbers: Readonly<Record<string, number>>,
): string {
  const number = playerNumbers[playerId];
  const name = playerName(playerId, playerNames);
  return number === undefined ? name : `#${number} ${name}`;
}
