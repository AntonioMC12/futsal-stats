import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { deriveDisciplinaryState } from './discipline';
import { createDisciplineView } from './discipline-view';

const players: Player[] = [
  { id: 'cala', teamId: 'team-1', number: 5, name: 'CALA', active: true },
  { id: 'mara', teamId: 'team-1', number: 7, name: 'MARA', active: true },
  { id: 'adri', teamId: 'team-1', number: 10, name: 'ADRI', active: true },
  { id: 'keko', teamId: 'team-1', number: 14, name: 'KEKO', active: true },
];

function foul(
  id: string,
  sequence: number,
  team: 'home' | 'away',
  options: {
    playerId?: string;
    opponentPlayerNumber?: number;
    action?: 'none' | 'yellow' | 'secondYellow' | 'directRed';
    period?: number;
    elapsedMs?: number;
  } = {},
): MatchEvent {
  const elapsedMs = options.elapsedMs ?? sequence * 1_000;
  return {
    id,
    matchId: 'match-1',
    type: 'FOUL',
    team,
    playerId: options.playerId,
    opponentPlayerNumber: options.opponentPlayerNumber,
    accumulated: true,
    disciplinaryAction: options.action ?? 'none',
    periodFoulNumber: sequence,
    period: options.period ?? 1,
    gameClockMs: 1_200_000 - elapsedMs,
    matchElapsedMs: elapsedMs,
    timestamp: sequence,
    sequence,
    undone: false,
  };
}

function project(events: MatchEvent[], elapsedMs = 20_000, period = 1) {
  return createDisciplineView(deriveDisciplinaryState(events, elapsedMs), players, events, period);
}

describe('discipline view projection', () => {
  it('groups current-period home fouls by player and exposes a yellow card', () => {
    const view = project([
      foul('cala-1', 1, 'home', { playerId: 'cala' }),
      foul('mara-1', 2, 'home', { playerId: 'mara' }),
      foul('cala-2', 3, 'home', { playerId: 'cala', action: 'yellow' }),
      foul('old-period', 4, 'home', { playerId: 'cala', period: 2 }),
    ]);

    expect(view.home.totals.fouls).toBe(3);
    expect(view.home.participants.map(({ name, fouls }) => ({ name, fouls }))).toEqual([
      { name: 'CALA', fouls: 2 },
      { name: 'MARA', fouls: 1 },
    ]);
    expect(view.home.participants[0]).toMatchObject({
      ordinaryYellowCards: 1,
      secondYellowSendOffs: 0,
      directRedCards: 0,
    });
  });

  it('distinguishes second-yellow and direct-red send-offs', () => {
    const view = project([
      foul('adri-yellow', 1, 'home', { playerId: 'adri', action: 'yellow' }),
      foul('adri-second', 2, 'home', { playerId: 'adri', action: 'secondYellow' }),
      foul('keko-red', 3, 'home', { playerId: 'keko', action: 'directRed' }),
    ]);

    expect(view.home.participants.find((player) => player.name === 'ADRI')).toMatchObject({
      yellowCards: 2,
      ordinaryYellowCards: 1,
      secondYellowSendOffs: 1,
      directRedCards: 0,
      sentOff: true,
    });
    expect(view.home.participants.find((player) => player.name === 'KEKO')).toMatchObject({
      secondYellowSendOffs: 0,
      directRedCards: 1,
      sentOff: true,
    });
  });

  it('projects rival discipline by number and preserves unattributed fouls', () => {
    const view = project([
      foul('rival-seven', 1, 'away', { opponentPlayerNumber: 7, action: 'yellow' }),
      foul('unknown-1', 2, 'away'),
      foul('unknown-2', 3, 'away'),
    ]);

    expect(view.away.totals.fouls).toBe(3);
    expect(view.away.participants).toEqual([
      expect.objectContaining({ number: 7, fouls: 1, ordinaryYellowCards: 1 }),
    ]);
    expect(view.away.unattributedFouls).toBe(2);
  });

  it('recomputes after undo and removes the undone activity', () => {
    const card = foul('yellow', 1, 'home', { playerId: 'cala', action: 'yellow' });
    const undo: MatchEvent = {
      id: 'undo-yellow',
      matchId: 'match-1',
      type: 'EVENT_UNDONE',
      targetEventId: card.id,
      period: 1,
      gameClockMs: 1_199_000,
      timestamp: 2,
      sequence: 2,
      undone: false,
    };

    expect(project([card]).home.participants).toHaveLength(1);
    expect(project([card, undo]).home.participants).toEqual([]);
    expect(project([card, undo]).hasActivity).toBe(false);
  });

  it('identifies the sanctioned rival and exposes its remaining reduction time', () => {
    const view = project(
      [
        foul('rival-red', 1, 'away', {
          opponentPlayerNumber: 10,
          action: 'directRed',
          elapsedMs: 10_000,
        }),
      ],
      40_000,
    );

    expect(view.activeSanctions).toEqual([
      expect.objectContaining({
        team: 'away',
        number: 10,
        source: 'directRed',
        status: 'active',
        remainingMs: 90_000,
      }),
    ]);
  });
});
