import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { configureStartingLineup, hasValidStartingLineup } from './starting-lineup';

function match(status: Match['status'] = 'ready'): Match {
  return {
    id: 'match-1',
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: '2026-09-07',
    description: 'Liga',
    status,
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    startingLineupPlayerIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('starting lineup configuration', () => {
  it('persists exactly five different squad players without starting the clock', () => {
    const result = configureStartingLineup(match(), ['p1', 'p2', 'p3', 'p4', 'p5'], 20);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.startingLineupPlayerIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(result.value.status).toBe('ready');
    expect(result.value.clock.running).toBe(false);
    expect(hasValidStartingLineup(result.value)).toBe(true);
  });

  it.each([
    ['four players', ['p1', 'p2', 'p3', 'p4']],
    ['six players', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']],
    ['duplicates', ['p1', 'p2', 'p3', 'p4', 'p4']],
    ['six entries with a duplicate', ['p1', 'p2', 'p3', 'p4', 'p5', 'p5']],
  ])('rejects %s', (_case, playerIds) => {
    expect(configureStartingLineup(match(), playerIds, 20).ok).toBe(false);
  });

  it('allows replacing the saved lineup while the match is still ready', () => {
    const ready = match();
    ready.startingLineupPlayerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];

    const result = configureStartingLineup(ready, ['p2', 'p3', 'p4', 'p5', 'p6'], 30);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.startingLineupPlayerIds).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
    expect(result.value.status).toBe('ready');
  });

  it('rejects a player outside the squad and changes after kickoff', () => {
    expect(configureStartingLineup(match(), ['p1', 'p2', 'p3', 'p4', 'other'], 20).ok).toBe(false);
    expect(configureStartingLineup(match('firstHalf'), ['p1', 'p2', 'p3', 'p4', 'p5'], 20).ok).toBe(
      false,
    );
  });
});
