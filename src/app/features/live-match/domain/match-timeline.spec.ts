import { MatchEvent } from '../../../shared/models/match-event';
import { createMatchTimeline } from './match-timeline';

describe('match timeline', () => {
  it('shows active events newest first with formatted game time', () => {
    const events: MatchEvent[] = [
      {
        id: 'start',
        matchId: 'match-1',
        type: 'MATCH_STARTED',
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
      },
      {
        id: 'stop',
        matchId: 'match-1',
        type: 'CLOCK_STOPPED',
        period: 1,
        gameClockMs: 754_000,
        timestamp: 2,
        sequence: 2,
        undone: false,
      },
    ];

    expect(createMatchTimeline(events)).toEqual([
      {
        eventId: 'stop',
        type: 'CLOCK_STOPPED',
        period: 1,
        gameClock: '12:34',
        label: 'Reloj detenido',
      },
      {
        eventId: 'start',
        type: 'MATCH_STARTED',
        period: 1,
        gameClock: '20:00',
        label: 'Partido iniciado',
      },
    ]);
  });

  it('hides undone events and the technical undo event', () => {
    const events: MatchEvent[] = [
      {
        id: 'reset',
        matchId: 'match-1',
        type: 'CLOCK_RESET',
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
      },
      {
        id: 'undo',
        matchId: 'match-1',
        type: 'EVENT_UNDONE',
        period: 1,
        gameClockMs: 1_200_000,
        timestamp: 2,
        sequence: 2,
        undone: false,
        targetEventId: 'reset',
      },
    ];
    expect(createMatchTimeline(events)).toEqual([]);
  });

  it('uses player names in substitutions when available', () => {
    const events: MatchEvent[] = [
      {
        id: 'change',
        matchId: 'match-1',
        type: 'SUBSTITUTION',
        period: 1,
        gameClockMs: 600_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
        outPlayerId: 'p1',
        inPlayerId: 'p6',
      },
    ];
    expect(createMatchTimeline(events, { p1: 'Juan', p6: 'Luis' })[0]?.label).toBe(
      'Cambio: Juan → Luis',
    );
  });

  it('shows the accumulated foul number', () => {
    const events: MatchEvent[] = [
      {
        id: 'foul-4',
        matchId: 'match-1',
        type: 'FOUL',
        period: 1,
        gameClockMs: 500_000,
        timestamp: 1,
        sequence: 1,
        undone: false,
        team: 'home',
        periodFoulNumber: 4,
      },
    ];
    expect(createMatchTimeline(events)[0]?.label).toBe('Falta propia · 4ª');
  });
});
