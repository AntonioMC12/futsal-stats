import { RAVI_STRATEGY } from './ravi.strategy';

describe('Ravi strategy', () => {
  it('defines a serializable five-phase strategy with stable identifiers', () => {
    expect(RAVI_STRATEGY.name).toBe('Ravi');
    expect(RAVI_STRATEGY.category).toBe('Salida de presión');
    expect(RAVI_STRATEGY.players).toHaveLength(5);
    expect(RAVI_STRATEGY.phases).toHaveLength(5);
    expect(JSON.parse(JSON.stringify(RAVI_STRATEGY))).toEqual(RAVI_STRATEGY);

    const ids = [
      RAVI_STRATEGY.id,
      ...RAVI_STRATEGY.players.map(({ id }) => id),
      ...RAVI_STRATEGY.actions.map(({ id }) => id),
      ...RAVI_STRATEGY.phases.map(({ id }) => id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))).toBe(true);
  });

  it('preserves the reference positions and actions in each phase', () => {
    const [initial, goalkeeperPass, passAndRun, crossRun, balance] = RAVI_STRATEGY.phases;
    const player2 = RAVI_STRATEGY.players.find(({ label }) => label === '2')!;
    const player3 = RAVI_STRATEGY.players.find(({ label }) => label === '3')!;
    const player4 = RAVI_STRATEGY.players.find(({ label }) => label === '4')!;
    const player5 = RAVI_STRATEGY.players.find(({ label }) => label === '5')!;

    expect(initial?.ballPosition).toEqual({ x: 910, y: 300 });
    expect(goalkeeperPass?.ballPosition).toEqual({ x: 785, y: 160 });
    expect(goalkeeperPass?.playerPositions[player5.id]).toEqual({ x: 660, y: 220 });
    expect(passAndRun?.playerPositions[player2.id]).toEqual({ x: 235, y: 400 });
    expect(passAndRun?.playerPositions[player5.id]).toEqual({ x: 300, y: 90 });
    expect(crossRun?.playerPositions[player3.id]).toEqual({ x: 600, y: 175 });
    expect(balance?.ballPosition).toEqual({ x: 500, y: 300 });
    expect(balance?.playerPositions[player4.id]).toEqual({ x: 750, y: 300 });
    expect(balance?.visibleActionIds).toHaveLength(3);
  });
});
