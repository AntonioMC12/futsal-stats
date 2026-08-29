import { FoulEvent, FoulTeam, MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import {
  DisciplinaryState,
  NumericalReduction,
  PlayerDisciplineStatistics,
  TeamDisciplineStatistics,
} from './discipline';
import { selectActiveEvents } from './derived-match-state';

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

export interface DisciplineViewModel {
  home: DisciplineSideView;
  away: DisciplineSideView & { unattributedFouls: number };
  activeSanctions: ActiveDisciplineSanction[];
  hasActivity: boolean;
}

export function createDisciplineView(
  state: DisciplinaryState,
  players: readonly Player[],
  events: readonly MatchEvent[],
  currentPeriod: number,
): DisciplineViewModel {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const currentFouls = selectActiveEvents(events).filter(
    (event): event is FoulEvent =>
      event.type === 'FOUL' && event.period === currentPeriod && event.accumulated !== false,
  );
  const homeFoulsByPlayer = countBy(
    currentFouls.filter((event) => event.team === 'home' && event.playerId),
    (event) => event.playerId!,
  );
  const awayFoulsByNumber = countBy(
    currentFouls.filter(
      (event) => event.team === 'away' && event.opponentPlayerNumber !== undefined,
    ),
    (event) => event.opponentPlayerNumber!,
  );
  const homeTotals = {
    ...state.teams.home,
    fouls: currentFouls.filter((event) => event.team === 'home').length,
  };
  const awayTotals = {
    ...state.teams.away,
    fouls: currentFouls.filter((event) => event.team === 'away').length,
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
        ordinaryYellowCards: Math.max(
          0,
          statistics.yellowCards - statistics.secondYellowSendOffs,
        ),
      };
      return hasDiscipline(participant) ? [participant] : [];
    })
    .sort(compareParticipants);

  const awayParticipants = state.opponentPlayers
    .map(
      (participant): DisciplineParticipantSummary => ({
        id: `opponent-${participant.jerseyNumber}`,
        number: participant.jerseyNumber,
        fouls: awayFoulsByNumber.get(participant.jerseyNumber) ?? 0,
        yellowCards: participant.yellowCards,
        secondYellowSendOffs: participant.secondYellowSendOffs,
        directRedCards: participant.directRedCards,
        sendOffs: participant.sendOffs,
        sentOff: participant.sentOff,
        ordinaryYellowCards: Math.max(
          0,
          participant.yellowCards - participant.secondYellowSendOffs,
        ),
      }),
    )
    .filter(hasDiscipline)
    .sort(compareParticipants);

  const unattributedFouls = currentFouls.filter(
    (event) => event.team === 'away' && event.opponentPlayerNumber === undefined,
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

  const hasActivity =
    hasTeamDiscipline(homeTotals) ||
    hasTeamDiscipline(awayTotals) ||
    activeSanctions.length > 0;

  return {
    home: { totals: homeTotals, participants: homeParticipants },
    away: { totals: awayTotals, participants: awayParticipants, unattributedFouls },
    activeSanctions,
    hasActivity,
  };
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
