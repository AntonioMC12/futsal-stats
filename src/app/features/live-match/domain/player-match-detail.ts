import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { selectActiveEvents } from './derived-match-state';
import { PlayerMatchStatistics } from './match-statistics';
import { PlayerCourtStint } from './player-playing-time';

export interface PlayerMovement {
  eventId: string;
  period: number;
  gameClockMs: number;
  direction: 'in' | 'out' | 'start';
  label: string;
  duringBreak: boolean;
}

export interface PlayerDetailHistory {
  player: Player;
  starter: boolean;
  movements: readonly PlayerMovement[];
  periodNumbers: readonly number[];
}

export interface PlayerMatchDetail extends PlayerDetailHistory {
  status: 'onCourt' | 'bench' | 'notPlayed' | 'sentOff';
  statusLabel: string;
  matchContext: string;
  statistics: PlayerMatchStatistics;
  lastMovement: PlayerMovement | null;
  lastStint: PlayerCourtStint | null;
  periods: {
    period: number;
    label: string;
    movements: readonly PlayerMovement[];
    stints: readonly PlayerCourtStint[];
  }[];
}

// This projection depends on events/selection, never on wall-clock ticks.
export function derivePlayerDetailHistory(
  match: Match,
  events: readonly MatchEvent[],
  playerId: string,
  players: readonly Player[],
): PlayerDetailHistory | null {
  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) return null;
  const roster = new Map(players.map((candidate) => [candidate.id, candidate]));
  const label = (id: string): string => {
    const related = roster.get(id);
    if (!related) return 'Jugador no disponible';
    return `${Number.isFinite(related.number) ? `#${related.number} ` : ''}${related.name || 'Jugador no disponible'}`;
  };
  const movements: PlayerMovement[] = [];
  let onCourt = false;
  let duringBreak = false;
  for (const event of selectActiveEvents(events)) {
    const add = (direction: PlayerMovement['direction'], text: string): void => {
      movements.push({
        eventId: event.id,
        period: event.period,
        gameClockMs: event.gameClockMs,
        direction,
        label: text,
        duringBreak,
      });
    };
    switch (event.type) {
      case 'PERIOD_ENDED':
        duringBreak = true;
        break;
      case 'PERIOD_STARTED':
        duringBreak = false;
        if (onCourt) add('start', 'En pista al inicio del periodo');
        break;
      case 'PLAYER_ENTERED':
        if (event.playerId === playerId) {
          onCourt = true;
          add(
            'in',
            movements.length === 0 &&
              event.period === 1 &&
              match.startingLineupPlayerIds.includes(playerId)
              ? 'Titular · inicio en pista'
              : 'Entra en pista',
          );
        }
        break;
      case 'PLAYER_LEFT':
        if (event.playerId === playerId) {
          onCourt = false;
          add('out', 'Sale de pista');
        }
        break;
      case 'SUBSTITUTION':
        if (event.inPlayerId === playerId) {
          onCourt = true;
          add('in', `Entra por ${label(event.outPlayerId)}`);
        }
        if (event.outPlayerId === playerId) {
          onCourt = false;
          add('out', `Sale por ${label(event.inPlayerId)}`);
        }
        break;
      case 'RED_CARD_REPLACEMENT':
        if (event.team === 'home' && event.playerId === playerId) {
          onCourt = true;
          add('in', 'Entra tras expulsión');
        }
        break;
      case 'FOUL':
        if (
          event.team === 'home' &&
          event.playerId === playerId &&
          (event.disciplinaryAction === 'secondYellow' || event.disciplinaryAction === 'directRed')
        ) {
          onCourt = false;
          add('out', 'Sale por expulsión');
        }
        break;
    }
  }
  return {
    player,
    starter: match.startingLineupPlayerIds.includes(playerId),
    movements,
    periodNumbers: [...new Set([1, 2, ...movements.map((movement) => movement.period)])].sort(
      (a, b) => a - b,
    ),
  };
}

export function projectPlayerMatchDetail(
  history: PlayerDetailHistory,
  statistics: PlayerMatchStatistics,
  stints: readonly PlayerCourtStint[],
  matchStatus: Match['status'],
  onCourt: boolean,
): PlayerMatchDetail {
  const playingPeriod = matchStatus === 'firstHalf' || matchStatus === 'secondHalf';
  const status =
    statistics.sendOffs > 0
      ? 'sentOff'
      : playingPeriod && onCourt
        ? 'onCourt'
        : statistics.entries > 0
          ? 'bench'
          : 'notPlayed';
  const statusLabels = {
    onCourt: 'EN PISTA',
    bench: 'BANQUILLO',
    notPlayed: 'NO HA ENTRADO',
    sentOff: 'EXPULSADO',
  };
  const periodNumbers = [
    ...new Set([...history.periodNumbers, ...stints.map((stint) => stint.period)]),
  ].sort((a, b) => a - b);
  return {
    ...history,
    status,
    statusLabel: statusLabels[status],
    statistics,
    matchContext:
      matchStatus === 'halftime'
        ? 'Descanso'
        : matchStatus === 'finished'
          ? 'Partido finalizado'
          : matchStatus === 'ready' || matchStatus === 'setup'
            ? 'Partido sin iniciar'
            : '',
    lastMovement: history.movements.at(-1) ?? null,
    lastStint: stints.at(-1) ?? null,
    periods: periodNumbers.map((period) => ({
      period,
      label: periodLabel(period),
      movements: history.movements.filter((movement) => movement.period === period),
      stints: stints.filter((stint) => stint.period === period),
    })),
  };
}

export function periodLabel(period: number): string {
  return period === 1 ? '1.ª mitad' : period === 2 ? '2.ª mitad' : `Periodo ${period}`;
}
