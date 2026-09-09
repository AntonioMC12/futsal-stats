import { emptyPlayerProfile } from '../../../shared/models/player-profile';
import { updatePlayerProfile } from './player-profile';

describe('player profile', () => {
  it('normalizes and updates persistent sports information', () => {
    const current = emptyPlayerProfile('player-1', 'team-1', 10);
    const result = updatePlayerProfile(
      current,
      {
        photoUrl: ' https://example.com/player.jpg ',
        preferredFoot: 'left',
        notes: '  Mejora en salida de presión. ',
      },
      20,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        ...current,
        photoUrl: 'https://example.com/player.jpg',
        preferredFoot: 'left',
        notes: 'Mejora en salida de presión.',
        updatedAt: 20,
      },
    });
  });

  it('rejects unsafe photo URLs and oversized notes', () => {
    const current = emptyPlayerProfile('player-1', 'team-1', 10);
    expect(
      updatePlayerProfile(
        current,
        { photoUrl: 'javascript:alert(1)', preferredFoot: 'unknown', notes: '' },
        20,
      ),
    ).toEqual({ ok: false, error: 'La foto debe ser una URL http o https válida.' });
    expect(
      updatePlayerProfile(
        current,
        { photoUrl: '', preferredFoot: 'both', notes: 'a'.repeat(2_001) },
        20,
      ),
    ).toEqual({ ok: false, error: 'Las notas no pueden superar los 2.000 caracteres.' });
  });
});
