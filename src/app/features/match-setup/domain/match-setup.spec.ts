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
  it('creates a ready match with its squad and starting lineup', () => {
    const result = createMatchRecord(
      {
        homeTeam: team,
        awayTeamName: '  Fútbol Sala Alicante ',
        players,
        squadPlayerIds: players.map((player) => player.id),
        startingLineupPlayerIds: players.slice(0, 5).map((player) => player.id),
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
    expect(result.value.awayTeam).toEqual({ name: 'Fútbol Sala Alicante', shortName: 'FSA' });
    expect(result.value.startingLineupPlayerIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(result.value.clock.remainingMs).toBe(1_200_000);
  });

  it('requires exactly five different starters', () => {
    const result = createMatchRecord(
      {
        homeTeam: team,
        awayTeamName: 'Rival',
        players,
        squadPlayerIds: players.map((player) => player.id),
        startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p4'],
      },
      'match-1',
      100,
    );

    expect(result).toEqual({
      ok: false,
      error: 'Selecciona exactamente 5 jugadores para el quinteto inicial.',
    });
  });

  it('rejects starters outside the squad', () => {
    const result = createMatchRecord(
      {
        homeTeam: team,
        awayTeamName: 'Rival',
        players,
        squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
        startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p6'],
      },
      'match-1',
      100,
    );

    expect(result).toEqual({
      ok: false,
      error: 'El quinteto inicial debe formar parte de la convocatoria.',
    });
  });

  it('rejects inactive players in the squad', () => {
    const unavailable = players.map((player) =>
      player.id === 'p5' ? { ...player, active: false } : player,
    );
    const result = createMatchRecord(
      {
        homeTeam: team,
        awayTeamName: 'Rival',
        players: unavailable,
        squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
        startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
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
