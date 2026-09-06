import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent, MatchEventBase } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { createMatchStatisticsProjection, deriveMatchStatistics } from './match-statistics';
import { derivePlayerDetailHistory, projectPlayerMatchDetail } from './player-match-detail';

const players: Player[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => ({
  id,
  teamId: 'team',
  number: index + 1,
  name: `Jugador ${id}`,
  active: true,
}));
const match: Match = {
  id: 'match',
  homeTeam: { id: 'team', name: 'Local', shortName: 'LOC' },
  awayTeam: { name: 'Rival', shortName: 'RIV' },
  date: 0,
  status: 'firstHalf',
  currentPeriod: 1,
  periodCount: 2,
  clock: createMatchClock(),
  squadPlayerIds: players.map((player) => player.id),
  startingLineupPlayerIds: ['a', 'b', 'c', 'd', 'e'],
  createdAt: 0,
  updatedAt: 0,
};
function base(sequence: number, gameClockMs: number, period = 1): MatchEventBase {
  return {
    id: `event-${sequence}`,
    matchId: match.id,
    type: 'MATCH_STARTED',
    sequence,
    timestamp: sequence,
    period,
    gameClockMs,
    undone: false,
  };
}
function start(): MatchEvent[] {
  return [
    ...match.startingLineupPlayerIds.map((playerId, index): MatchEvent => ({
      ...base(index + 1, 1_200_000),
      type: 'PLAYER_ENTERED',
      playerId,
    })),
    { ...base(6, 1_200_000), type: 'CLOCK_STARTED' },
  ];
}
function detail(
  events: MatchEvent[],
  playerId: string,
  remaining = 900_000,
  status: Match['status'] = 'firstHalf',
  onCourt = true,
) {
  const stats = deriveMatchStatistics(match, events, remaining);
  return projectPlayerMatchDetail(
    derivePlayerDetailHistory(match, events, playerId, players)!,
    stats.players[playerId]!,
    stats.playerStints[playerId] ?? [],
    status,
    onCourt,
  );
}

describe('player match detail', () => {
  it('shows a starter, one open stint and identical total and interval time', () => {
    const player = detail(start(), 'a');
    expect(player.statusLabel).toBe('EN PISTA');
    expect(player.starter).toBe(true);
    expect(player.lastMovement?.label).toContain('Titular');
    expect(player.lastStint).toMatchObject({
      open: true,
      durationMs: 300_000,
      period: 1,
      startGameClockMs: 1_200_000,
    });
    expect(player.statistics.playedMs).toBe(player.lastStint?.durationMs);
    expect(player.statistics.firstHalfMs).toBe(300_000);
  });

  it('does not invent participation before kickoff or for an unused substitute', () => {
    for (const [events, id, status] of [
      [[], 'a', 'ready'],
      [start(), 'f', 'firstHalf'],
    ] as const) {
      const player = detail([...events], id, 1_200_000, status, false);
      expect(player.statusLabel).toBe('NO HA ENTRADO');
      expect(player.statistics.playedMs).toBe(0);
      expect(player.lastStint).toBeNull();
      expect(player.lastMovement).toBeNull();
    }
  });

  it('derives both perspectives of the same substitution with remaining clock time', () => {
    const history: MatchEvent[] = [
      ...start(),
      { ...base(7, 1_000_000), type: 'SUBSTITUTION', outPlayerId: 'a', inPlayerId: 'f' },
    ];
    const outgoing = detail(history, 'a', 900_000, 'firstHalf', false);
    const incoming = detail(history, 'f');
    expect(outgoing.statusLabel).toBe('BANQUILLO');
    expect(outgoing.lastMovement).toMatchObject({
      label: 'Sale por #6 Jugador f',
      gameClockMs: 1_000_000,
    });
    expect(outgoing.lastStint).toMatchObject({
      durationMs: 200_000,
      endGameClockMs: 1_000_000,
      open: false,
    });
    expect(incoming.lastMovement?.label).toBe('Entra por #1 Jugador a');
    expect(incoming.lastStint).toMatchObject({ durationMs: 100_000, open: true });
    expect(incoming.lastMovement?.eventId).toBe(outgoing.lastMovement?.eventId);
  });

  it('keeps all repeated entries, closes periods and starts from the halftime lineup', () => {
    const history: MatchEvent[] = [
      ...start(),
      { ...base(7, 1_000_000), type: 'SUBSTITUTION', outPlayerId: 'a', inPlayerId: 'f' },
      { ...base(8, 800_000), type: 'SUBSTITUTION', outPlayerId: 'f', inPlayerId: 'a' },
      { ...base(9, 600_000), type: 'SUBSTITUTION', outPlayerId: 'a', inPlayerId: 'f' },
      { ...base(10, 0), type: 'PERIOD_ENDED' },
      { ...base(11, 0), type: 'SUBSTITUTION', outPlayerId: 'f', inPlayerId: 'a' },
      { ...base(12, 1_200_000, 2), type: 'PERIOD_STARTED' },
      { ...base(13, 1_200_000, 2), type: 'CLOCK_STARTED' },
    ];
    const player = detail([...history].reverse(), 'a', 900_000, 'secondHalf');
    expect(player.periods[0]?.movements).toHaveLength(5);
    expect(player.periods[0]?.movements.at(-1)?.duringBreak).toBe(true);
    expect(player.periods[0]?.stints).toHaveLength(2);
    expect(player.periods[0]?.stints.every((stint) => !stint.open)).toBe(true);
    expect(player.periods[1]?.stints).toHaveLength(1);
    expect(player.statistics).toMatchObject({
      firstHalfMs: 400_000,
      secondHalfMs: 300_000,
      playedMs: 700_000,
    });
    expect(
      player.periods
        .flatMap((period) => period.stints)
        .reduce((sum, stint) => sum + stint.durationMs, 0),
    ).toBe(player.statistics.playedMs);
  });

  it('freezes an open stint during pauses and closes it at full time', () => {
    const history: MatchEvent[] = [...start(), { ...base(7, 900_000), type: 'CLOCK_STOPPED' }];
    expect(detail(history, 'a', 0).lastStint).toMatchObject({ durationMs: 300_000, open: true });
    expect(detail(history, 'a', 0).statistics).toEqual(detail(history, 'a', 900_000).statistics);
    history.push({ ...base(8, 900_000), type: 'MATCH_FINISHED' });
    const final = detail(history, 'a', 0, 'finished');
    expect(final.lastStint).toMatchObject({ durationMs: 300_000, open: false });
    expect(final.matchContext).toBe('Partido finalizado');
    expect(final.status).not.toBe('onCourt');
  });

  it('handles send-offs and missing related names without exposing technical IDs', () => {
    const history: MatchEvent[] = [
      ...start(),
      {
        ...base(7, 1_000_000),
        type: 'SUBSTITUTION',
        outPlayerId: 'a',
        inPlayerId: 'missing-technical-id',
      },
    ];
    expect(detail(history, 'a', 900_000, 'firstHalf', false).lastMovement?.label).toBe(
      'Sale por Jugador no disponible',
    );
    const red: MatchEvent[] = [
      ...start(),
      {
        ...base(7, 1_000_000),
        type: 'FOUL',
        team: 'home',
        playerId: 'a',
        periodFoulNumber: 1,
        disciplinaryAction: 'directRed',
      },
    ];
    expect(detail(red, 'a', 900_000, 'firstHalf', false).statusLabel).toBe('EXPULSADO');
    expect(detail(red, 'a').lastStint?.open).toBe(false);
  });

  it('ignores undone substitutions and reconstructs the same detail after reload', () => {
    const history: MatchEvent[] = [
      ...start(),
      { ...base(7, 1_000_000), type: 'SUBSTITUTION', outPlayerId: 'a', inPlayerId: 'f' },
      { ...base(8, 1_000_000), type: 'EVENT_UNDONE', targetEventId: 'event-7' },
    ];
    expect(detail(history, 'a').periods[0]?.movements).toHaveLength(1);
    expect(detail(JSON.parse(JSON.stringify(history)), 'a')).toEqual(detail(history, 'a'));
  });

  it('projects successive clock ticks without replaying the event array or accumulating twice', () => {
    const history = start();
    const projection = createMatchStatisticsProjection(match, history);
    history[Symbol.iterator] = () => {
      throw new Error('Unexpected event replay');
    };
    expect(projection(900_000).players['a']?.playedMs).toBe(300_000);
    expect(projection(800_000).players['a']?.playedMs).toBe(400_000);
    expect(projection(900_000).playerStints['a']?.[0]?.durationMs).toBe(300_000);
  });
});
