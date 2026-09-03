import {
  createMatchClock,
  DEFAULT_PERIOD_DURATION_MS,
  projectRemaining,
  startClock,
  stopClock,
} from '../../../core/clock/match-clock';
import { Match, MatchStatus } from '../../../shared/models/match';
import {
  finishPeriod,
  resetMatchClock,
  startMatchClock,
  startNextPeriod,
  stopMatchClock,
  synchronizeExpiredClock,
} from './match-lifecycle';

function match(status: MatchStatus = 'ready', currentPeriod = 1): Match {
  return {
    id: 'match-1',
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: 1,
    status,
    currentPeriod,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('match clock lifecycle', () => {
  it('starts a ready match in the first half', () => {
    const result = startMatchClock(match(), 1_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe('firstHalf');
    expect(result.value.currentPeriod).toBe(1);
    expect(result.value.clock.running).toBe(true);
    expect(result.value.clock.startedAtEpochMs).toBe(1_000);
    expect(result.value.updatedAt).toBe(1_000);
  });

  it('stops and resumes without losing elapsed time', () => {
    const started = startMatchClock(match(), 1_000);
    if (!started.ok) throw new Error('expected started match');
    const stopped = stopMatchClock(started.value, 11_000);
    if (!stopped.ok) throw new Error('expected stopped clock');
    const resumed = startMatchClock(stopped.value, 20_000);
    if (!resumed.ok) throw new Error('expected resumed clock');

    expect(projectRemaining(resumed.value.clock, 25_000)).toBe(DEFAULT_PERIOD_DURATION_MS - 15_000);
  });

  it('rejects repeated START and STOP commands', () => {
    const active = match('firstHalf');
    active.clock = startClock(active.clock, 1_000);
    expect(startMatchClock(active, 2_000)).toEqual({
      ok: false,
      error: 'El reloj ya está en marcha.',
    });

    active.clock = stopClock(active.clock, 2_000);
    expect(stopMatchClock(active, 3_000)).toEqual({
      ok: false,
      error: 'El reloj ya está detenido.',
    });
  });

  it.each<MatchStatus>(['ready', 'halftime', 'finished'])('does not allow STOP in %s', (status) => {
    expect(stopMatchClock(match(status), 10)).toEqual({
      ok: false,
      error: 'El reloj no se puede detener en el estado actual del partido.',
    });
  });

  it.each<MatchStatus>(['halftime', 'finished'])('does not allow START in %s', (status) => {
    expect(startMatchClock(match(status), 10)).toEqual({
      ok: false,
      error: 'El reloj no se puede iniciar en el estado actual del partido.',
    });
  });

  it('resets only a stopped active period', () => {
    const active = match('firstHalf');
    active.clock = { ...active.clock, remainingMs: 321_000 };
    const reset = resetMatchClock(active, 20);
    expect(reset.ok && reset.value.clock).toEqual(createMatchClock());

    active.clock = startClock(active.clock, 10);
    expect(resetMatchClock(active, 20)).toEqual({
      ok: false,
      error: 'Detén el reloj antes de reiniciarlo.',
    });
  });

  it('does not finish a period before 00:00, even if stopped', () => {
    const active = match('firstHalf');
    expect(finishPeriod(active, 100)).toEqual({
      ok: false,
      error: 'El periodo solo se puede finalizar cuando el reloj llega a 00:00.',
    });
  });

  it('moves from the first half to halftime at 00:00', () => {
    const active = match('firstHalf');
    active.clock = startClock(active.clock, 0);
    const result = finishPeriod(active, DEFAULT_PERIOD_DURATION_MS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe('halftime');
    expect(result.value.currentPeriod).toBe(1);
    expect(result.value.clock).toEqual({
      ...createMatchClock(),
      remainingMs: 0,
    });
  });

  it('starts the second half at the configured full duration', () => {
    const halftime = match('halftime');
    halftime.clock = { ...createMatchClock(600_000), remainingMs: 0 };
    const result = startNextPeriod(halftime, 50_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe('secondHalf');
    expect(result.value.currentPeriod).toBe(2);
    expect(result.value.clock).toEqual({
      periodDurationMs: 600_000,
      remainingMs: 600_000,
      running: true,
      startedAtEpochMs: 50_000,
    });
  });

  it('finishes the match when the last period ends', () => {
    const active = match('secondHalf', 2);
    active.clock = startClock(active.clock, 0);
    const result = finishPeriod(active, DEFAULT_PERIOD_DURATION_MS + 5_000);
    expect(result.ok && result.value.status).toBe('finished');
    expect(result.ok && result.value.clock.running).toBe(false);
  });

  it('does not start a next period outside halftime', () => {
    expect(startNextPeriod(match('firstHalf'), 10)).toEqual({
      ok: false,
      error: 'El siguiente periodo solo se puede iniciar durante el descanso.',
    });
  });

  it('automatically freezes an expired running clock without changing period', () => {
    const active = match('firstHalf');
    active.clock = startClock(active.clock, 1_000);
    const synchronized = synchronizeExpiredClock(active, DEFAULT_PERIOD_DURATION_MS + 1_000);
    expect(synchronized.status).toBe('firstHalf');
    expect(synchronized.clock.remainingMs).toBe(0);
    expect(synchronized.clock.running).toBe(false);
  });

  it('does not rewrite a clock that has not expired', () => {
    const active = match('firstHalf');
    active.clock = startClock(active.clock, 1_000);
    expect(synchronizeExpiredClock(active, 2_000)).toBe(active);

    active.clock = stopClock(active.clock, 2_000);
    expect(synchronizeExpiredClock(active, 50_000)).toBe(active);
  });
});
