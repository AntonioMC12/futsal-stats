import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { formatGameClock, projectRemaining } from '../../../core/clock/match-clock';
import { MatchEventRepository } from '../../../core/persistence/match-event.repository';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { isMatchActive, isMatchFinished, Match } from '../../../shared/models/match';
import { ScoreSnapshot } from '../../../shared/models/match-event';
import { deriveMatchState } from '../../live-match/domain/derived-match-state';
import { DeleteMatchService } from './delete-match.service';

export interface MatchSummary {
  match: Match;
  score: ScoreSnapshot;
}

@Injectable()
export class MatchesStore {
  private readonly matchesRepository = inject(MatchRepository);
  private readonly eventsRepository = inject(MatchEventRepository);
  private readonly deleteMatchService = inject(DeleteMatchService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly now = signal(Date.now());

  readonly matches = signal<MatchSummary[]>([]);
  readonly loading = signal(true);
  readonly deletingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly activeMatch = computed(
    () => this.matches().find(({ match }) => isMatchActive(match)) ?? null,
  );
  readonly finishedMatches = computed(() =>
    this.matches()
      .filter(({ match }) => isMatchFinished(match))
      .sort((left, right) => right.match.date - left.match.date),
  );
  readonly activeClock = computed(() => {
    const active = this.activeMatch()?.match;
    return formatGameClock(active ? projectRemaining(active.clock, this.now()) : 0);
  });
  readonly activePeriod = computed(() => periodLabel(this.activeMatch()?.match ?? null));

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const matches = await this.matchesRepository.list();
      const summaries = await Promise.all(
        matches.map(async (match): Promise<MatchSummary> => {
          const events = await this.eventsRepository.listByMatch(match.id);
          return { match, score: deriveMatchState(match, events).score };
        }),
      );
      this.now.set(Date.now());
      this.matches.set(summaries);
    } catch {
      this.error.set('No se han podido cargar los partidos guardados.');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteMatch(matchId: string): Promise<boolean> {
    if (this.deletingId()) {
      return false;
    }

    this.deletingId.set(matchId);
    this.error.set(null);
    try {
      await this.deleteMatchService.execute(matchId);
      this.matches.update((matches) => matches.filter(({ match }) => match.id !== matchId));
      return true;
    } catch {
      this.error.set('No se ha podido eliminar el partido. Los datos siguen guardados.');
      return false;
    } finally {
      this.deletingId.set(null);
    }
  }
}

function periodLabel(match: Match | null): string {
  switch (match?.status) {
    case 'ready':
      return 'Preparado';
    case 'firstHalf':
      return '1.ª parte';
    case 'halftime':
      return 'Descanso';
    case 'secondHalf':
      return '2.ª parte';
    default:
      return '';
  }
}
