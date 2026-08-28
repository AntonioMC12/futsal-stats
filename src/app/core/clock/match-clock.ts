export const DEFAULT_PERIOD_DURATION_MS = 20 * 60 * 1000;

export interface MatchClockState {
  periodDurationMs: number;
  remainingMs: number;
  running: boolean;
  startedAtEpochMs: number | null;
}

export function createMatchClock(
  periodDurationMs: number = DEFAULT_PERIOD_DURATION_MS,
): MatchClockState {
  if (!Number.isFinite(periodDurationMs) || periodDurationMs <= 0) {
    throw new RangeError('Period duration must be a positive finite number.');
  }

  return {
    periodDurationMs,
    remainingMs: periodDurationMs,
    running: false,
    startedAtEpochMs: null,
  };
}

export function projectRemaining(clock: MatchClockState, nowEpochMs: number): number {
  if (!clock.running || clock.startedAtEpochMs === null) {
    return clampRemaining(clock.remainingMs, clock.periodDurationMs);
  }

  const elapsedMs = Math.max(0, nowEpochMs - clock.startedAtEpochMs);
  return clampRemaining(clock.remainingMs - elapsedMs, clock.periodDurationMs);
}

export function startClock(clock: MatchClockState, nowEpochMs: number): MatchClockState {
  if (clock.running) {
    return clock;
  }

  const remainingMs = projectRemaining(clock, nowEpochMs);
  if (remainingMs <= 0) {
    return {
      ...clock,
      remainingMs: 0,
      running: false,
      startedAtEpochMs: null,
    };
  }

  return {
    ...clock,
    remainingMs,
    running: true,
    startedAtEpochMs: nowEpochMs,
  };
}

export function stopClock(clock: MatchClockState, nowEpochMs: number): MatchClockState {
  if (!clock.running) {
    return {
      ...clock,
      remainingMs: clampRemaining(clock.remainingMs, clock.periodDurationMs),
      startedAtEpochMs: null,
    };
  }

  return {
    ...clock,
    remainingMs: projectRemaining(clock, nowEpochMs),
    running: false,
    startedAtEpochMs: null,
  };
}

export function resetClock(clock: MatchClockState): MatchClockState {
  return createMatchClock(clock.periodDurationMs);
}

export function formatGameClock(remainingMs: number): string {
  const totalSeconds = Math.floor(clampRemaining(remainingMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

export function parseGameClock(value: string): number {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid game clock: ${value}`);
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return (minutes * 60 + seconds) * 1000;
}

export function remainingToElapsed(remainingMs: number, periodDurationMs: number): number {
  return clampRemaining(periodDurationMs - remainingMs, periodDurationMs);
}

export function elapsedToRemaining(elapsedMs: number, periodDurationMs: number): number {
  return clampRemaining(periodDurationMs - elapsedMs, periodDurationMs);
}

function clampRemaining(value: number, max: number = Number.POSITIVE_INFINITY): number {
  return Math.min(max, Math.max(0, value));
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
