import {
  BenchDisciplineAction,
  BenchDisciplineReason,
  FoulEvent,
  FoulTeam,
  MatchEvent,
} from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import {
  DisciplinaryState,
  NumericalReduction,
  PlayerDisciplineStatistics,
  TeamDisciplineStatistics,
} from './discipline';
import { selectActiveEvents } from './derived-match-state';
import { countsAsAccumulatedFoul } from './futsal-rules';

export interface DisciplineParticipantSummary extends PlayerDisciplineStatistics {
  id: string;
  number: number;
  name?: string;
  sentOff: boolean;
  ordinaryYellowCards: number;
}

export interface ActiveDisciplineSanction {
  eventId: string;
  team: FoulTeam;
  number?: number;
  name?: string;
  source: NumericalReduction['source'];
  status: Exclude<NumericalReduction['status'], 'replacementCompleted'>;
  remainingMs: number;
}

export interface DisciplineSideView {
  totals: TeamDisciplineStatistics;
  participants: DisciplineParticipantSummary[];
}

export interface BenchDisciplineViewItem {
  eventId: string;
  label: string;
  sanction: BenchDisciplineAction;
  reason: BenchDisciplineReason;
  countsAsAccumulatedFoul: boolean;
  sentOff: boolean;
}

export interface EditableYellowCardViewItem {
  eventId: string;
  team: FoulTeam;
  playerId?: string;
  opponentPlayerNumber?: number;
  number: number;
  name?: string;
  period: number;
  gameClockMs: number;
  reason: string;
  relatedEventId?: string;
  linkedFoulPlayerId?: string;
  linkedFoulOpponentPlayerNumber?: number;
  linkedFoulPlayerLabel?: string;
}

export interface DisciplineViewModel {
  home: DisciplineSideView;
  away: DisciplineSideView & { unattributedFouls: number };
  activeSanctions: ActiveDisciplineSanction[];
  bench: Readonly<Record<FoulTeam, BenchDisciplineViewItem[]>>;
  editableYellowCards: EditableYellowCardViewItem[];
  hasActivity: boolean;
}

export function createDisciplineView(
  state: DisciplinaryState,
  players: readonly Player[],
  events: readonly MatchEvent[],
  currentPeriod: number,
): DisciplineViewModel {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const activeEvents = selectActiveEvents(events);
  const currentFouls = activeEvents.filter(
    (event): event is FoulEvent =>
      event.type === 'FOUL' && event.period === currentPeriod && countsAsAccumulatedFoul(event),
  );
  const homeFoulsByPlayer = countBy(
    currentFouls.filter((event) => event.team === 'home' && (event.foulPlayerId ?? event.playerId)),
    (event) => (event.foulPlayerId ?? event.playerId)!,
  );
  const awayFoulsByNumber = countBy(
    currentFouls.filter(
      (event) =>
        event.team === 'away' &&
        (event.foulOpponentPlayerNumber ?? event.opponentPlayerNumber) !== undefined,
    ),
    (event) => (event.foulOpponentPlayerNumber ?? event.opponentPlayerNumber)!,
  );
  const homeTotals = {
    ...state.teams.home,
    fouls: currentFouls.filter((event) => event.team === 'home').length,
    accumulatedFouls: currentFouls.filter((event) => event.team === 'home').length,
  };
  const awayTotals = {
    ...state.teams.away,
    fouls: currentFouls.filter((event) => event.team === 'away').length,
    accumulatedFouls: currentFouls.filter((event) => event.team === 'away').length,
  };
  const homeParticipants = Object.entries(state.players)
    .flatMap(([playerId, statistics]): DisciplineParticipantSummary[] => {
      const player = playersById.get(playerId);
      if (!player) return [];
      const participant: DisciplineParticipantSummary = {
        id: playerId,
        number: player.number,
        name: player.name,
        ...statistics,
        fouls: homeFoulsByPlayer.get(playerId) ?? 0,
        sentOff: statistics.sendOffs > 0,
        ordinaryYellowCards: Math.max(0, statistics.yellowCards - statistics.secondYellowSendOffs),
      };
      return hasDiscipline(participant) ? [participant] : [];
    })
    .sort(compareParticipants);

  const awayParticipants = state.opponentPlayers
    .map((participant): DisciplineParticipantSummary => ({
      id: `opponent-${participant.jerseyNumber}`,
      number: participant.jerseyNumber,
      fouls: awayFoulsByNumber.get(participant.jerseyNumber) ?? 0,
      accumulatedFouls: participant.accumulatedFouls,
      nonAccumulatedInfringements: participant.nonAccumulatedInfringements,
      yellowCards: participant.yellowCards,
      secondYellowSendOffs: participant.secondYellowSendOffs,
      directRedCards: participant.directRedCards,
      sendOffs: participant.sendOffs,
      sentOff: participant.sentOff,
      ordinaryYellowCards: Math.max(0, participant.yellowCards - participant.secondYellowSendOffs),
    }))
    .filter(hasDiscipline)
    .sort(compareParticipants);

  const unattributedFouls = currentFouls.filter(
    (event) =>
      event.team === 'away' &&
      (event.foulOpponentPlayerNumber ?? event.opponentPlayerNumber) === undefined,
  ).length;
  const activeSanctions = state.reductions
    .filter(
      (
        reduction,
      ): reduction is NumericalReduction & {
        status: Exclude<NumericalReduction['status'], 'replacementCompleted'>;
      } => reduction.status !== 'replacementCompleted',
    )
    .map((reduction): ActiveDisciplineSanction => {
      const player = reduction.playerId ? playersById.get(reduction.playerId) : undefined;
      return {
        eventId: reduction.eventId,
        team: reduction.team,
        number: player?.number ?? reduction.opponentPlayerNumber,
        name: player?.name,
        source: reduction.source,
        status: reduction.status,
        remainingMs: reduction.remainingMs,
      };
    });
  const bench = {
    home: createBenchItems('home', activeEvents, playersById),
    away: createBenchItems('away', activeEvents, playersById),
  };
  const editableYellowCards = createEditableYellowCards(activeEvents, playersById);

  const hasActivity =
    hasTeamDiscipline(homeTotals) || hasTeamDiscipline(awayTotals) || activeSanctions.length > 0;

  return {
    home: { totals: homeTotals, participants: homeParticipants },
    away: { totals: awayTotals, participants: awayParticipants, unattributedFouls },
    activeSanctions,
    bench,
    editableYellowCards,
    hasActivity,
  };
}

function createEditableYellowCards(
  events: readonly MatchEvent[],
  playersById: ReadonlyMap<string, Player>,
): EditableYellowCardViewItem[] {
  return events
    .flatMap((event): EditableYellowCardViewItem[] => {
      const isHomePlayerYellow =
        ((event.type === 'FOUL' || event.type === 'DISCIPLINE') &&
          event.team === 'home' &&
          event.disciplinaryAction === 'yellow' &&
          Boolean(event.playerId)) ||
        (event.type === 'BENCH_DISCIPLINE' &&
          event.team === 'home' &&
          event.subjectKind === 'player' &&
          event.disciplinaryAction === 'yellow' &&
          Boolean(event.playerId));
      const isOpponentYellow =
        ((event.type === 'FOUL' || event.type === 'DISCIPLINE') &&
          event.team === 'away' &&
          event.disciplinaryAction === 'yellow' &&
          event.opponentPlayerNumber !== undefined) ||
        (event.type === 'BENCH_DISCIPLINE' &&
          event.team === 'away' &&
          event.subjectKind === 'opponentPlayer' &&
          event.disciplinaryAction === 'yellow' &&
          event.opponentPlayerNumber !== undefined);
      if (!isHomePlayerYellow && !isOpponentYellow) return [];
      const playerId = 'playerId' in event ? event.playerId : undefined;
      const player = playerId ? playersById.get(playerId) : undefined;
      if (event.team === 'home' && !player) return [];
      const opponentPlayerNumber =
        'opponentPlayerNumber' in event ? event.opponentPlayerNumber : undefined;
      const foulPlayerId =
        event.type === 'FOUL' ? (event.foulPlayerId ?? event.playerId) : undefined;
      const foulOpponentPlayerNumber =
        event.type === 'FOUL'
          ? (event.foulOpponentPlayerNumber ?? event.opponentPlayerNumber)
          : undefined;
      const foulPlayer = foulPlayerId ? playersById.get(foulPlayerId) : undefined;
      return [
        {
          eventId: event.id,
          team: event.team,
          playerId,
          opponentPlayerNumber,
          number: player?.number ?? opponentPlayerNumber!,
          name: player?.name,
          period: event.period,
          gameClockMs: event.gameClockMs,
          reason:
            event.type === 'FOUL'
              ? 'Asociada a falta'
              : event.reason === 'protest'
                ? 'Protesta'
                : event.reason === 'delayRestart'
                  ? 'Retrasa la reanudación'
                  : 'Otra conducta',
          relatedEventId: event.relatedEventId,
          linkedFoulPlayerId: foulPlayerId,
          linkedFoulOpponentPlayerNumber: foulOpponentPlayerNumber,
          linkedFoulPlayerLabel: foulPlayer
            ? `#${foulPlayer.number} ${foulPlayer.name}`
            : foulOpponentPlayerNumber !== undefined
              ? `rival #${foulOpponentPlayerNumber}`
              : undefined,
        },
      ];
    })
    .reverse();
}

function createBenchItems(
  team: FoulTeam,
  events: readonly MatchEvent[],
  playersById: ReadonlyMap<string, Player>,
): BenchDisciplineViewItem[] {
  return events
    .flatMap((event): BenchDisciplineViewItem[] => {
      if (event.type !== 'BENCH_DISCIPLINE' || event.team !== team) return [];
      const player = event.playerId ? playersById.get(event.playerId) : undefined;
      const label =
        event.subjectKind === 'player'
          ? player
            ? `#${player.number} ${player.name}`
            : 'Jugador'
          : event.subjectKind === 'opponentPlayer'
            ? `#${event.opponentPlayerNumber}`
            : `${staffRoleLabel(event.staffRole)}${event.staffName ? ` · ${event.staffName}` : ''}`;
      return [
        {
          eventId: event.id,
          label,
          sanction: event.disciplinaryAction,
          reason: event.reason,
          countsAsAccumulatedFoul: false,
          sentOff:
            event.disciplinaryAction === 'secondYellow' || event.disciplinaryAction === 'directRed',
        },
      ];
    })
    .reverse();
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
      return 'Otro';
    default:
      return 'Staff';
  }
}

function countBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const itemKey = key(item);
    counts.set(itemKey, (counts.get(itemKey) ?? 0) + 1);
  }
  return counts;
}

function hasDiscipline(participant: DisciplineParticipantSummary): boolean {
  return participant.fouls > 0 || participant.yellowCards > 0 || participant.sendOffs > 0;
}

function hasTeamDiscipline(statistics: TeamDisciplineStatistics): boolean {
  return statistics.fouls > 0 || statistics.yellowCards > 0 || statistics.sendOffs > 0;
}

function compareParticipants(
  left: DisciplineParticipantSummary,
  right: DisciplineParticipantSummary,
): number {
  return (
    Number(right.sentOff) - Number(left.sentOff) ||
    right.yellowCards - left.yellowCards ||
    right.fouls - left.fouls ||
    left.number - right.number
  );
}
