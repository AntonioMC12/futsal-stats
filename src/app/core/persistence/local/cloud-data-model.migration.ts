import { Transaction } from 'dexie';
import {
  APAGA_LEGACY_ID_REPLACEMENTS,
  LEGACY_APAGA_TEAM_ID,
} from '../../initialization/built-in-teams';
import { createId, isUuid } from '../../utils/id';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import {
  LocalMatchEventRecord,
  LocalMatchRecord,
  LocalPlayerRecord,
  LocalTeamRecord,
} from './local-records';
import { INITIAL_REVISION, LOCAL_ONLY_SYNC_STATUS } from './sync-metadata';

type LegacyMatch = Omit<Match, 'teamId'> & { teamId?: string };

export async function migrateToCloudDataModel(transaction: Transaction): Promise<void> {
  const teamsTable = transaction.table<LegacyTeam, string>('teams');
  const playersTable = transaction.table<LegacyPlayer, string>('players');
  const matchesTable = transaction.table<LegacyMatch, string>('matches');
  const eventsTable = transaction.table<MatchEvent, string>('events');
  const [teams, players, matches, events] = await Promise.all([
    teamsTable.toArray(),
    playersTable.toArray(),
    matchesTable.toArray(),
    eventsTable.toArray(),
  ]);

  const claimedIds = new Set<string>();
  const teamIds = createIdMap(
    teams.map(({ id }) => id),
    claimedIds,
    (id) => (id === LEGACY_APAGA_TEAM_ID ? APAGA_LEGACY_ID_REPLACEMENTS[id] : undefined),
  );
  const playerIds = createIdMap(
    players.map(({ id }) => id),
    claimedIds,
    (id) => APAGA_LEGACY_ID_REPLACEMENTS[id],
  );
  const matchIds = createIdMap(
    matches.map(({ id }) => id),
    claimedIds,
  );
  const eventIds = createIdMap(
    events.map(({ id }) => id),
    claimedIds,
  );

  const migratedTeams = teams.map((team): LocalTeamRecord => {
    const createdAt = timestampOr(team.createdAt, team.updatedAt);
    const updatedAt = timestampOr(team.updatedAt, createdAt);
    return {
      ...team,
      id: requiredMappedId(teamIds, team.id, 'Team'),
      ...initialSyncMetadata(createdAt, updatedAt),
    };
  });
  const teamsByOldId = new Map(teams.map((team) => [team.id, team]));

  const migratedPlayers = players.map((player): LocalPlayerRecord => {
    const owner = teamsByOldId.get(player.teamId);
    if (!owner)
      throw migrationError(`Player ${player.id} references missing Team ${player.teamId}`);
    const createdAt = timestampOr(owner.createdAt, owner.updatedAt);
    const updatedAt = timestampOr(owner.updatedAt, createdAt);
    return {
      ...player,
      id: requiredMappedId(playerIds, player.id, 'Player'),
      teamId: requiredMappedId(teamIds, player.teamId, 'Team'),
      ...initialSyncMetadata(createdAt, updatedAt),
    };
  });

  const migratedMatches = matches.map((match): LocalMatchRecord => {
    const legacyTeamId = match.teamId ?? match.homeTeam.id;
    if (!legacyTeamId || !teamsByOldId.has(legacyTeamId)) {
      throw migrationError(`Match ${match.id} has no valid owning Team`);
    }
    const createdAt = timestampOr(match.createdAt, match.date);
    const updatedAt = timestampOr(match.updatedAt, createdAt);
    return {
      ...match,
      id: requiredMappedId(matchIds, match.id, 'Match'),
      teamId: requiredMappedId(teamIds, legacyTeamId, 'Team'),
      homeTeam: {
        ...match.homeTeam,
        id: requiredMappedId(teamIds, legacyTeamId, 'Team'),
      },
      squadPlayerIds: match.squadPlayerIds.map((id) => requiredMappedId(playerIds, id, 'Player')),
      startingLineupPlayerIds: match.startingLineupPlayerIds.map((id) =>
        requiredMappedId(playerIds, id, 'Player'),
      ),
      ...initialSyncMetadata(createdAt, updatedAt),
    };
  });

  const migratedEvents = events.map((event): LocalMatchEventRecord => {
    const rewritten = rewriteEvent(event, matchIds, playerIds, eventIds);
    return {
      ...rewritten,
      ...initialSyncMetadata(event.timestamp, event.timestamp),
    };
  });

  validateMigratedRecords(migratedTeams, migratedPlayers, migratedMatches, migratedEvents);

  await Promise.all([
    teamsTable.clear(),
    playersTable.clear(),
    matchesTable.clear(),
    eventsTable.clear(),
  ]);
  await transaction.table<LocalTeamRecord, string>('teams').bulkPut(migratedTeams);
  await transaction.table<LocalPlayerRecord, string>('players').bulkPut(migratedPlayers);
  await transaction.table<LocalMatchRecord, string>('matches').bulkPut(migratedMatches);
  await transaction.table<LocalMatchEventRecord, string>('events').bulkPut(migratedEvents);
}

function validateMigratedRecords(
  teams: readonly LocalTeamRecord[],
  players: readonly LocalPlayerRecord[],
  matches: readonly LocalMatchRecord[],
  events: readonly LocalMatchEventRecord[],
): void {
  const teamIds = new Set(teams.map(({ id }) => id));
  const playersById = new Map(players.map((player) => [player.id, player]));
  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const eventsById = new Map(events.map((event) => [event.id, event]));

  for (const player of players) {
    if (!teamIds.has(player.teamId)) {
      throw migrationError(`Player ${player.id} has an orphan Team`);
    }
  }
  for (const match of matches) {
    if (!teamIds.has(match.teamId) || match.homeTeam.id !== match.teamId) {
      throw migrationError(`Match ${match.id} has invalid Team ownership`);
    }
    const squadIds = new Set(match.squadPlayerIds);
    if (
      match.squadPlayerIds.some((id) => playersById.get(id)?.teamId !== match.teamId) ||
      match.startingLineupPlayerIds.some((id) => !squadIds.has(id))
    ) {
      throw migrationError(`Match ${match.id} has invalid Player snapshots`);
    }
  }
  for (const event of events) {
    const match = matchesById.get(event.matchId);
    if (!match) throw migrationError(`MatchEvent ${event.id} has an orphan Match`);
    const squadIds = new Set(match.squadPlayerIds);
    if (referencedPlayerIds(event).some((id) => !squadIds.has(id))) {
      throw migrationError(`MatchEvent ${event.id} has a Player outside its Match squad`);
    }
    for (const referencedEventId of referencedEventIds(event)) {
      if (eventsById.get(referencedEventId)?.matchId !== event.matchId) {
        throw migrationError(`MatchEvent ${event.id} has an invalid event reference`);
      }
    }
  }
}

function referencedPlayerIds(event: MatchEvent): string[] {
  switch (event.type) {
    case 'PLAYER_ENTERED':
    case 'PLAYER_LEFT':
      return [event.playerId];
    case 'SUBSTITUTION':
      return [event.outPlayerId, event.inPlayerId];
    case 'FOUL':
    case 'BENCH_DISCIPLINE':
    case 'RED_CARD_REPLACEMENT':
      return event.playerId ? [event.playerId] : [];
    case 'GOAL_FOR':
      return event.scorerPlayerId
        ? [event.scorerPlayerId, ...event.lineupPlayerIds]
        : [...event.lineupPlayerIds];
    case 'GOAL_AGAINST':
      return [...event.lineupPlayerIds];
    default:
      return [];
  }
}

function referencedEventIds(event: MatchEvent): string[] {
  if (event.type === 'EVENT_UNDONE') return [event.targetEventId];
  if (event.type === 'RED_CARD_REPLACEMENT') return [event.reductionEventId];
  return [];
}

function rewriteEvent(
  event: MatchEvent,
  matchIds: ReadonlyMap<string, string>,
  playerIds: ReadonlyMap<string, string>,
  eventIds: ReadonlyMap<string, string>,
): MatchEvent {
  const id = requiredMappedId(eventIds, event.id, 'MatchEvent');
  const matchId = requiredMappedId(matchIds, event.matchId, 'Match');
  switch (event.type) {
    case 'PLAYER_ENTERED':
    case 'PLAYER_LEFT':
      return {
        ...event,
        id,
        matchId,
        playerId: requiredMappedId(playerIds, event.playerId, 'Player'),
      };
    case 'SUBSTITUTION':
      return {
        ...event,
        id,
        matchId,
        outPlayerId: requiredMappedId(playerIds, event.outPlayerId, 'Player'),
        inPlayerId: requiredMappedId(playerIds, event.inPlayerId, 'Player'),
      };
    case 'FOUL':
    case 'BENCH_DISCIPLINE':
      return {
        ...event,
        id,
        matchId,
        playerId: optionalMappedId(playerIds, event.playerId, 'Player'),
      };
    case 'RED_CARD_REPLACEMENT':
      return {
        ...event,
        id,
        matchId,
        reductionEventId: requiredMappedId(eventIds, event.reductionEventId, 'MatchEvent'),
        playerId: optionalMappedId(playerIds, event.playerId, 'Player'),
      };
    case 'GOAL_FOR':
      return {
        ...event,
        id,
        matchId,
        scorerPlayerId: optionalMappedId(playerIds, event.scorerPlayerId, 'Player'),
        lineupPlayerIds: event.lineupPlayerIds.map((id) =>
          requiredMappedId(playerIds, id, 'Player'),
        ),
      };
    case 'GOAL_AGAINST':
      return {
        ...event,
        id,
        matchId,
        lineupPlayerIds: event.lineupPlayerIds.map((id) =>
          requiredMappedId(playerIds, id, 'Player'),
        ),
      };
    case 'EVENT_UNDONE':
      return {
        ...event,
        id,
        matchId,
        targetEventId: requiredMappedId(eventIds, event.targetEventId, 'MatchEvent'),
      };
    default:
      return { ...event, id, matchId };
  }
}

function createIdMap(
  ids: readonly string[],
  claimedIds: Set<string>,
  fixedReplacement: (id: string) => string | undefined = () => undefined,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const id of ids) {
    const preferred = isUuid(id) ? id : fixedReplacement(id);
    const replacement = preferred ?? generateUniqueId(claimedIds);
    if (claimedIds.has(replacement)) {
      throw migrationError(`Duplicate global entity ID ${replacement}`);
    }
    claimedIds.add(replacement);
    result.set(id, replacement);
  }
  return result;
}

function generateUniqueId(claimedIds: ReadonlySet<string>): string {
  let id = createId();
  while (claimedIds.has(id)) id = createId();
  return id;
}

function requiredMappedId(
  ids: ReadonlyMap<string, string>,
  legacyId: string,
  entityName: string,
): string {
  const id = ids.get(legacyId);
  if (!id) throw migrationError(`${entityName} reference ${legacyId} is orphaned`);
  return id;
}

function optionalMappedId(
  ids: ReadonlyMap<string, string>,
  legacyId: string | undefined,
  entityName: string,
): string | undefined {
  return legacyId === undefined ? undefined : requiredMappedId(ids, legacyId, entityName);
}

function timestampOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function initialSyncMetadata(createdAt: number, updatedAt: number) {
  return {
    createdAt,
    updatedAt,
    deletedAt: null,
    revision: INITIAL_REVISION,
    syncStatus: LOCAL_ONLY_SYNC_STATUS,
  } as const;
}

function migrationError(message: string): Error {
  return new Error(`Cloud data model migration aborted: ${message}`);
}

interface LegacyTeam extends Team {}
interface LegacyPlayer extends Player {}
