import { isCompleteLineup, lineupId } from './lineup-id';

describe('lineupId', () => {
  it('creates a stable id regardless of input order', () => {
    expect(lineupId(['c', 'a', 'b'])).toBe(lineupId(['a', 'b', 'c']));
  });

  it('requires five distinct players for a complete lineup', () => {
    expect(isCompleteLineup(['1', '2', '3', '4', '5'])).toBe(true);
    expect(isCompleteLineup(['1', '2', '3', '4'])).toBe(false);
    expect(isCompleteLineup(['1', '2', '3', '4', '1'])).toBe(false);
  });
});
