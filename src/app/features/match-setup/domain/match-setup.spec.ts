import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import { createMatchRecord } from './match-setup';

const team: Team = {
  id: 'team-1',
  name: 'Inter',
  shortName: 'INT',
  createdAt: 1,
  updatedAt: 1,
};

const players: Player[] = Array.from({ length: 7 }, (_, index) => ({
  id: `p${index + 1}`,
  teamId: team.id,
  number: index + 1,
  name: `Jugador ${index + 1}`,
  active: true,
}));

describe('match setup domain', () => {
  it('creates a ready match with its squad and no starting lineup', () => {
    const result = createMatchRecord(
      {
        homeTeam: team,
        awayTeamShortName: ' mng ',
        awayTeamName: '  Fútbol Sala Alicante ',
        matchDate: '2026-09-07',
        description: ' Partido amistoso ',
        players,
        squadPlayerIds: players.map((player) => player.id),
      },
      'match-1',
      100,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.status).toBe('ready');
    expect(result.value.homeTeam.id).toBe(team.id);
    expect(result.value.awayTeam).toEqual({ name: 'Fútbol Sala Alicante', shortName: 'MNG' });
    expect(result.value.date).toBe('2026-09-07');
    expect(result.value.description).toBe('Partido amistoso');
    expect(result.value.startingLineupPlayerIds).toEqual([]);
    expect(result.value.clock.remainingMs).toBe(1_200_000);
  });

  it.each([
    [
      'abbreviation',
      { awayTeamShortName: ' ' },
      'La abreviación debe tener entre 2 y 6 caracteres.',
    ],
    ['opponent', { awayTeamName: ' ' }, 'El nombre del rival es obligatorio.'],
    ['date', { matchDate: '' }, 'La fecha del partido es obligatoria.'],
    ['description', { description: ' ' }, 'La descripción es obligatoria.'],
  ])('rejects missing required %s metadata', (_field, override, error) => {
    const result = createMatchRecord(
      {
        homeTeam: team,
        awayTeamShortName: 'RIV',
        awayTeamName: 'Rival',
        matchDate: '2026-09-07',
        description: 'Partido de liga',
        players,
        squadPlayerIds: players.map((player) => player.id),
        ...override,
      },
      'match-1',
      100,
    );

    expect(result).toEqual({ ok: false, error });
  });

  it('requires at least five different squad players', () => {
    const result = createMatchRecord(
      {
        homeTeam: team,
        awayTeamShortName: 'RIV',
        awayTeamName: 'Rival',
        matchDate: '2026-09-07',
        description: 'Liga',
        players,
        squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p4'],
      },
      'match-1',
      100,
    );

    expect(result).toEqual({
      ok: false,
      error: 'Selecciona al menos 5 jugadores para el partido.',
    });
  });

  it('rejects inactive players in the squad', () => {
    const unavailable = players.map((player) =>
      player.id === 'p5' ? { ...player, active: false } : player,
    );
    const result = createMatchRecord(
      {
        homeTeam: team,
        awayTeamShortName: 'RIV',
        awayTeamName: 'Rival',
        matchDate: '2026-09-07',
        description: 'Liga',
        players: unavailable,
        squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      },
      'match-1',
      100,
    );

    expect(result).toEqual({
      ok: false,
      error: 'La convocatoria contiene jugadores que no están disponibles.',
    });
  });
});
