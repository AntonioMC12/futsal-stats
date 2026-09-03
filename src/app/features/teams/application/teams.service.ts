import { inject, Injectable } from '@angular/core';
import { PLAYER_REPOSITORY, TEAM_REPOSITORY } from '../../../core/persistence/persistence.tokens';
import { createId } from '../../../core/utils/id';
import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import {
  createPlayerRecord,
  createTeamRecord,
  deactivatePlayerRecord,
  PlayerInput,
  TeamInput,
  updatePlayerRecord,
  updateTeamRecord,
} from '../domain/roster';

export interface TeamSummary {
  team: Team;
  playerCount: number;
}

@Injectable({ providedIn: 'root' })
export class TeamsService {
  private readonly teams = inject(TEAM_REPOSITORY);
  private readonly players = inject(PLAYER_REPOSITORY);

  async listSummaries(): Promise<TeamSummary[]> {
    const teams = await this.teams.list();
    const counts = await this.players.countActiveByTeamIds(teams.map((team) => team.id));
    return teams.map((team) => ({
      team,
      playerCount: counts.get(team.id) ?? 0,
    }));
  }

  getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  listRoster(teamId: string): Promise<Player[]> {
    return this.players.listActiveByTeam(teamId);
  }

  async createTeam(input: TeamInput): Promise<DomainResult<Team>> {
    const record = createTeamRecord(input, createId(), Date.now());
    if (!record.ok) {
      return record;
    }
    await this.teams.put(record.value);
    return record;
  }

  async updateTeam(teamId: string, input: TeamInput): Promise<DomainResult<Team>> {
    const current = await this.teams.get(teamId);
    if (!current) {
      return fail('No se ha encontrado el equipo.');
    }
    const record = updateTeamRecord(current, input, Date.now());
    if (!record.ok) {
      return record;
    }
    await this.teams.put(record.value);
    return record;
  }

  async addPlayer(input: PlayerInput): Promise<DomainResult<Player>> {
    const roster = await this.players.listActiveByTeam(input.teamId);
    const record = createPlayerRecord(input, roster, createId());
    if (!record.ok) {
      return record;
    }
    await this.players.put(record.value);
    return record;
  }

  async updatePlayer(playerId: string, input: PlayerInput): Promise<DomainResult<Player>> {
    const roster = await this.players.listActiveByTeam(input.teamId);
    const current = roster.find((player) => player.id === playerId);
    if (!current) {
      return fail('No se ha encontrado el jugador.');
    }
    const record = updatePlayerRecord(current, input, roster);
    if (!record.ok) {
      return record;
    }
    await this.players.put(record.value);
    return record;
  }

  async removePlayer(teamId: string, playerId: string): Promise<DomainResult<Player>> {
    const roster = await this.players.listActiveByTeam(teamId);
    const current = roster.find((player) => player.id === playerId);
    if (!current) {
      return fail('No se ha encontrado el jugador.');
    }
    const record = deactivatePlayerRecord(current);
    await this.players.put(record);
    return ok(record);
  }
}
