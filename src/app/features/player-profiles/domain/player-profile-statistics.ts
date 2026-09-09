import {
  Match,
  isMatchFinished,
  matchDateTimestamp,
  matchSeason,
} from '../../../shared/models/match';
import { MatchEvent, ScoreSnapshot } from '../../../shared/models/match-event';
import {
  deriveMatchStatistics,
  PlayerMatchStatistics,
} from '../../live-match/domain/match-statistics';
import { deriveMatchState } from '../../live-match/domain/derived-match-state';

export type MatchOutcome = 'win' | 'draw' | 'loss';

export interface PlayerHistoricalMatch {
  match: Match;
  score: ScoreSnapshot;
  outcome: MatchOutcome;
  started: boolean;
  appeared: boolean;
  statistics: PlayerMatchStatistics;
}

export interface PlayerAggregateStatistics {
  squadSelections: number;
  appearances: number;
  starts: number;
  playedMs: number;
  goals: number;
  goalsForOnCourt: number;
  goalsAgainstOnCourt: number;
  plusMinus: number;
  fouls: number;
  yellowCards: number;
  sendOffs: number;
  entries: number;
  wins: number;
  draws: number;
  losses: number;
  goalsPerAppearance: number;
  goalsPer40Minutes: number;
  foulsPerAppearance: number;
  minutesPerAppearance: number;
  winRate: number;
}

export interface MatchWithEvents {
  match: Match;
  events: readonly MatchEvent[];
}

const EMPTY_MATCH_STATISTICS: PlayerMatchStatistics = {
  playedMs: 0,
  firstHalfMs: 0,
  secondHalfMs: 0,
  entries: 0,
  percentage: 0,
  goals: 0,
  goalsForOnCourt: 0,
  goalsAgainstOnCourt: 0,
  plusMinus: 0,
  fouls: 0,
  yellowCards: 0,
  secondYellowSendOffs: 0,
  directRedCards: 0,
  sendOffs: 0,
};

export function buildPlayerHistory(
  playerId: string,
  records: readonly MatchWithEvents[],
): PlayerHistoricalMatch[] {
  return records
    .filter(({ match }) => isMatchFinished(match) && match.squadPlayerIds.includes(playerId))
    .map(({ match, events }) => {
      const statistics =
        deriveMatchStatistics(match, events, match.clock.remainingMs).players[playerId] ??
        EMPTY_MATCH_STATISTICS;
      const score = deriveMatchState(match, events).score;
      return {
        match,
        score,
        outcome: outcome(score),
        started: match.startingLineupPlayerIds.includes(playerId),
        appeared:
          statistics.playedMs > 0 ||
          statistics.entries > 0 ||
          match.startingLineupPlayerIds.includes(playerId),
        statistics,
      };
    })
    .sort(
      (left, right) => matchDateTimestamp(right.match.date) - matchDateTimestamp(left.match.date),
    );
}

export function aggregatePlayerHistory(
  history: readonly PlayerHistoricalMatch[],
): PlayerAggregateStatistics {
  const totals = history.reduce(
    (result, item) => {
      result.squadSelections += 1;
      result.appearances += Number(item.appeared);
      result.starts += Number(item.started);
      result.playedMs += item.statistics.playedMs;
      result.goals += item.statistics.goals;
      result.goalsForOnCourt += item.statistics.goalsForOnCourt;
      result.goalsAgainstOnCourt += item.statistics.goalsAgainstOnCourt;
      result.plusMinus += item.statistics.plusMinus;
      result.fouls += item.statistics.fouls;
      result.yellowCards += item.statistics.yellowCards;
      result.sendOffs += item.statistics.sendOffs;
      result.entries += item.statistics.entries;
      result.wins += Number(item.outcome === 'win');
      result.draws += Number(item.outcome === 'draw');
      result.losses += Number(item.outcome === 'loss');
      return result;
    },
    {
      squadSelections: 0,
      appearances: 0,
      starts: 0,
      playedMs: 0,
      goals: 0,
      goalsForOnCourt: 0,
      goalsAgainstOnCourt: 0,
      plusMinus: 0,
      fouls: 0,
      yellowCards: 0,
      sendOffs: 0,
      entries: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    },
  );
  const playedMinutes = totals.playedMs / 60_000;
  return {
    ...totals,
    goalsPerAppearance: ratio(totals.goals, totals.appearances),
    goalsPer40Minutes: playedMinutes ? (totals.goals * 40) / playedMinutes : 0,
    foulsPerAppearance: ratio(totals.fouls, totals.appearances),
    minutesPerAppearance: ratio(playedMinutes, totals.appearances),
    winRate: ratio(totals.wins * 100, totals.squadSelections),
  };
}

export function filterPlayerHistoryBySeason(
  history: readonly PlayerHistoricalMatch[],
  season: string,
): PlayerHistoricalMatch[] {
  return season === 'all'
    ? [...history]
    : history.filter(({ match }) => matchSeason(match) === season);
}

function outcome(score: ScoreSnapshot): MatchOutcome {
  if (score.home > score.away) return 'win';
  if (score.home < score.away) return 'loss';
  return 'draw';
}

function ratio(value: number, denominator: number): number {
  return denominator ? value / denominator : 0;
}
