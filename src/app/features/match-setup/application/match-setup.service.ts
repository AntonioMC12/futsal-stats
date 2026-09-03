import { inject, Injectable } from '@angular/core';
import {
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { createId } from '../../../core/utils/id';
import { DomainResult, fail } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import { createMatchRecord } from '../domain/match-setup';

export interface MatchSetupTeam {
  team: Team;
  playerCount: number;
}

export interface SaveMatchSetupInput {
  teamId: string;
  awayTeamName: string;
  squadPlayerIds: readonly string[];
  startingLineupPlayerIds: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class MatchSetupService {
  private readonly teams = inject(TEAM_REPOSITORY);
  private readonly players = inject(PLAYER_REPOSITORY);
  private readonly matches = inject(MATCH_REPOSITORY);

  async listTeams(): Promise<MatchSetupTeam[]> {
    const teams = await this.teams.list();
    const counts = await this.players.countActiveByTeamIds(teams.map((team) => team.id));
    return teams.map((team) => ({ team, playerCount: counts.get(team.id) ?? 0 }));
  }

  listPlayers(teamId: string): Promise<Player[]> {
    return this.players.listActiveByTeam(teamId);
  }

  async createMatch(input: SaveMatchSetupInput): Promise<DomainResult<Match>> {
    if (await this.matches.findActive()) {
      return fail('Ya hay un partido en curso. Termínalo antes de crear otro.');
    }

    const team = await this.teams.get(input.teamId);
    if (!team) {
      return fail('Selecciona un equipo válido.');
    }
    const players = await this.players.listActiveByTeam(team.id);
    const result = createMatchRecord({ ...input, homeTeam: team, players }, createId(), Date.now());
    if (!result.ok) {
      return result;
    }

    if (!(await this.matches.addIfNoActive(result.value))) {
      return fail('Ya hay un partido en curso. Termínalo antes de crear otro.');
    }
    return result;
  }
}
