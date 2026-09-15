import { inject, Injectable } from '@angular/core';
import { PlayerProfile } from '../../../shared/models/player-profile';
import { PlayerProfileRepository } from '../ports/player-profile.repository';
import { FutsalStatsDb } from './futsal-stats.db';
import { fromLocalPlayerProfileRecord, toLocalPlayerProfileRecord } from './local-record-mappers';

@Injectable()
export class DexiePlayerProfileRepository implements PlayerProfileRepository {
  private readonly db = inject(FutsalStatsDb);

  async get(playerId: string): Promise<PlayerProfile | undefined> {
    const record = await this.db.playerProfiles.get(playerId);
    return record ? fromLocalPlayerProfileRecord(record) : undefined;
  }

  async listByTeam(teamId: string): Promise<PlayerProfile[]> {
    return (await this.db.playerProfiles.where('teamId').equals(teamId).toArray()).map(
      fromLocalPlayerProfileRecord,
    );
  }

  async put(profile: PlayerProfile): Promise<string> {
    return this.db.transaction('rw', this.db.players, this.db.playerProfiles, async () => {
      const player = await this.db.players.get(profile.playerId);
      if (!player || player.teamId !== profile.teamId) {
        throw new Error(`PlayerProfile references missing or foreign Player ${profile.playerId}`);
      }
      const previous = await this.db.playerProfiles.get(profile.playerId);
      return this.db.playerProfiles.put(toLocalPlayerProfileRecord(profile, previous));
    });
  }
}
