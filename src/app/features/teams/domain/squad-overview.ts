import { Match, isMatchFinished, matchSeason } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { PlayerProfile } from '../../../shared/models/player-profile';
import { deriveMatchStatistics } from '../../live-match/domain/match-statistics';

export type SquadStatusFilter = 'all' | 'active' | 'inactive';
export type SquadSort = 'number' | 'name' | 'minutes' | 'matches' | 'goals';
export interface SquadMatchRecord {
  match: Match;
  events: readonly MatchEvent[];
}
export interface SquadPlayerSummary {
  playerId: string;
  number: number;
  name: string;
  position: string | null;
  active: boolean;
  photoRef?: PlayerProfile['photoRef'];
  legacyPhotoUrl?: string;
  matchesPlayed: number;
  starts: number;
  playedMs: number;
  goals: number;
  plusMinus: number;
  averageMinutesPerMatch: number;
}
export interface SquadOverview {
  players: SquadPlayerSummary[];
  activePlayers: number;
  totalPlayers: number;
  matches: number;
  playedMs: number;
  goals: number;
  seasons: string[];
}

export function buildSquadOverview(
  players: readonly Player[],
  profiles: readonly PlayerProfile[],
  records: readonly SquadMatchRecord[],
  season = 'all',
): SquadOverview {
  const profileByPlayer = new Map(profiles.map((profile) => [profile.playerId, profile]));
  const finished = records.filter(({ match }) => isMatchFinished(match));
  const selected =
    season === 'all' ? finished : finished.filter(({ match }) => matchSeason(match) === season);
  const totals = new Map(
    players.map((player) => [
      player.id,
      { matches: 0, starts: 0, playedMs: 0, goals: 0, plusMinus: 0 },
    ]),
  );
  for (const { match, events } of selected) {
    const statistics = deriveMatchStatistics(match, events, match.clock.remainingMs).players;
    for (const playerId of match.squadPlayerIds) {
      const total = totals.get(playerId);
      if (!total) continue;
      const item = statistics[playerId];
      const appeared =
        (item?.playedMs ?? 0) > 0 ||
        (item?.entries ?? 0) > 0 ||
        match.startingLineupPlayerIds.includes(playerId);
      total.matches += Number(appeared);
      total.starts += Number(match.startingLineupPlayerIds.includes(playerId));
      total.playedMs += item?.playedMs ?? 0;
      total.goals += item?.goals ?? 0;
      total.plusMinus += item?.plusMinus ?? 0;
    }
  }
  const summaries = players.map((player) => {
    const total = totals.get(player.id)!;
    const profile = profileByPlayer.get(player.id);
    return {
      playerId: player.id,
      number: player.number,
      name: player.name,
      position: player.position ?? null,
      active: player.active,
      photoRef: profile?.photoRef,
      legacyPhotoUrl: profile?.photoUrl,
      matchesPlayed: total.matches,
      starts: total.starts,
      playedMs: total.playedMs,
      goals: total.goals,
      plusMinus: total.plusMinus,
      averageMinutesPerMatch: total.matches ? total.playedMs / 60_000 / total.matches : 0,
    } satisfies SquadPlayerSummary;
  });
  return {
    players: summaries,
    activePlayers: players.filter(({ active }) => active).length,
    totalPlayers: players.length,
    matches: selected.length,
    playedMs: summaries.reduce((sum, item) => sum + item.playedMs, 0),
    goals: summaries.reduce((sum, item) => sum + item.goals, 0),
    seasons: [...new Set(finished.map(({ match }) => matchSeason(match)))].sort((a, b) =>
      b.localeCompare(a, 'es'),
    ),
  };
}

export function filterAndSortSquad(
  players: readonly SquadPlayerSummary[],
  search: string,
  status: SquadStatusFilter,
  position: string,
  sort: SquadSort,
): SquadPlayerSummary[] {
  const term = search.trim().toLocaleLowerCase('es');
  return players
    .filter(
      (player) =>
        (!term ||
          player.name.toLocaleLowerCase('es').includes(term) ||
          String(player.number).includes(term)) &&
        (status === 'all' || player.active === (status === 'active')) &&
        (!position || player.position === position),
    )
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'es');
      if (sort === 'minutes') return b.playedMs - a.playedMs || a.number - b.number;
      if (sort === 'matches') return b.matchesPlayed - a.matchesPlayed || a.number - b.number;
      if (sort === 'goals') return b.goals - a.goals || a.number - b.number;
      return a.number - b.number || a.name.localeCompare(b.name, 'es');
    });
}
