import { RAVI_STRATEGY } from '../data/ravi.strategy';
import { filterAndSortStrategies } from './strategy-library';
describe('strategy library', () => {
  const older = {
    ...RAVI_STRATEGY,
    id: 'older',
    name: 'Banda derecha',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
  const newer = {
    ...RAVI_STRATEGY,
    id: 'newer',
    name: 'Córner corto',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  it('filters by name without case and sorts recently updated first', () => {
    expect(filterAndSortStrategies([older, newer], '')).toEqual([newer, older]);
    expect(filterAndSortStrategies([older, newer], 'BANDA')).toEqual([older]);
  });
});
