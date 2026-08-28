import { TestBed } from '@angular/core/testing';
import { PlayerRepository } from '../../../core/persistence/player.repository';
import { TeamRepository } from '../../../core/persistence/team.repository';
import { TeamsService } from './teams.service';

describe('TeamsService', () => {
  it('creates a team and persists it', async () => {
    const stored: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        TeamsService,
        {
          provide: TeamRepository,
          useValue: {
            put: async (team: unknown) => stored.push(team),
            get: async () => undefined,
            list: async () => [],
          },
        },
        {
          provide: PlayerRepository,
          useValue: {
            listActiveByTeam: async () => [],
            countActiveByTeamIds: async () => new Map(),
            put: async () => undefined,
          },
        },
      ],
    });

    const service = TestBed.inject(TeamsService);
    const result = await service.createTeam({ name: 'Inter', shortName: '' });

    expect(result.ok).toBe(true);
    expect(stored).toHaveLength(1);
  });

  it('does not persist a player with a duplicated number', async () => {
    const puts: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        TeamsService,
        { provide: TeamRepository, useValue: {} },
        {
          provide: PlayerRepository,
          useValue: {
            listActiveByTeam: async () => [
              { id: 'p1', teamId: 't1', number: 9, name: 'Luis', active: true },
            ],
            put: async (player: unknown) => puts.push(player),
          },
        },
      ],
    });

    const result = await TestBed.inject(TeamsService).addPlayer({
      teamId: 't1',
      number: '9',
      name: 'Mario',
    });

    expect(result).toEqual({ ok: false, error: 'Ya hay un jugador con el dorsal 9.' });
    expect(puts).toHaveLength(0);
  });
});
