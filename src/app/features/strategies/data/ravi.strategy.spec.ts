import { RAVI_STRATEGY } from './ravi.strategy';
describe('RAVI_STRATEGY', () => {
  it('is a complete normalized five-sequence fixture', () => {
    expect(RAVI_STRATEGY.teamId).toBeTruthy();
    expect(RAVI_STRATEGY.phases).toHaveLength(5);
    for (const phase of RAVI_STRATEGY.phases) {
      expect(phase.pieces).toHaveLength(11);
      expect(phase.durationMs).toBe(1000);
    }
    expect(RAVI_STRATEGY.phases[2]?.arrows.map(({ type }) => type)).toEqual(['pass', 'movement']);
  });
});
