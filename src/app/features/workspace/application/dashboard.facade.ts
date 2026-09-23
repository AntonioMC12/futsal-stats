import { inject, Injectable } from '@angular/core';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import {
  isMatchFinished,
  Match,
  matchDateTimestamp,
  matchSeason,
} from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { deriveMatchState, selectActiveEvents } from '../../live-match/domain/derived-match-state';
import { deriveMatchStatistics } from '../../live-match/domain/match-statistics';

export type DashboardOutcome = 'win' | 'draw' | 'loss';

export interface DashboardPlayerMinutes {
  playerId: string;
  number: number;
  name: string;
  minutes: number;
  percentage: number;
}

export interface DashboardMatchSummary {
  id: string;
  dateLabel: string;
  opponent: string;
  opponentShortName: string;
  competition: string | null;
  goalsFor: number;
  goalsAgainst: number;
  outcome: DashboardOutcome;
  outcomeLabel: string;
  statistics: readonly { label: string; value: number }[];
}

export interface DashboardPlayerSummary {
  playerId: string;
  number: number;
  name: string;
  position: string | null;
  active: boolean;
}

export interface DashboardViewModel {
  season: string | null;
  matchesPlayed: number;
  matchesThisMonth: number;
  wins: number;
  draws: number;
  losses: number;
  winPercentage: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  activePlayers: number;
  playersWithMinutes: number;
  topPlayersByMinutes: readonly DashboardPlayerMinutes[];
  latestMatch: DashboardMatchSummary | null;
  recentMatches: readonly DashboardMatchSummary[];
  squadPreview: readonly DashboardPlayerSummary[];
}

export interface DashboardMatchRecord {
  match: Match;
  events: readonly MatchEvent[];
}

@Injectable({ providedIn: 'root' })
export class DashboardFacade {
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly events = inject(MATCH_EVENT_REPOSITORY);
  private readonly players = inject(PLAYER_REPOSITORY);

  async load(teamId: string): Promise<DashboardViewModel> {
    const [matches, players] = await Promise.all([
      this.matches.listByTeam(teamId),
      this.players.listByTeam(teamId),
    ]);
    const records = await Promise.all(
      matches.map(async (match) => ({ match, events: await this.events.listByMatch(match.id) })),
    );
    return buildDashboardViewModel(players, records);
  }
}

export function buildDashboardViewModel(
  players: readonly Player[],
  records: readonly DashboardMatchRecord[],
  now = new Date(),
): DashboardViewModel {
  const ordered = [...records].sort(
    (left, right) => matchDateTimestamp(right.match.date) - matchDateTimestamp(left.match.date),
  );
  const season = ordered[0] ? matchSeason(ordered[0].match) : null;
  const seasonRecords = season ? ordered.filter(({ match }) => matchSeason(match) === season) : [];
  const finished = seasonRecords.filter(({ match }) => isMatchFinished(match));
  const summaries = finished.map(toMatchSummary);
  const wins = summaries.filter(({ outcome }) => outcome === 'win').length;
  const draws = summaries.filter(({ outcome }) => outcome === 'draw').length;
  const losses = summaries.filter(({ outcome }) => outcome === 'loss').length;
  const goalsFor = summaries.reduce((sum, match) => sum + match.goalsFor, 0);
  const goalsAgainst = summaries.reduce((sum, match) => sum + match.goalsAgainst, 0);
  const seasonMinutes = accumulateMinutes(players, finished);
  const recentMinutes = accumulateMinutes(players, finished.slice(0, 6));
  const maximumMinutes = Math.max(0, ...recentMinutes.values());
  const byId = new Map(players.map((player) => [player.id, player]));
  const topPlayersByMinutes = [...recentMinutes]
    .filter(([, playedMs]) => playedMs > 0)
    .sort(
      (left, right) =>
        right[1] - left[1] || (byId.get(left[0])?.number ?? 0) - (byId.get(right[0])?.number ?? 0),
    )
    .slice(0, 6)
    .map(([playerId, playedMs]) => {
      const player = byId.get(playerId)!;
      return {
        playerId,
        number: player.number,
        name: player.name,
        minutes: Math.round(playedMs / 60_000),
        percentage: maximumMinutes ? Math.round((playedMs / maximumMinutes) * 100) : 0,
      };
    });
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  return {
    season,
    matchesPlayed: seasonRecords.length,
    matchesThisMonth: seasonRecords.filter(({ match }) => {
      const date = new Date(matchDateTimestamp(match.date));
      return date.getFullYear() === currentYear && date.getMonth() === currentMonth;
    }).length,
    wins,
    draws,
    losses,
    winPercentage: finished.length ? Math.round((wins / finished.length) * 100) : 0,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    activePlayers: players.filter(({ active }) => active).length,
    playersWithMinutes: [...seasonMinutes.values()].filter((playedMs) => playedMs > 0).length,
    topPlayersByMinutes,
    latestMatch: summaries[0] ?? null,
    recentMatches: summaries.slice(0, 5),
    squadPreview: [...players]
      .sort(
        (left, right) => Number(right.active) - Number(left.active) || left.number - right.number,
      )
      .slice(0, 5)
      .map((player) => ({
        playerId: player.id,
        number: player.number,
        name: player.name,
        position: player.position ?? null,
        active: player.active,
      })),
  };
}

function accumulateMinutes(
  players: readonly Player[],
  records: readonly DashboardMatchRecord[],
): Map<string, number> {
  const totals = new Map(players.map(({ id }) => [id, 0]));
  for (const { match, events } of records) {
    const statistics = deriveMatchStatistics(match, events, match.clock.remainingMs).players;
    const legacyPlayers = match.importMetadata?.legacySnapshot?.players ?? [];
    for (const player of players) {
      const legacySeconds = legacyPlayers.find(
        ({ playerId }) => playerId === player.id,
      )?.secondsPlayed;
      const playedMs =
        legacySeconds !== undefined
          ? legacySeconds * 1_000
          : (statistics[player.id]?.playedMs ?? 0);
      totals.set(player.id, (totals.get(player.id) ?? 0) + playedMs);
    }
  }
  return totals;
}

function toMatchSummary({ match, events }: DashboardMatchRecord): DashboardMatchSummary {
  const score =
    match.importMetadata?.legacySnapshot?.observedScore ?? deriveMatchState(match, events).score;
  const outcome: DashboardOutcome =
    score.home > score.away ? 'win' : score.home < score.away ? 'loss' : 'draw';
  const statistics = deriveMatchStatistics(match, events, match.clock.remainingMs);
  const activeEvents = selectActiveEvents(events);
  const shots = Object.values(statistics.players).reduce(
    (sum, player) => sum + (player.shotsTotal ?? 0),
    0,
  );
  const fouls = activeEvents.filter(
    (event) => event.type === 'FOUL' && event.team === 'home',
  ).length;
  const cards = activeEvents.filter(
    (event) =>
      ((event.type === 'FOUL' || event.type === 'DISCIPLINE') &&
        event.team === 'home' &&
        event.disciplinaryAction &&
        event.disciplinaryAction !== 'none') ||
      (event.type === 'BENCH_DISCIPLINE' && event.team === 'home'),
  ).length;
  return {
    id: match.id,
    dateLabel: formatMatchDate(match.date),
    opponent: match.awayTeam.name,
    opponentShortName: match.awayTeam.shortName,
    competition: match.competition?.trim() || null,
    goalsFor: score.home,
    goalsAgainst: score.away,
    outcome,
    outcomeLabel: outcome === 'win' ? 'Victoria' : outcome === 'draw' ? 'Empate' : 'Derrota',
    statistics: [
      { label: 'Goles', value: score.home },
      ...(match.statisticsSchemaVersion === 2 ? [{ label: 'Tiros', value: shots }] : []),
      { label: 'Faltas', value: fouls },
      { label: 'Tarjetas', value: cards },
    ],
  };
}

function formatMatchDate(value: Match['date']): string {
  const timestamp = matchDateTimestamp(value);
  if (!timestamp) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(timestamp)
    .replace('.', '');
}
