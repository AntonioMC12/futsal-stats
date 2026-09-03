import { inject, Injectable } from '@angular/core';
import { MATCH_REPOSITORY } from '../../../core/persistence/persistence.tokens';

@Injectable({ providedIn: 'root' })
export class DeleteMatchService {
  private readonly matches = inject(MATCH_REPOSITORY);

  async execute(matchId: string): Promise<void> {
    await this.matches.delete(matchId);
  }
}
