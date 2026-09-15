import { inject, Injectable } from '@angular/core';
import { MATCH_REPOSITORY } from '../persistence/persistence.tokens';

@Injectable({ providedIn: 'root' })
export class UpdateReloadSafetyService {
  private readonly matches = inject(MATCH_REPOSITORY);

  async isReloadSafe(): Promise<boolean> {
    try {
      return (await this.matches.findActive()) === null;
    } catch (error) {
      console.error('update_match_safety_check_failed', error);
      return false;
    }
  }
}
