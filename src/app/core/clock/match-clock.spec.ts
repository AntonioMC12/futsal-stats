import {
  createMatchClock,
  DEFAULT_PERIOD_DURATION_MS,
  elapsedToRemaining,
  formatGameClock,
  parseGameClock,
  projectRemaining,
  remainingToElapsed,
  resetClock,
  startClock,
  stopClock,
} from './match-clock';

describe('MatchClock', () => {
  it('starts at 20:00', () => {
    const clock = createMatchClock();
    expect(clock.remainingMs).toBe(DEFAULT_PERIOD_DURATION_MS);
    expect(clock.running).toBe(false);
    expect(formatGameClock(clock.remainingMs)).toBe('20:00');
  });

  it('counts down while running', () => {
    const started = startClock(createMatchClock(), 1_000);
    expect(formatGameClock(projectRemaining(started, 18_000))).toBe('19:43');
  });

  it('freezes remaining time on STOP', () => {
    const started = startClock(createMatchClock(), 0);
    const stopped = stopClock(started, 5_000);
    expect(stopped.running).toBe(false);
    expect(stopped.remainingMs).toBe(DEFAULT_PERIOD_DURATION_MS - 5_000);
    expect(projectRemaining(stopped, 30_000)).toBe(stopped.remainingMs);
  });

  it('continues from the frozen time on START', () => {
    const stopped = stopClock(startClock(createMatchClock(), 0), 8_000);
    const resumed = startClock(stopped, 20_000);
    expect(projectRemaining(resumed, 23_000)).toBe(DEFAULT_PERIOD_DURATION_MS - 11_000);
  });

  it('does not drift across multiple start/stop cycles', () => {
    let clock = createMatchClock();
    clock = startClock(clock, 0);
    clock = stopClock(clock, 4_000);
    clock = startClock(clock, 10_000);
    clock = stopClock(clock, 13_500);
    clock = startClock(clock, 40_000);
    expect(projectRemaining(clock, 41_500)).toBe(DEFAULT_PERIOD_DURATION_MS - 9_000);
  });

  it('never goes below 00:00', () => {
    const started = startClock(createMatchClock(), 0);
    expect(projectRemaining(started, DEFAULT_PERIOD_DURATION_MS + 8_000)).toBe(0);
    expect(stopClock(started, DEFAULT_PERIOD_DURATION_MS + 8_000).remainingMs).toBe(0);
    expect(startClock(stopClock(started, DEFAULT_PERIOD_DURATION_MS), 99_000).running).toBe(false);
  });

  it('ignores START when already running', () => {
    const started = startClock(createMatchClock(), 5_000);
    expect(startClock(started, 8_000)).toBe(started);
  });

  it('resets to a full stopped period', () => {
    const running = startClock(createMatchClock(10 * 60_000), 0);
    expect(resetClock(running)).toEqual(createMatchClock(10 * 60_000));
  });

  it('supports configurable period durations', () => {
    const clock = createMatchClock(5 * 60_000);
    expect(clock.periodDurationMs).toBe(300_000);
    expect(formatGameClock(clock.remainingMs)).toBe('05:00');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid period duration %s',
    (duration) => {
      expect(() => createMatchClock(duration)).toThrow(RangeError);
    },
  );

  it('does not add time if the wall clock moves backwards', () => {
    const started = startClock(createMatchClock(), 10_000);
    expect(projectRemaining(started, 5_000)).toBe(DEFAULT_PERIOD_DURATION_MS);
  });

  it('clamps a stopped persisted snapshot to the period duration', () => {
    const clock = { ...createMatchClock(), remainingMs: DEFAULT_PERIOD_DURATION_MS + 1_000 };
    expect(projectRemaining(clock, 0)).toBe(DEFAULT_PERIOD_DURATION_MS);
    expect(stopClock(clock, 0).remainingMs).toBe(DEFAULT_PERIOD_DURATION_MS);
  });

  it('keeps STOP idempotent when the clock is already stopped', () => {
    const clock = { ...createMatchClock(), remainingMs: 123_456 };
    expect(stopClock(stopClock(clock, 1_000), 50_000)).toEqual(clock);
  });
});

describe('game clock formatting', () => {
  it('formats and parses MM:SS', () => {
    expect(formatGameClock(parseGameClock('03:12'))).toBe('03:12');
    expect(formatGameClock(0)).toBe('00:00');
    expect(parseGameClock('19:43')).toBe(19 * 60_000 + 43_000);
  });

  it('formats boundaries and clamps negative values', () => {
    expect(formatGameClock(1_200_000)).toBe('20:00');
    expect(formatGameClock(59_999)).toBe('00:59');
    expect(formatGameClock(-5_000)).toBe('00:00');
  });

  it.each(['', '3:7', '03:60', 'abc', '100:00', '-1:30'])(
    'rejects invalid clock value "%s"',
    (value) => {
      expect(() => parseGameClock(value)).toThrow(`Invalid game clock: ${value}`);
    },
  );

  it('converts remaining and elapsed time', () => {
    const period = DEFAULT_PERIOD_DURATION_MS;
    expect(remainingToElapsed(period, period)).toBe(0);
    expect(elapsedToRemaining(10_000, period)).toBe(period - 10_000);
    expect(elapsedToRemaining(period + 1_000, period)).toBe(0);
    expect(remainingToElapsed(-1_000, period)).toBe(period);
    expect(remainingToElapsed(period + 1_000, period)).toBe(0);
    expect(elapsedToRemaining(-1_000, period)).toBe(period);
  });
});
