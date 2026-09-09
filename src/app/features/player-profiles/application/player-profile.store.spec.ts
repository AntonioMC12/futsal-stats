import { TestBed } from '@angular/core/testing';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY as MatchEventRepository,
  MATCH_REPOSITORY as MatchRepository,
  PLAYER_PROFILE_REPOSITORY as PlayerProfileRepository,
  PLAYER_REPOSITORY as PlayerRepository,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { PlayerProfileStore } from './player-profile.store';

function match(id: string, season: string, date: string): Match {
  return {
    id,
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Local', shortName: 'LOC' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date,
    season,
    competition: 'Liga',
    description: '',
    status: 'finished',
    currentPeriod: 2,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['p1'],
    startingLineupPlayerIds: ['p1'],
    createdAt: 1,
    updatedAt: 2,
  };
}

function goal(matchId: string): MatchEvent {
  return {
    id: `${matchId}-goal`,
    matchId,
    type: 'GOAL_FOR',
    period: 1,
    gameClockMs: 10,
    timestamp: 1,
    sequence: 1,
    undone: false,
    scorerPlayerId: 'p1',
    lineupPlayerIds: ['p1'],
    scoreBefore: { home: 0, away: 0 },
    scoreAfter: { home: 1, away: 0 },
  };
}

describe('PlayerProfileStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads a persistent profile and keeps season metrics separate from career metrics', async () => {
    const current = match('current', '2026/27', '2026-09-08');
    const previous = match('previous', '2025/26', '2026-05-08');
    TestBed.configureTestingModule({
      providers: [
        PlayerProfileStore,
        {
          provide: PlayerRepository,
          useValue: {
            listByIds: async () => [
              { id: 'p1', teamId: 'team-1', number: 7, name: 'Ana', active: true },
            ],
          },
        },
        {
          provide: PlayerProfileRepository,
          useValue: {
            get: async () => ({
              playerId: 'p1',
              teamId: 'team-1',
              preferredFoot: 'left',
              notes: 'Ala',
              metadata: {},
              createdAt: 1,
              updatedAt: 2,
            }),
          },
        },
        { provide: MatchRepository, useValue: { listByTeam: async () => [current, previous] } },
        {
          provide: MatchEventRepository,
          useValue: { listByMatch: async (id: string) => [goal(id)] },
        },
      ],
    });

    const store = TestBed.inject(PlayerProfileStore);
    await store.load('p1');
    expect(store.profile()).toMatchObject({ preferredFoot: 'left', notes: 'Ala' });
    expect(store.careerStatistics().goals).toBe(2);
    store.season.set('2026/27');
    expect(store.filteredHistory().map(({ match }) => match.id)).toEqual(['current']);
    expect(store.statistics().goals).toBe(1);
  });

  it('creates and persists the profile on first save', async () => {
    const put = vi.fn(async () => 'p1');
    TestBed.configureTestingModule({
      providers: [
        PlayerProfileStore,
        {
          provide: PlayerRepository,
          useValue: {
            listByIds: async () => [
              { id: 'p1', teamId: 'team-1', number: 7, name: 'Ana', active: true },
            ],
          },
        },
        { provide: PlayerProfileRepository, useValue: { get: async () => undefined, put } },
        { provide: MatchRepository, useValue: { listByTeam: async () => [] } },
        { provide: MatchEventRepository, useValue: { listByMatch: vi.fn() } },
      ],
    });
    const store = TestBed.inject(PlayerProfileStore);
    await store.load('p1');
    expect(store.profile()).toMatchObject({ playerId: 'p1', preferredFoot: 'unknown' });

    expect(
      await store.save({
        photoUrl: 'https://example.com/ana.jpg',
        preferredFoot: 'right',
        notes: 'Pívot',
      }),
    ).toBe(true);
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'p1', preferredFoot: 'right', notes: 'Pívot' }),
    );
    expect(store.notice()).toBe('Perfil guardado.');
  });
});
