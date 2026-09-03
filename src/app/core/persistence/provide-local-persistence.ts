import { Provider } from '@angular/core';
import { DexieMatchEventRepository } from './local/dexie-match-event.repository';
import { DexieMatchRepository } from './local/dexie-match.repository';
import { DexiePlayerRepository } from './local/dexie-player.repository';
import { DexieTeamRepository } from './local/dexie-team.repository';
import { FutsalStatsDb } from './local/futsal-stats.db';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from './persistence.tokens';

export function provideLocalPersistence(): Provider[] {
  return [
    FutsalStatsDb,
    DexieTeamRepository,
    DexiePlayerRepository,
    DexieMatchRepository,
    DexieMatchEventRepository,
    { provide: TEAM_REPOSITORY, useExisting: DexieTeamRepository },
    { provide: PLAYER_REPOSITORY, useExisting: DexiePlayerRepository },
    { provide: MATCH_REPOSITORY, useExisting: DexieMatchRepository },
    { provide: MATCH_EVENT_REPOSITORY, useExisting: DexieMatchEventRepository },
  ];
}
