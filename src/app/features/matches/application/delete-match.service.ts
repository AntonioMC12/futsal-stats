import { inject, Injectable } from '@angular/core';
import { FutsalStatsDb } from '../../../core/persistence/futsal-stats.db';

@Injectable({ providedIn: 'root' })
export class DeleteMatchService {
  private readonly db = inject(FutsalStatsDb);

  async execute(matchId: string): Promise<void> {
    await this.db.transaction('rw', this.db.matches, this.db.events, async () => {
      await this.db.events.where('matchId').equals(matchId).delete();
      await this.db.matches.delete(matchId);
    });
  }
}
