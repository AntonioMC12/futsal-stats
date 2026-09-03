import { inject, Injectable } from '@angular/core';
import { Player } from '../../../shared/models/player';
import { PlayerRepository } from '../ports/player.repository';
import { FutsalStatsDb } from './futsal-stats.db';
import { fromLocalPlayerRecord, toLocalPlayerRecord } from './local-record-mappers';

@Injectable()
export class DexiePlayerRepository implements PlayerRepository {
  private readonly db = inject(FutsalStatsDb);

  async listActiveByTeam(teamId: string): Promise<Player[]> {
    const players = (await this.db.players.where('teamId').equals(teamId).toArray()).map(
      fromLocalPlayerRecord,
    );
    return players
      .filter((player) => player.active)
      .sort((left, right) => left.number - right.number || left.name.localeCompare(right.name));
  }

  async listByTeam(teamId: string): Promise<Player[]> {
    return (await this.db.players.where('teamId').equals(teamId).toArray())
      .map(fromLocalPlayerRecord)
      .sort((left, right) => left.number - right.number || left.name.localeCompare(right.name));
  }

  async countActiveByTeamIds(teamIds: readonly string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>(teamIds.map((id) => [id, 0]));
    if (teamIds.length === 0) return counts;

    const players = (
      await this.db.players
        .where('teamId')
        .anyOf([...teamIds])
        .toArray()
    ).map(fromLocalPlayerRecord);
    for (const player of players) {
      if (player.active) counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
    }
    return counts;
  }

  async listByIds(playerIds: readonly string[]): Promise<Player[]> {
    if (playerIds.length === 0) return [];
    const players = await this.db.players.bulkGet([...playerIds]);
    return players
      .filter((player): player is NonNullable<typeof player> => player !== undefined)
      .map(fromLocalPlayerRecord);
  }

  async put(player: Player): Promise<string> {
    return this.db.transaction('rw', this.db.teams, this.db.players, async () => {
      if (!(await this.db.teams.get(player.teamId))) {
        throw new Error(`Player ${player.id} references missing Team ${player.teamId}`);
      }
      const previous = await this.db.players.get(player.id);
      return this.db.players.put(toLocalPlayerRecord(player, Date.now(), previous));
    });
  }
}
