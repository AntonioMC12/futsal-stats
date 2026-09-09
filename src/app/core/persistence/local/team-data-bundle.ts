import {
  LocalMatchEventRecord,
  LocalMatchRecord,
  LocalPlayerRecord,
  LocalPlayerProfileRecord,
  LocalTeamRecord,
} from './local-records';
import { FutsalStatsDb } from './futsal-stats.db';

export interface TeamDataBundle {
  team: LocalTeamRecord;
  players: LocalPlayerRecord[];
  profiles: LocalPlayerProfileRecord[];
  matches: LocalMatchRecord[];
  events: LocalMatchEventRecord[];
}

export async function loadTeamDataBundle(
  db: FutsalStatsDb,
  teamId: string,
): Promise<TeamDataBundle | null> {
  const team = await db.teams.get(teamId);
  if (!team) return null;
  const [players, profiles, matches] = await Promise.all([
    db.players.where('teamId').equals(teamId).toArray(),
    db.playerProfiles.where('teamId').equals(teamId).toArray(),
    db.matches.where('teamId').equals(teamId).toArray(),
  ]);
  const matchIds = matches.map(({ id }) => id);
  const events =
    matchIds.length === 0 ? [] : await db.events.where('matchId').anyOf(matchIds).toArray();
  return normalizeBundle({ team, players, profiles, matches, events });
}

export function serializeTeamDataBundle(bundle: TeamDataBundle): string {
  return JSON.stringify(normalizeBundle(bundle));
}

export function deserializeTeamDataBundle(serialized: string): TeamDataBundle {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value) || !isRecord(value['team'])) {
    throw new Error('Invalid Team data bundle');
  }
  const players = value['players'];
  const profiles = value['profiles'] ?? [];
  const matches = value['matches'];
  const events = value['events'];
  if (
    !Array.isArray(players) ||
    !Array.isArray(profiles) ||
    !Array.isArray(matches) ||
    !Array.isArray(events)
  ) {
    throw new Error('Invalid Team data bundle collections');
  }

  const bundle = { ...value, profiles } as unknown as TeamDataBundle;
  validateBundleRelationships(bundle);
  return normalizeBundle(bundle);
}

function normalizeBundle(bundle: TeamDataBundle): TeamDataBundle {
  return {
    team: bundle.team,
    players: [...bundle.players].sort(compareById),
    profiles: [...bundle.profiles].sort((left, right) =>
      left.playerId.localeCompare(right.playerId),
    ),
    matches: [...bundle.matches].sort(compareById),
    events: [...bundle.events].sort(
      (left, right) =>
        left.matchId.localeCompare(right.matchId) ||
        left.sequence - right.sequence ||
        left.timestamp - right.timestamp ||
        left.id.localeCompare(right.id),
    ),
  };
}

function validateBundleRelationships(bundle: TeamDataBundle): void {
  if (typeof bundle.team.id !== 'string') throw new Error('Invalid Team ID in data bundle');
  const playerIds = new Set(bundle.players.map(({ id }) => id));
  const matchIds = new Set(bundle.matches.map(({ id }) => id));
  if (bundle.players.some(({ teamId }) => teamId !== bundle.team.id)) {
    throw new Error('Team data bundle contains a foreign Player');
  }
  if (
    bundle.profiles.some(
      ({ teamId, playerId }) => teamId !== bundle.team.id || !playerIds.has(playerId),
    )
  ) {
    throw new Error('Team data bundle contains an invalid PlayerProfile');
  }
  for (const match of bundle.matches) {
    if (
      match.teamId !== bundle.team.id ||
      match.squadPlayerIds.some((id) => !playerIds.has(id)) ||
      match.startingLineupPlayerIds.some((id) => !playerIds.has(id))
    ) {
      throw new Error('Team data bundle contains invalid Match relationships');
    }
  }
  if (bundle.events.some(({ matchId }) => !matchIds.has(matchId))) {
    throw new Error('Team data bundle contains an orphan MatchEvent');
  }
}

function compareById(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
