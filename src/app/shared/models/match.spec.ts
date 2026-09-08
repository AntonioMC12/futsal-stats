import { Match } from './match';
import {
  isMatchActive,
  isMatchFinished,
  localDateString,
  matchCompetition,
  matchDateTimestamp,
  matchSeason,
  seasonForDate,
} from './match';

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

describe('match dates', () => {
  it('creates a local calendar date without converting through UTC', () => {
    expect(localDateString(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07');
  });

  it('parses new calendar dates and keeps legacy timestamps compatible', () => {
    expect(new Date(matchDateTimestamp('2026-09-07')).getDate()).toBe(7);
    expect(matchDateTimestamp(123)).toBe(123);
  });

  it('derives a sports season for legacy records and preserves explicit history metadata', () => {
    expect(seasonForDate('2026-09-07')).toBe('2026/27');
    expect(seasonForDate('2026-05-07')).toBe('2025/26');
    expect(matchSeason({ date: '2026-09-07' })).toBe('2026/27');
    expect(matchSeason({ date: '2026-09-07', season: 'Campaña 26' })).toBe('Campaña 26');
    expect(matchCompetition({})).toBe('Sin competición');
    expect(matchCompetition({ competition: 'Copa' })).toBe('Copa');
  });
});
