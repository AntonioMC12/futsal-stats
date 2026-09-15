import { Injectable, inject } from '@angular/core';
import { formatGameClock, projectRemaining } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { deriveDisciplinaryState } from '../../live-match/domain/discipline';
import { deriveMatchState } from '../../live-match/domain/derived-match-state';
import { RfefMatchContext } from '../domain/rfef-assistant';

@Injectable({ providedIn: 'root' })
export class RfefMatchContextService {
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly events = inject(MATCH_EVENT_REPOSITORY);

  async load(matchId?: string | null): Promise<RfefMatchContext | null> {
    const match = matchId ? await this.matches.get(matchId) : await this.matches.findActive();
    if (!match) return null;
    const events = await this.events.listByMatch(match.id);
    return buildRfefMatchContext(match, events, Date.now());
  }
}

export function buildRfefMatchContext(
  match: Match,
  events: readonly MatchEvent[],
  now: number,
): RfefMatchContext {
  const state = deriveMatchState(match, events);
  const remainingMs = projectRemaining(match.clock, now);
  const currentSegment =
    state.clockRunning && state.runningSegmentStartedAtGameClockMs !== null
      ? Math.max(0, state.runningSegmentStartedAtGameClockMs - remainingMs)
      : 0;
  const discipline = deriveDisciplinaryState(events, state.completedElapsedMs + currentSegment);
  const fouls = state.foulsByPeriod[state.currentPeriod] ?? { home: 0, away: 0 };

  return {
    period: state.currentPeriod,
    clock: formatGameClock(remainingMs),
    ownAccumulatedFouls: fouls.home,
    opponentAccumulatedFouls: fouls.away,
    ownPlayersOnCourt: discipline.onCourtPlayerCounts.home,
    opponentPlayersOnCourt: discipline.onCourtPlayerCounts.away,
    activeReductions: discipline.reductions
      .filter(
        (item): item is typeof item & { status: 'active' | 'replacementAllowed' } =>
          item.status !== 'replacementCompleted',
      )
      .map((item) => ({
        team: item.team === 'home' ? 'own' : 'opponent',
        remainingSeconds: Math.ceil(item.remainingMs / 1000),
        status: item.status,
      })),
  };
}
