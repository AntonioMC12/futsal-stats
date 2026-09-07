import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent, MatchEventBase } from '../../../shared/models/match-event';
import { deriveParticipation, derivePlayerPlayingTimes } from './player-playing-time';

const match: Match = {
  id: 'match-1',
  homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
  awayTeam: { name: 'Rival', shortName: 'RIV' },
  date: 1,
  description: '',
  status: 'firstHalf',
  currentPeriod: 1,
  periodCount: 2,
  clock: createMatchClock(),
  squadPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
  startingLineupPlayerIds: ['a', 'b', 'c', 'd', 'e'],
  createdAt: 1,
  updatedAt: 1,
};

function base(id: string, sequence: number, gameClockMs: number, period = 1): MatchEventBase {
  return {
    id,
    matchId: match.id,
    type: 'MATCH_STARTED',
    period,
    gameClockMs,
    timestamp: sequence,
    sequence,
    undone: false,
  };
}

function initialLineup(): MatchEvent[] {
  return ['a', 'b', 'c', 'd', 'e'].map((playerId, index): MatchEvent => ({
    ...base(`enter-${playerId}`, index + 1, 1_200_000),
    type: 'PLAYER_ENTERED',
    playerId,
  }));
}

describe('player playing time', () => {
  it('splits 06:30 and 08:15 across periods and reconstructs the same totals after reload', () => {
    const events: MatchEvent[] = [
      ...initialLineup(),
      { ...base('start', 6, 1_200_000), type: 'CLOCK_STARTED' },
      { ...base('end', 7, 810_000), type: 'PERIOD_ENDED' },
      { ...base('half', 8, 1_200_000, 2), type: 'PERIOD_STARTED' },
      { ...base('resume', 9, 1_200_000, 2), type: 'CLOCK_STARTED' },
      { ...base('stop', 10, 705_000, 2), type: 'CLOCK_STOPPED' },
    ];
    const result = deriveParticipation(match, events, 705_000);
    expect(result.players['a']).toMatchObject({
      playedMs: 885_000,
      firstHalfMs: 390_000,
      secondHalfMs: 495_000,
    });
    expect(result.lineups).toHaveLength(1);
    expect(result.lineups[0]).toMatchObject({
      playedMs: 885_000,
      firstHalfMs: 390_000,
      secondHalfMs: 495_000,
      stints: 2,
    });
    expect(
      deriveParticipation(JSON.parse(JSON.stringify(match)), JSON.parse(JSON.stringify(events)), 0),
    ).toEqual(result);
  });

  it('keeps zero-time substitutions, merges repeated lineups and excludes halftime changes', () => {
    const events: MatchEvent[] = [
      ...initialLineup(),
      { ...base('start', 6, 1_200_000), type: 'CLOCK_STARTED' },
      { ...base('stop', 7, 1_100_000), type: 'CLOCK_STOPPED' },
      { ...base('out', 8, 1_100_000), type: 'SUBSTITUTION', outPlayerId: 'a', inPlayerId: 'f' },
      { ...base('back', 9, 1_100_000), type: 'SUBSTITUTION', outPlayerId: 'f', inPlayerId: 'a' },
    ];
    const result = deriveParticipation(match, events, 0);
    expect(result.lineups).toHaveLength(2);
    expect(result.lineups[0]).toMatchObject({ id: 'a|b|c|d|e', playedMs: 100_000, stints: 2 });
    expect(result.lineups[1]).toMatchObject({ id: 'b|c|d|e|f', playedMs: 0, stints: 1 });
    const halftime: MatchEvent[] = [
      ...events,
      { ...base('end', 10, 1_100_000), type: 'PERIOD_ENDED' },
      {
        ...base('half-change', 11, 1_100_000),
        type: 'SUBSTITUTION',
        outPlayerId: 'b',
        inPlayerId: 'f',
      },
    ];
    expect(deriveParticipation(match, halftime, 0).lineups).toEqual(result.lineups);
    const next: MatchEvent[] = [
      ...halftime,
      { ...base('period2', 12, 1_200_000, 2), type: 'PERIOD_STARTED' },
      { ...base('clock2', 13, 1_200_000, 2), type: 'CLOCK_STARTED' },
    ];
    expect(deriveParticipation(match, next, 1_140_000).players['f']).toMatchObject({
      firstHalfMs: 0,
      secondHalfMs: 60_000,
    });
  });

  it('includes additional periods in total without assigning them to either half', () => {
    const events: MatchEvent[] = [
      ...initialLineup(),
      { ...base('extra', 6, 300_000, 3), type: 'PERIOD_STARTED' },
      { ...base('clock', 7, 300_000, 3), type: 'CLOCK_STARTED' },
    ];
    expect(deriveParticipation(match, events, 240_000).players['a']).toMatchObject({
      playedMs: 60_000,
      firstHalfMs: 0,
      secondHalfMs: 0,
    });
  });
  it('calculates the split 20:00→15:00 and 10:00→05:00 as ten minutes', () => {
    const events: MatchEvent[] = [
      ...initialLineup(),
      { ...base('clock', 6, 1_200_000), type: 'CLOCK_STARTED' },
      {
        ...base('change-1', 7, 900_000),
        type: 'SUBSTITUTION',
        outPlayerId: 'a',
        inPlayerId: 'f',
      },
      {
        ...base('change-2', 8, 600_000),
        type: 'SUBSTITUTION',
        outPlayerId: 'f',
        inPlayerId: 'a',
      },
      {
        ...base('change-3', 9, 300_000),
        type: 'SUBSTITUTION',
        outPlayerId: 'a',
        inPlayerId: 'f',
      },
      { ...base('stop', 10, 0), type: 'CLOCK_STOPPED' },
    ];

    const times = derivePlayerPlayingTimes(match, events, 0);
    expect(times['a']).toEqual({
      playedMs: 600_000,
      firstHalfMs: 600_000,
      secondHalfMs: 0,
      entries: 2,
      percentage: 50,
    });
    expect(times['f']).toEqual({
      playedMs: 600_000,
      firstHalfMs: 600_000,
      secondHalfMs: 0,
      entries: 2,
      percentage: 50,
    });
    expect(times['b']).toEqual({
      playedMs: 1_200_000,
      firstHalfMs: 1_200_000,
      secondHalfMs: 0,
      entries: 1,
      percentage: 100,
    });
  });

  it('projects playing time for players currently on court', () => {
    const events: MatchEvent[] = [
      ...initialLineup(),
      { ...base('clock', 6, 1_200_000), type: 'CLOCK_STARTED' },
    ];
    const times = derivePlayerPlayingTimes(match, events, 1_080_000);
    expect(times['a']?.playedMs).toBe(120_000);
    expect(times['a']?.percentage).toBe(100);
    expect(times['f']?.playedMs).toBe(0);
  });

  it('does not accumulate while the clock is stopped', () => {
    const events: MatchEvent[] = [
      ...initialLineup(),
      { ...base('clock', 6, 1_200_000), type: 'CLOCK_STARTED' },
      { ...base('stop', 7, 900_000), type: 'CLOCK_STOPPED' },
      {
        ...base('change', 8, 900_000),
        type: 'SUBSTITUTION',
        outPlayerId: 'a',
        inPlayerId: 'f',
      },
    ];
    const times = derivePlayerPlayingTimes(match, events, 400_000);
    expect(times['a']?.playedMs).toBe(300_000);
    expect(times['f']?.playedMs).toBe(0);
  });

  it('accumulates across periods after the game clock resets', () => {
    const events: MatchEvent[] = [
      ...initialLineup(),
      { ...base('clock-1', 6, 1_200_000), type: 'CLOCK_STARTED' },
      { ...base('stop-1', 7, 0), type: 'CLOCK_STOPPED' },
      { ...base('period-2', 8, 1_200_000, 2), type: 'PERIOD_STARTED' },
      { ...base('clock-2', 9, 1_200_000, 2), type: 'CLOCK_STARTED' },
    ];
    const times = derivePlayerPlayingTimes(match, events, 900_000);
    expect(times['a']?.playedMs).toBe(1_500_000);
    expect(times['a']?.entries).toBe(1);
  });

  it('ignores an undone substitution', () => {
    const events: MatchEvent[] = [
      ...initialLineup(),
      { ...base('clock', 6, 1_200_000), type: 'CLOCK_STARTED' },
      {
        ...base('change', 7, 900_000),
        type: 'SUBSTITUTION',
        outPlayerId: 'a',
        inPlayerId: 'f',
      },
      { ...base('undo', 8, 900_000), type: 'EVENT_UNDONE', targetEventId: 'change' },
      { ...base('stop', 9, 600_000), type: 'CLOCK_STOPPED' },
    ];
    const times = derivePlayerPlayingTimes(match, events, 600_000);
    expect(times['a']?.playedMs).toBe(600_000);
    expect(times['f']?.playedMs).toBe(0);
  });
});
