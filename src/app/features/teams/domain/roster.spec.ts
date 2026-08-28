import {
  createPlayerRecord,
  createTeamRecord,
  deactivatePlayerRecord,
  suggestShortName,
  updatePlayerRecord,
  updateTeamRecord,
} from './roster';
import { Player } from '../../../shared/models/player';

function player(partial: Partial<Player> & Pick<Player, 'id' | 'number' | 'name'>): Player {
  return {
    teamId: 'team-1',
    active: true,
    ...partial,
  };
}

describe('team roster domain', () => {
  it('suggests short names from one or several words', () => {
    expect(suggestShortName('Inter')).toBe('INT');
    expect(suggestShortName('Fútbol Sala Alicante')).toBe('FSA');
  });

  it('creates a team and fills shortName when empty', () => {
    const result = createTeamRecord({ name: '  Inter Movistar  ', shortName: '' }, 't1', 10);
    expect(result).toEqual({
      ok: true,
      value: {
        id: 't1',
        name: 'Inter Movistar',
        shortName: 'IM',
        createdAt: 10,
        updatedAt: 10,
      },
    });
  });

  it('rejects an empty team name', () => {
    expect(createTeamRecord({ name: '   ', shortName: 'INT' }, 't1', 1)).toEqual({
      ok: false,
      error: 'El nombre del equipo es obligatorio.',
    });
  });

  it('updates team fields', () => {
    const created = createTeamRecord({ name: 'Casa', shortName: 'CAS' }, 't1', 1);
    if (!created.ok) {
      throw new Error('expected team');
    }
    const updated = updateTeamRecord(created.value, { name: 'Casa B', shortName: 'CSB' }, 2);
    expect(updated.ok && updated.value.name).toBe('Casa B');
    expect(updated.ok && updated.value.updatedAt).toBe(2);
  });

  it('adds a player and blocks a duplicate shirt number', () => {
    const roster = [player({ id: 'p1', number: 10, name: 'Juan' })];
    const added = createPlayerRecord(
      { teamId: 'team-1', number: '7', name: '  Alex  ' },
      roster,
      'p2',
    );
    expect(added.ok && added.value).toEqual({
      id: 'p2',
      teamId: 'team-1',
      number: 7,
      name: 'Alex',
      position: undefined,
      active: true,
    });
    expect(createPlayerRecord({ teamId: 'team-1', number: 10, name: 'Pedro' }, roster, 'p3')).toEqual(
      {
        ok: false,
        error: 'Ya hay un jugador con el dorsal 10.',
      },
    );
  });

  it('allows a player to keep their own number when editing', () => {
    const current = player({ id: 'p1', number: 10, name: 'Juan' });
    const result = updatePlayerRecord(
      current,
      { teamId: 'team-1', number: '10', name: 'Juan Carlos' },
      [current, player({ id: 'p2', number: 4, name: 'Pedro' })],
    );
    expect(result.ok && result.value.name).toBe('Juan Carlos');
    expect(result.ok && result.value.number).toBe(10);
  });

  it('deactivates a player without deleting the record shape', () => {
    expect(deactivatePlayerRecord(player({ id: 'p1', number: 1, name: 'Juan' })).active).toBe(false);
  });
});
