import { Match, MatchDate } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';

type JsonRecord = Record<string, unknown>;

export function teamFromCloud(row: JsonRecord): Team {
  return {
    id: string(row['id']),
    seedKey: optionalString(row['seed_key']),
    name: string(row['name']),
    shortName: string(row['short_name']),
    logo: optionalString(row['logo']),
    createdAt: timestamp(row['created_at']),
    updatedAt: timestamp(row['updated_at']),
  };
}

export function teamToCloud(team: Team): JsonRecord {
  return {
    id: team.id,
    seed_key: team.seedKey ?? null,
    name: team.name,
    short_name: team.shortName,
    logo: team.logo ?? null,
    created_at: iso(team.createdAt),
    updated_at: iso(team.updatedAt),
  };
}

export function playerFromCloud(row: JsonRecord): Player {
  return {
    id: string(row['id']),
    teamId: string(row['team_id']),
    number: number(row['number']),
    name: string(row['name']),
    position: optionalString(row['position']),
    active: Boolean(row['active']),
  };
}

export function playerToCloud(player: Player): JsonRecord {
  return {
    id: player.id,
    team_id: player.teamId,
    number: player.number,
    name: player.name,
    position: player.position ?? null,
    active: player.active,
  };
}

export function matchFromCloud(row: JsonRecord): Match {
  const memberships = (row['match_players'] as JsonRecord[] | null) ?? [];
  return {
    id: string(row['id']),
    teamId: string(row['team_id']),
    homeTeam: {
      id: string(row['team_id']),
      name: string(row['home_team_name']),
      shortName: string(row['home_team_short_name']),
    },
    awayTeam: { name: string(row['opponent_name']), shortName: string(row['opponent_short_name']) },
    date: dateFromCloud(row['match_date']),
    season: optionalString(row['season']) ?? undefined,
    competition: optionalString(row['competition']) ?? undefined,
    description: optionalString(row['description']) ?? '',
    status: row['status'] as Match['status'],
    currentPeriod: number(row['current_period']),
    periodCount: number(row['period_count']),
    clock: row['clock'] as Match['clock'],
    squadPlayerIds: memberships
      .filter((item) => Boolean(item['in_squad']))
      .map((item) => string(item['player_id'])),
    startingLineupPlayerIds: memberships
      .filter((item) => Boolean(item['is_starter']))
      .map((item) => string(item['player_id'])),
    createdAt: timestamp(row['created_at']),
    updatedAt: timestamp(row['updated_at']),
  };
}

export function matchToCloud(match: Match): JsonRecord {
  return {
    id: match.id,
    team_id: match.teamId,
    home_team_name: match.homeTeam.name,
    home_team_short_name: match.homeTeam.shortName,
    opponent_name: match.awayTeam.name,
    opponent_short_name: match.awayTeam.shortName,
    match_date: dateToCloud(match.date),
    season: match.season ?? null,
    competition: match.competition ?? null,
    description: match.description,
    status: match.status,
    current_period: match.currentPeriod,
    period_count: match.periodCount,
    clock: match.clock,
    squad_player_ids: match.squadPlayerIds,
    starting_lineup_player_ids: match.startingLineupPlayerIds,
    created_at: iso(match.createdAt),
    updated_at: iso(match.updatedAt),
  };
}

export function eventFromCloud(row: JsonRecord): MatchEvent {
  const metadata = (row['metadata'] as JsonRecord | null) ?? {};
  const lineup = ((row['match_event_lineup_players'] as JsonRecord[] | null) ?? [])
    .sort((left, right) => number(left['position']) - number(right['position']))
    .map((item) => string(item['player_id']));
  return {
    ...metadata,
    id: string(row['id']),
    matchId: string(row['match_id']),
    type: row['event_type'],
    period: number(row['period']),
    gameClockMs: number(row['game_clock_ms']),
    sequence: number(row['sequence']),
    timestamp: timestamp(row['occurred_at']),
    undone: Boolean(row['undone']),
    ...(row['player_id'] ? { playerId: string(row['player_id']) } : {}),
    ...(row['out_player_id'] ? { outPlayerId: string(row['out_player_id']) } : {}),
    ...(row['in_player_id'] ? { inPlayerId: string(row['in_player_id']) } : {}),
    ...(row['target_event_id'] ? { targetEventId: string(row['target_event_id']) } : {}),
    ...(row['reduction_event_id'] ? { reductionEventId: string(row['reduction_event_id']) } : {}),
    ...(['GOAL_FOR', 'GOAL_AGAINST'].includes(string(row['event_type']))
      ? { lineupPlayerIds: lineup }
      : {}),
  } as MatchEvent;
}

export function eventToCloud(event: MatchEvent): JsonRecord {
  const source = event as unknown as JsonRecord;
  const reserved = new Set([
    'id',
    'matchId',
    'type',
    'period',
    'gameClockMs',
    'sequence',
    'timestamp',
    'undone',
    'playerId',
    'outPlayerId',
    'inPlayerId',
    'targetEventId',
    'reductionEventId',
    'lineupPlayerIds',
  ]);
  const metadata = Object.fromEntries(Object.entries(source).filter(([key]) => !reserved.has(key)));
  return {
    id: event.id,
    match_id: event.matchId,
    event_type: event.type,
    period: event.period,
    game_clock_ms: event.gameClockMs,
    sequence: event.sequence,
    occurred_at: iso(event.timestamp),
    undone: event.undone,
    player_id: source['playerId'] ?? null,
    out_player_id: source['outPlayerId'] ?? null,
    in_player_id: source['inPlayerId'] ?? null,
    target_event_id: source['targetEventId'] ?? null,
    reduction_event_id: source['reductionEventId'] ?? null,
    lineup_player_ids: source['lineupPlayerIds'] ?? [],
    metadata,
  };
}

function dateToCloud(value: MatchDate): string {
  return typeof value === 'number' ? iso(value) : `${value}T12:00:00.000Z`;
}

function dateFromCloud(value: unknown): string {
  return string(value).slice(0, 10);
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

function timestamp(value: unknown): number {
  return new Date(string(value)).getTime();
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}
