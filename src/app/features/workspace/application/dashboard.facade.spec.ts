import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { Player } from '../../../shared/models/player';
import { buildDashboardViewModel, DashboardMatchRecord } from './dashboard.facade';

const players: Player[] = [
  { id: 'p7', teamId: 'team', number: 7, name: 'Juan', position: 'ALA', active: true },
  { id: 'p10', teamId: 'team', number: 10, name: 'Dani', active: true },
  { id: 'p1', teamId: 'team', number: 1, name: 'Álvaro', position: 'POR', active: false },
];

describe('dashboard view model', () => {
  it('calculates results, goals, latest matches and the real minutes ranking', () => {
    const records = [
      record('win', '2026-09-20', 4, 1, 180, 120),
      record('draw', '2026-09-13', 2, 2, 100, 140),
      record('loss', '2026-09-06', 1, 3, 60, 80),
      record('old', '2025-04-01', 9, 0, 500, 500, '2024/25'),
    ];

    const vm = buildDashboardViewModel(players, records, new Date(2026, 8, 23));

    expect(vm).toMatchObject({
      season: '2026/27',
      matchesPlayed: 3,
      matchesThisMonth: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winPercentage: 33,
      goalsFor: 7,
      goalsAgainst: 6,
      goalDifference: 1,
      activePlayers: 2,
      playersWithMinutes: 2,
    });
    expect(vm.latestMatch).toMatchObject({ id: 'win', outcome: 'win', opponent: 'Rival win' });
    expect(vm.recentMatches.map(({ id }) => id)).toEqual(['win', 'draw', 'loss']);
    expect(vm.topPlayersByMinutes).toEqual([
      expect.objectContaining({ playerId: 'p7', minutes: 340, percentage: 100 }),
      expect.objectContaining({ playerId: 'p10', minutes: 340, percentage: 100 }),
    ]);
  });

  it('limits history to five and minutes to the latest six matches', () => {
    const records = Array.from({ length: 7 }, (_, index) =>
      record(
        `match-${index}`,
        `2026-09-${String(20 - index).padStart(2, '0')}`,
        1,
        0,
        index === 6 ? 1_000 : 10,
        0,
      ),
    );

    const vm = buildDashboardViewModel(players, records);

    expect(vm.recentMatches).toHaveLength(5);
    expect(vm.topPlayersByMinutes[0]).toMatchObject({ playerId: 'p7', minutes: 60 });
  });

  it('returns explicit empty collections and zeroed KPIs without data', () => {
    expect(buildDashboardViewModel([], [])).toEqual(
      expect.objectContaining({
        season: null,
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        latestMatch: null,
        recentMatches: [],
        topPlayersByMinutes: [],
        squadPreview: [],
      }),
    );
  });
});

function record(
  id: string,
  date: string,
  home: number,
  away: number,
  p7Minutes: number,
  p10Minutes: number,
  season = '2026/27',
): DashboardMatchRecord {
  const match: Match = {
    id,
    teamId: 'team',
    homeTeam: { id: 'team', name: 'Apaga FS', shortName: 'APA' },
    awayTeam: { name: `Rival ${id}`, shortName: 'RIV' },
    date,
    season,
    competition: 'Liga',
    description: '',
    status: 'finished',
    currentPeriod: 2,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['p7', 'p10'],
    startingLineupPlayerIds: ['p7'],
    createdAt: 1,
    updatedAt: 1,
    source: 'csv-import',
    importMetadata: {
      fileName: 'fixture.csv',
      importedAt: '2026-09-20T00:00:00Z',
      fingerprint: id,
      legacySnapshot: {
        importFormat: 'legacy-player-snapshot',
        reconstructionVersion: 1,
        observedTeamName: 'Apaga FS',
        observedScore: { home, away },
        players: [
          { playerId: 'p7', secondsPlayed: p7Minutes * 60 },
          { playerId: 'p10', secondsPlayed: p10Minutes * 60 },
        ],
        missingData: ['eventTimeline', 'substitutionTimeline', 'lineupHistory'],
      },
    },
  };
  return { match, events: [] };
}
