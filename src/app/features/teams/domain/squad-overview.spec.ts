import { Player } from '../../../shared/models/player';
import { createMatchClock } from '../../../core/clock/match-clock';
import { MatchEvent } from '../../../shared/models/match-event';
import { buildSquadOverview, filterAndSortSquad } from './squad-overview';

describe('squad overview', () => {
  const players: Player[] = [
    { id: 'p2', teamId: 't', number: 10, name: 'Bea', position: 'Cierre', active: false },
    { id: 'p1', teamId: 't', number: 4, name: 'Ana', position: 'Ala', active: true },
  ];
  it('includes active and inactive players without matches', () => {
    const overview = buildSquadOverview(players, [], []);
    expect(overview.activePlayers).toBe(1);
    expect(overview.totalPlayers).toBe(2);
    expect(
      overview.players.every(
        ({ matchesPlayed, averageMinutesPerMatch }) =>
          matchesPlayed === 0 && averageMinutesPerMatch === 0,
      ),
    ).toBe(true);
  });
  it('searches, filters and sorts summaries', () => {
    const summaries = buildSquadOverview(players, [], []).players;
    expect(
      filterAndSortSquad(summaries, '4', 'active', '', 'number').map(({ name }) => name),
    ).toEqual(['Ana']);
    expect(filterAndSortSquad(summaries, '', 'all', '', 'name').map(({ name }) => name)).toEqual([
      'Ana',
      'Bea',
    ]);
  });

  it('reconstructs minutes, appearances and averages from match events', () => {
    const match = {
      id: 'm1',
      teamId: 't',
      homeTeam: { id: 't', name: 'Local', shortName: 'LOC' },
      awayTeam: { name: 'Rival', shortName: 'RIV' },
      date: '2026-09-10',
      season: '2026/27',
      description: '',
      status: 'finished' as const,
      currentPeriod: 1,
      periodCount: 2,
      clock: { ...createMatchClock(), remainingMs: 600_000 },
      squadPlayerIds: ['p1'],
      startingLineupPlayerIds: ['p1'],
      createdAt: 1,
      updatedAt: 2,
    };
    const base = { matchId: 'm1', period: 1, timestamp: 1, undone: false };
    const events: MatchEvent[] = [
      { ...base, id: 'start', type: 'MATCH_STARTED', gameClockMs: 1_200_000, sequence: 1 },
      {
        ...base,
        id: 'enter',
        type: 'PLAYER_ENTERED',
        gameClockMs: 1_200_000,
        sequence: 2,
        playerId: 'p1',
      },
      { ...base, id: 'clock', type: 'CLOCK_STARTED', gameClockMs: 1_200_000, sequence: 3 },
      {
        ...base,
        id: 'goal',
        type: 'GOAL_FOR',
        gameClockMs: 900_000,
        sequence: 4,
        scorerPlayerId: 'p1',
        lineupPlayerIds: ['p1'],
        scoreBefore: { home: 0, away: 0 },
        scoreAfter: { home: 1, away: 0 },
      },
      { ...base, id: 'stop', type: 'CLOCK_STOPPED', gameClockMs: 600_000, sequence: 5 },
      { ...base, id: 'finish', type: 'MATCH_FINISHED', gameClockMs: 600_000, sequence: 6 },
    ];
    const summary = buildSquadOverview(players, [], [{ match, events }], '2026/27').players.find(
      ({ playerId }) => playerId === 'p1',
    )!;
    expect(summary).toMatchObject({
      matchesPlayed: 1,
      starts: 1,
      playedMs: 600_000,
      plusMinus: 1,
      averageMinutesPerMatch: 10,
    });
  });
});
