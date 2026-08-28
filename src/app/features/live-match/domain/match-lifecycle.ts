import {
  projectRemaining,
  resetClock,
  startClock,
  stopClock,
} from '../../../core/clock/match-clock';
import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';

export function startMatchClock(match: Match, now: number): DomainResult<Match> {
  if (match.status === 'ready') {
    return ok(
      update(match, now, {
        status: 'firstHalf',
        clock: startClock(resetClock(match.clock), now),
      }),
    );
  }
  if (!isPlayingPeriod(match)) {
    return fail('El reloj no se puede iniciar en el estado actual del partido.');
  }
  if (match.clock.running) {
    return fail('El reloj ya está en marcha.');
  }
  if (projectRemaining(match.clock, now) === 0) {
    return fail('El periodo ha terminado. Finalízalo para continuar.');
  }
  return ok(update(match, now, { clock: startClock(match.clock, now) }));
}

export function stopMatchClock(match: Match, now: number): DomainResult<Match> {
  if (!isPlayingPeriod(match)) {
    return fail('El reloj no se puede detener en el estado actual del partido.');
  }
  if (!match.clock.running) {
    return fail('El reloj ya está detenido.');
  }
  return ok(update(match, now, { clock: stopClock(match.clock, now) }));
}

export function resetMatchClock(match: Match, now: number): DomainResult<Match> {
  if (!isPlayingPeriod(match)) {
    return fail('El reloj no se puede reiniciar en el estado actual del partido.');
  }
  if (match.clock.running) {
    return fail('Detén el reloj antes de reiniciarlo.');
  }
  return ok(update(match, now, { clock: resetClock(match.clock) }));
}

export function finishPeriod(match: Match, now: number): DomainResult<Match> {
  if (!isPlayingPeriod(match)) {
    return fail('No hay ningún periodo en juego que se pueda finalizar.');
  }

  const clock = stopClock(match.clock, now);
  if (clock.remainingMs > 0) {
    return fail('El periodo solo se puede finalizar cuando el reloj llega a 00:00.');
  }

  if (match.currentPeriod < match.periodCount) {
    return ok(update(match, now, { status: 'halftime', clock }));
  }
  return ok(update(match, now, { status: 'finished', clock }));
}

export function startNextPeriod(match: Match, now: number): DomainResult<Match> {
  if (match.status !== 'halftime') {
    return fail('El siguiente periodo solo se puede iniciar durante el descanso.');
  }
  if (match.currentPeriod >= match.periodCount) {
    return fail('No quedan periodos por disputar.');
  }

  const currentPeriod = match.currentPeriod + 1;
  const clock = startClock(resetClock(match.clock), now);
  return ok(update(match, now, { currentPeriod, status: 'secondHalf', clock }));
}

export function synchronizeExpiredClock(match: Match, now: number): Match {
  if (!isPlayingPeriod(match) || !match.clock.running || projectRemaining(match.clock, now) > 0) {
    return match;
  }
  return update(match, now, { clock: stopClock(match.clock, now) });
}

function isPlayingPeriod(match: Match): boolean {
  return match.status === 'firstHalf' || match.status === 'secondHalf';
}

function update(match: Match, now: number, changes: Partial<Match>): Match {
  return { ...match, ...changes, updatedAt: now };
}
