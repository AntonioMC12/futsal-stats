import { inject, Injectable } from '@angular/core';
import { FutsalStatsDb } from '../persistence/futsal-stats.db';
import { APAGA_SEED_KEY, createApagaPlayers, createApagaTeam } from './built-in-teams';

@Injectable({ providedIn: 'root' })
export class BuiltInDataInitializer {
  private readonly db = inject(FutsalStatsDb);

  async ensureBuiltInTeams(): Promise<void> {
    await this.db.transaction('rw', this.db.teams, this.db.players, async () => {
      const existing = await this.db.teams.where('seedKey').equals(APAGA_SEED_KEY).first();
      if (existing) {
        return;
      }

      await this.db.teams.put(createApagaTeam(Date.now()));
      await this.db.players.bulkPut(createApagaPlayers());
    });
  }
}
