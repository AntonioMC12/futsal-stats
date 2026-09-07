import { createMatchClock } from '../clock/match-clock';
import { Match } from '../../shared/models/match';
import { normalizeMatch } from './match.repository';

describe('match persistence compatibility', () => {
  it('normalizes missing legacy metadata without inventing an abbreviation', () => {
    const legacy = {
      id: 'legacy',
      homeTeam: { id: 'home', name: 'Local', shortName: 'LOC' },
      awayTeam: { name: 'Rival histórico' },
      status: 'finished',
      currentPeriod: 2,
      periodCount: 2,
      clock: createMatchClock(),
      squadPlayerIds: [],
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Match;

    expect(normalizeMatch(legacy)).toMatchObject({
      date: '',
      description: '',
      awayTeam: { name: 'Rival histórico', shortName: '' },
      startingLineupPlayerIds: [],
    });
  });
});
