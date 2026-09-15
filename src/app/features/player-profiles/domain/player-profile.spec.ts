import { emptyPlayerProfile } from '../../../shared/models/player-profile';
import { updatePlayerProfile } from './player-profile';

describe('player profile', () => {
  it('normalizes and updates persistent sports information', () => {
    const current = emptyPlayerProfile('player-1', 'team-1', 10);
    expect(
      updatePlayerProfile(current, { preferredFoot: 'left', notes: '  Mejora técnica. ' }, 20),
    ).toEqual({
      ok: true,
      value: { ...current, preferredFoot: 'left', notes: 'Mejora técnica.', updatedAt: 20 },
    });
  });
  it('rejects oversized notes', () => {
    expect(
      updatePlayerProfile(
        emptyPlayerProfile('player-1', 'team-1', 10),
        { preferredFoot: 'both', notes: 'a'.repeat(2_001) },
        20,
      ),
    ).toEqual({ ok: false, error: 'Las notas no pueden superar los 2.000 caracteres.' });
  });
});
