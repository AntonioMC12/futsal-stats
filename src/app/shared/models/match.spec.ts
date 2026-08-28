import { Match } from './match';
import { isMatchActive, isMatchFinished } from './match';

describe('match status rules', () => {
  it.each<Match['status']>(['ready', 'firstHalf', 'halftime', 'secondHalf'])(
    'treats %s as active',
    (status) => {
      expect(isMatchActive({ status })).toBe(true);
      expect(isMatchFinished({ status })).toBe(false);
    },
  );

  it('distinguishes setup and finished matches', () => {
    expect(isMatchActive({ status: 'setup' })).toBe(false);
    expect(isMatchActive({ status: 'finished' })).toBe(false);
    expect(isMatchFinished({ status: 'finished' })).toBe(true);
  });
});
