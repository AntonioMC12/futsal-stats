import { TestBed } from '@angular/core/testing';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { PlayerRepository } from '../../../core/persistence/player.repository';
import { TeamRepository } from '../../../core/persistence/team.repository';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import { MatchSetupService } from './match-setup.service';

const team: Team = {
  id: 'team-1',
  name: 'Inter',
  shortName: 'INT',
  createdAt: 1,
  updatedAt: 1,
};

const players: Player[] = Array.from({ length: 5 }, (_, index) => ({
  id: `p${index + 1}`,
  teamId: team.id,
  number: index + 1,
  name: `Jugador ${index + 1}`,
  active: true,
}));

describe('MatchSetupService', () => {
  it('persists a valid match', async () => {
    const stored: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        MatchSetupService,
        { provide: TeamRepository, useValue: { get: async () => team } },
        { provide: PlayerRepository, useValue: { listActiveByTeam: async () => players } },
        {
          provide: MatchRepository,
          useValue: {
            findActive: async () => null,
            addIfNoActive: async (match: unknown) => {
              stored.push(match);
              return true;
            },
          },
        },
      ],
    });

    const ids = players.map((player) => player.id);
    const result = await TestBed.inject(MatchSetupService).createMatch({
      teamId: team.id,
      awayTeamName: 'Rival',
      squadPlayerIds: ids,
      startingLineupPlayerIds: ids,
    });

    expect(result.ok).toBe(true);
    expect(stored).toHaveLength(1);
  });

  it('does not persist when another match is active', async () => {
    const stored: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        MatchSetupService,
        { provide: TeamRepository, useValue: {} },
        { provide: PlayerRepository, useValue: {} },
        {
          provide: MatchRepository,
          useValue: {
            findActive: async () => ({ id: 'active-match' }),
            put: async (match: unknown) => stored.push(match),
          },
        },
      ],
    });

    const result = await TestBed.inject(MatchSetupService).createMatch({
      teamId: team.id,
      awayTeamName: 'Rival',
      squadPlayerIds: [],
      startingLineupPlayerIds: [],
    });

    expect(result).toEqual({
      ok: false,
      error: 'Ya hay un partido en curso. Termínalo antes de crear otro.',
    });
    expect(stored).toHaveLength(0);
  });

  it('rejects creation if another tab wins the atomic active-match check', async () => {
    TestBed.configureTestingModule({
      providers: [
        MatchSetupService,
        { provide: TeamRepository, useValue: { get: async () => team } },
        { provide: PlayerRepository, useValue: { listActiveByTeam: async () => players } },
        {
          provide: MatchRepository,
          useValue: { findActive: async () => null, addIfNoActive: async () => false },
        },
      ],
    });

    const ids = players.map((player) => player.id);
    const result = await TestBed.inject(MatchSetupService).createMatch({
      teamId: team.id,
      awayTeamName: 'Rival',
      squadPlayerIds: ids,
      startingLineupPlayerIds: ids,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Ya hay un partido en curso. Termínalo antes de crear otro.',
    });
  });
});
