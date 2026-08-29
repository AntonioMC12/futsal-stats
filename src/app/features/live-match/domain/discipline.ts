import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import {
  DisciplinaryAction,
  FoulTeam,
  MatchEvent,
  RedCardReplacementEvent,
} from '../../../shared/models/match-event';
import { selectActiveEvents } from './derived-match-state';

export const NUMERICAL_REDUCTION_DURATION_MS = 120_000;

export interface PlayerDisciplineStatistics {
  fouls: number;
  yellowCards: number;
  secondYellowSendOffs: number;
  directRedCards: number;
  sendOffs: number;
}

export interface TeamDisciplineStatistics {
  fouls: number;
  yellowCards: number;
  secondYellowSendOffs: number;
  directRedCards: number;
  sendOffs: number;
}

export interface OpponentPlayerDisciplineStatistics extends PlayerDisciplineStatistics {
  jerseyNumber: number;
  sentOff: boolean;
}

export interface NumericalReduction {
  eventId: string;
  team: FoulTeam;
  playerId?: string;
  opponentPlayerNumber?: number;
  source: 'secondYellow' | 'directRed';
  startedAtMatchElapsedMs: number;
  status: 'active' | 'replacementAllowed' | 'replacementCompleted';
  remainingMs: number;
  releasedReason?: 'twoMinutes' | 'opponentGoal';
  replacementPlayerId?: string;
}

export interface DisciplinaryState {
  players: Readonly<Record<string, PlayerDisciplineStatistics>>;
  opponentPlayers: OpponentPlayerDisciplineStatistics[];
  teams: Readonly<Record<FoulTeam, TeamDisciplineStatistics>>;
  sentOffPlayerIds: string[];
  reductions: NumericalReduction[];
  goalReleaseEventIds: ReadonlySet<string>;
  onCourtPlayerCounts: Readonly<Record<FoulTeam, number>>;
}

export function deriveDisciplinaryState(
  events: readonly MatchEvent[],
  currentMatchElapsedMs: number,
): DisciplinaryState {
  const players: Record<string, PlayerDisciplineStatistics> = {};
  const teams: Record<FoulTeam, TeamDisciplineStatistics> = {
    home: emptyStatistics(),
    away: emptyStatistics(),
  };
  const sentOffPlayerIds = new Set<string>();
  const opponentPlayers = new Map<number, OpponentPlayerDisciplineStatistics>();
  const reductions: NumericalReduction[] = [];
  const goalReleaseEventIds = new Set<string>();

  const releaseExpired = (elapsedMs: number): void => {
    for (const reduction of reductions) {
      if (
        reduction.status === 'active' &&
        elapsedMs - reduction.startedAtMatchElapsedMs >= NUMERICAL_REDUCTION_DURATION_MS
      ) {
        reduction.status = 'replacementAllowed';
        reduction.remainingMs = 0;
        reduction.releasedReason = 'twoMinutes';
      }
    }
  };

  for (const event of selectActiveEvents(events)) {
    if (event.type === 'FOUL') {
      const action = event.disciplinaryAction ?? 'none';
      if (event.accumulated !== false) {
        teams[event.team].fouls += 1;
      }
      if (event.team === 'home' && event.playerId) {
        const player = (players[event.playerId] ??= emptyStatistics());
        if (event.accumulated !== false) player.fouls += 1;
        applyAction(player, action);
      }
      if (event.team === 'away' && event.opponentPlayerNumber !== undefined) {
        const opponent = ensureOpponentPlayer(opponentPlayers, event.opponentPlayerNumber);
        if (event.accumulated !== false) opponent.fouls += 1;
        applyAction(opponent, action);
        if (isSendOff(action)) opponent.sentOff = true;
      }
      applyAction(teams[event.team], action);
      if (isSendOff(action)) {
        if (event.team === 'home' && event.playerId) sentOffPlayerIds.add(event.playerId);
        reductions.push({
          eventId: event.id,
          team: event.team,
          playerId: event.playerId,
          opponentPlayerNumber: event.opponentPlayerNumber,
          source: action,
          startedAtMatchElapsedMs: event.matchElapsedMs ?? 0,
          status: 'active',
          remainingMs: NUMERICAL_REDUCTION_DURATION_MS,
        });
      }
      continue;
    }

    if (event.type === 'GOAL_FOR' || event.type === 'GOAL_AGAINST') {
      releaseExpired(event.matchElapsedMs ?? 0);
      const scoringTeam: FoulTeam = event.type === 'GOAL_FOR' ? 'home' : 'away';
      const concedingTeam: FoulTeam = scoringTeam === 'home' ? 'away' : 'home';
      const counts = playerCounts(reductions);
      if (counts[scoringTeam] > counts[concedingTeam]) {
        const reduction = reductions.find(
          (item) => item.team === concedingTeam && item.status === 'active',
        );
        if (reduction) {
          reduction.status = 'replacementAllowed';
          reduction.remainingMs = 0;
          reduction.releasedReason = 'opponentGoal';
          goalReleaseEventIds.add(event.id);
        }
      }
      continue;
    }

    if (event.type === 'RED_CARD_REPLACEMENT') {
      releaseExpired(event.matchElapsedMs);
      const reduction = reductions.find(
        (item) => item.eventId === event.reductionEventId && item.team === event.team,
      );
      if (reduction?.status === 'replacementAllowed') {
        reduction.status = 'replacementCompleted';
        reduction.replacementPlayerId = event.playerId;
      }
    }
  }

  releaseExpired(currentMatchElapsedMs);
  for (const reduction of reductions) {
    if (reduction.status === 'active') {
      reduction.remainingMs = Math.max(
        0,
        NUMERICAL_REDUCTION_DURATION_MS -
          (currentMatchElapsedMs - reduction.startedAtMatchElapsedMs),
      );
    }
  }

  return {
    players,
    opponentPlayers: [...opponentPlayers.values()].sort(
      (left, right) => left.jerseyNumber - right.jerseyNumber,
    ),
    teams,
    sentOffPlayerIds: [...sentOffPlayerIds],
    reductions,
    goalReleaseEventIds,
    onCourtPlayerCounts: playerCounts(reductions),
  };
}

export interface RegisterReplacementInput {
  match: Match;
  reduction: NumericalReduction | undefined;
  currentLineupPlayerIds: readonly string[];
  sentOffPlayerIds: readonly string[];
  playerId?: string;
  gameClockMs: number;
  matchElapsedMs: number;
  timestamp: number;
  sequence: number;
  eventId: string;
}

export function registerRedCardReplacement(
  input: RegisterReplacementInput,
): DomainResult<{ match: Match; event: RedCardReplacementEvent }> {
  const reduction = input.reduction;
  if (!reduction || reduction.status !== 'replacementAllowed') {
    return fail('La reposición todavía no está disponible.');
  }
  if (reduction.team === 'home') {
    if (!input.playerId) return fail('Selecciona el jugador que entra en pista.');
    if (!input.match.squadPlayerIds.includes(input.playerId)) {
      return fail('El jugador de reposición no está convocado.');
    }
    if (input.currentLineupPlayerIds.includes(input.playerId)) {
      return fail('El jugador de reposición ya está en pista.');
    }
    if (input.sentOffPlayerIds.includes(input.playerId)) {
      return fail('Un jugador expulsado no puede volver a entrar.');
    }
  } else if (input.playerId) {
    return fail('La reposición rival no requiere seleccionar un jugador.');
  }

  return ok({
    match: { ...input.match, updatedAt: input.timestamp },
    event: {
      id: input.eventId,
      matchId: input.match.id,
      type: 'RED_CARD_REPLACEMENT',
      team: reduction.team,
      reductionEventId: reduction.eventId,
      playerId: input.playerId,
      period: input.match.currentPeriod,
      gameClockMs: input.gameClockMs,
      matchElapsedMs: input.matchElapsedMs,
      timestamp: input.timestamp,
      sequence: input.sequence,
      undone: false,
    },
  });
}

function emptyStatistics(): PlayerDisciplineStatistics {
  return { fouls: 0, yellowCards: 0, secondYellowSendOffs: 0, directRedCards: 0, sendOffs: 0 };
}

function ensureOpponentPlayer(
  players: Map<number, OpponentPlayerDisciplineStatistics>,
  jerseyNumber: number,
): OpponentPlayerDisciplineStatistics {
  const existing = players.get(jerseyNumber);
  if (existing) return existing;
  const created = { ...emptyStatistics(), jerseyNumber, sentOff: false };
  players.set(jerseyNumber, created);
  return created;
}

function applyAction(
  statistics: PlayerDisciplineStatistics | TeamDisciplineStatistics,
  action: DisciplinaryAction,
): void {
  if (action === 'yellow' || action === 'secondYellow') statistics.yellowCards += 1;
  if (action === 'secondYellow') statistics.secondYellowSendOffs += 1;
  if (action === 'directRed') statistics.directRedCards += 1;
  if (isSendOff(action)) statistics.sendOffs += 1;
}

function isSendOff(action: DisciplinaryAction): action is 'secondYellow' | 'directRed' {
  return action === 'secondYellow' || action === 'directRed';
}

function playerCounts(reductions: readonly NumericalReduction[]): Record<FoulTeam, number> {
  const outstanding = (team: FoulTeam) =>
    reductions.filter((item) => item.team === team && item.status !== 'replacementCompleted')
      .length;
  return {
    home: Math.max(0, 5 - outstanding('home')),
    away: Math.max(0, 5 - outstanding('away')),
  };
}
