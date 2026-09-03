import { TestBed } from '@angular/core/testing';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY as MatchEventRepository,
  MATCH_REPOSITORY as MatchRepository,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { DeleteMatchService } from './delete-match.service';
import { MatchesStore } from './matches.store';

function match(id: string, status: Match['status'], date: number): Match {
  return {
    id,
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: `Rival ${id}`, shortName: `R${id}` },
    date,
    status,
    currentPeriod: status === 'secondHalf' || status === 'finished' ? 2 : 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    createdAt: date,
    updatedAt: date,
  };
}

function goal(matchId: string, side: 'GOAL_FOR' | 'GOAL_AGAINST', sequence: number): MatchEvent {
  const before =
    side === 'GOAL_FOR' ? { home: sequence - 1, away: 0 } : { home: 0, away: sequence - 1 };
  const after = side === 'GOAL_FOR' ? { home: sequence, away: 0 } : { home: 0, away: sequence };
  return {
    id: `${matchId}-goal-${sequence}`,
    matchId,
    type: side,
    period: 1,
    gameClockMs: 1,
    timestamp: sequence,
    sequence,
    undone: false,
    lineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    scoreBefore: before,
    scoreAfter: after,
  };
}

describe('MatchesStore', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('loads one active match and finished history with derived scores', async () => {
    vi.useFakeTimers();
    const active = match('active', 'firstHalf', 30);
    const older = match('old', 'finished', 10);
    const newer = match('new', 'finished', 20);
    TestBed.configureTestingModule({
      providers: [
        MatchesStore,
        { provide: MatchRepository, useValue: { list: async () => [active, older, newer] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async (id: string) =>
              id === 'active'
                ? [goal(id, 'GOAL_FOR', 1)]
                : id === 'old'
                  ? [goal(id, 'GOAL_AGAINST', 1)]
                  : [goal(id, 'GOAL_FOR', 1), goal(id, 'GOAL_FOR', 2)],
          },
        },
        { provide: DeleteMatchService, useValue: { execute: async () => undefined } },
      ],
    });

    const store = TestBed.inject(MatchesStore);
    await store.load();

    expect(store.activeMatch()).toMatchObject({
      match: { id: 'active' },
      score: { home: 1, away: 0 },
    });
    expect(store.finishedMatches().map(({ match }) => match.id)).toEqual(['new', 'old']);
    expect(store.finishedMatches()[0]?.score).toEqual({ home: 2, away: 0 });
    expect(store.finishedMatches()[1]?.score).toEqual({ home: 0, away: 1 });
  });

  it('deletes a finished match without changing the active match', async () => {
    vi.useFakeTimers();
    const active = match('active', 'ready', 20);
    const finished = match('finished', 'finished', 10);
    const deleted: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        MatchesStore,
        { provide: MatchRepository, useValue: { list: async () => [active, finished] } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => [] } },
        {
          provide: DeleteMatchService,
          useValue: { execute: async (id: string) => deleted.push(id) },
        },
      ],
    });

    const store = TestBed.inject(MatchesStore);
    await store.load();
    expect(await store.deleteMatch('finished')).toBe(true);

    expect(deleted).toEqual(['finished']);
    expect(store.activeMatch()?.match.id).toBe('active');
    expect(store.finishedMatches()).toEqual([]);
  });

  it('keeps local state when IndexedDB deletion fails', async () => {
    vi.useFakeTimers();
    const active = match('active', 'ready', 20);
    TestBed.configureTestingModule({
      providers: [
        MatchesStore,
        { provide: MatchRepository, useValue: { list: async () => [active] } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => [] } },
        {
          provide: DeleteMatchService,
          useValue: {
            execute: async () => {
              throw new Error('failure');
            },
          },
        },
      ],
    });

    const store = TestBed.inject(MatchesStore);
    await store.load();
    expect(await store.deleteMatch('active')).toBe(false);

    expect(store.activeMatch()?.match.id).toBe('active');
    expect(store.error()).toContain('siguen guardados');
  });
});
