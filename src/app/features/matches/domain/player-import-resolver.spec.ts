import { ImportedPlayerDto } from './match-import';
import { normalizePlayerName, suggestPlayerResolutions } from './player-import-resolver';

describe('player import resolver', () => {
  it('prefers stable id, then number and normalized name, and keeps name-only matches manual', () => {
    const imported: ImportedPlayerDto[] = [
      { importKey: 'a', sourceId: 'same-id', number: 99, name: 'Otro', startingLineup: false },
      { importKey: 'b', number: 7, name: '  ÁlEX   Muñoz ', startingLineup: true },
      { importKey: 'c', number: 12, name: 'Marta', startingLineup: false },
      { importKey: 'd', number: 4, name: 'Nueva', startingLineup: false },
    ];
    const current = [
      { id: 'same-id', teamId: 'team', number: 1, name: 'Original', active: true },
      { id: 'alex', teamId: 'team', number: 7, name: 'Alex Munoz', active: true },
      { id: 'marta', teamId: 'team', number: 2, name: 'Marta', active: true },
    ];

    expect(suggestPlayerResolutions(imported, current).map(({ resolution, confidence }) => [resolution, confidence]))
      .toEqual([
        ['existing', 'exact-id'], ['existing', 'number-and-name'],
        ['manual', 'name-only'], ['create', 'none'],
      ]);
    expect(normalizePlayerName('  PÉREZ   José ')).toBe('perez jose');
  });
});

