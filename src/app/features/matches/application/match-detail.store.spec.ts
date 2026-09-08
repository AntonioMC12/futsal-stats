import { TestBed } from '@angular/core/testing';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY as MatchEventRepository,
  MATCH_REPOSITORY as MatchRepository,
  PLAYER_REPOSITORY as PlayerRepository,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { MatchDetailStore } from './match-detail.store';

const match: Match = {
  id: 'match-1',
  teamId: 'team-1',
  homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
  awayTeam: { name: 'Rival', shortName: 'RIV' },
  date: '2026-09-07',
  season: '2026/27',
  competition: 'Liga',
  description: 'Jornada 1',
  status: 'finished',
  currentPeriod: 2,
  periodCount: 2,
  clock: { ...createMatchClock(), remainingMs: 0 },
  squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
  startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
  createdAt: 1,
  updatedAt: 10,
};

function event(value: MatchEvent): MatchEvent {
  return value;
}

describe('MatchDetailStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('rebuilds score, timeline, fouls and player aggregates from persisted events', async () => {
    const base = (id: string, type: MatchEvent['type'], sequence: number) => ({
      id,
      matchId: match.id,
      type,
      period: 1,
      gameClockMs: 1_000_000 - sequence * 1_000,
      timestamp: sequence,
      sequence,
      undone: false,
    });
    const events: MatchEvent[] = [
      event({ ...base('started', 'MATCH_STARTED', 1), type: 'MATCH_STARTED' }),
      event({ ...base('entered', 'PLAYER_ENTERED', 2), type: 'PLAYER_ENTERED', playerId: 'p1' }),
      event({
        ...base('goal', 'GOAL_FOR', 3),
        type: 'GOAL_FOR',
        scorerPlayerId: 'p1',
        lineupPlayerIds: ['p1'],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 1, away: 0 },
      }),
      event({
        ...base('foul', 'FOUL', 4),
        type: 'FOUL',
        team: 'home',
        playerId: 'p1',
        periodFoulNumber: 1,
      }),
      event({ ...base('finished', 'MATCH_FINISHED', 5), type: 'MATCH_FINISHED' }),
    ];
    const players = [{ id: 'p1', teamId: 'team-1', number: 9, name: 'Ana', active: true }];
    TestBed.configureTestingModule({
      providers: [
        MatchDetailStore,
        { provide: MatchRepository, useValue: { get: async () => match } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => events } },
        { provide: PlayerRepository, useValue: { listByIds: async () => players } },
      ],
    });

    const store = TestBed.inject(MatchDetailStore);
    await store.load(match.id);

    expect(store.score()).toEqual({ home: 1, away: 0 });
    expect(store.foulsByPeriod()[0]).toMatchObject({ home: 1, away: 0 });
    expect(store.playerRows()[0]?.statistics).toMatchObject({ goals: 1, fouls: 1 });
    expect(store.timeline().map(({ label }) => label)).toContain('Gol #9 Ana · 1-0');
  });

  it('reports an unavailable match without querying related records', async () => {
    const listEvents = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        MatchDetailStore,
        { provide: MatchRepository, useValue: { get: async () => undefined } },
        { provide: MatchEventRepository, useValue: { listByMatch: listEvents } },
        { provide: PlayerRepository, useValue: { listByIds: vi.fn() } },
      ],
    });
    const store = TestBed.inject(MatchDetailStore);
    await store.load('missing');
    expect(store.error()).toContain('no existe');
    expect(listEvents).not.toHaveBeenCalled();
  });
});
