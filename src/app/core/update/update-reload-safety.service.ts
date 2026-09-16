import { inject, Injectable } from '@angular/core';
import { MATCH_REPOSITORY } from '../persistence/persistence.tokens';
import { OfflineSyncService } from '../sync/offline-sync.service';

@Injectable({ providedIn: 'root' })
export class UpdateReloadSafetyService {
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly sync = inject(OfflineSyncService);

  async isReloadSafe(): Promise<boolean> {
    try {
      return (
        (await this.matches.findActive()) === null &&
        this.sync.pendingCount() === 0 &&
        this.sync.failedCount() === 0
      );
    } catch (error) {
      console.error('update_match_safety_check_failed', error);
      return false;
    }
  }
}
