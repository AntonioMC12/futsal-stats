import { Injector, Provider, Type } from '@angular/core';
import { CLOUD_CONFIG, CloudConfig } from '../cloud/cloud.config';
import { StrategyRepository } from '../../features/strategies/domain/strategy';
import { SupabaseMatchEventRepository } from './cloud/supabase-match-event.repository';
import { SupabaseMatchRepository } from './cloud/supabase-match.repository';
import { SupabasePlayerRepository } from './cloud/supabase-player.repository';
import { SupabaseTeamRepository } from './cloud/supabase-team.repository';
import { DexieMatchEventRepository } from './local/dexie-match-event.repository';
import { DexieMatchRepository } from './local/dexie-match.repository';
import { DexiePlayerRepository } from './local/dexie-player.repository';
import { DexieStrategyRepository } from './local/dexie-strategy.repository';
import { DexieTeamRepository } from './local/dexie-team.repository';
import { FutsalStatsDb } from './local/futsal-stats.db';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from './persistence.tokens';
import { MatchEventRepository } from './ports/match-event.repository';
import { MatchRepository } from './ports/match.repository';
import { PlayerRepository } from './ports/player.repository';
import { TeamRepository } from './ports/team.repository';

export function providePersistence(): Provider[] {
  return [
    FutsalStatsDb,
    DexieTeamRepository,
    DexiePlayerRepository,
    DexieMatchRepository,
    DexieMatchEventRepository,
    DexieStrategyRepository,
    SupabaseTeamRepository,
    SupabasePlayerRepository,
    SupabaseMatchRepository,
    SupabaseMatchEventRepository,
    {
      provide: TEAM_REPOSITORY,
      useFactory: select<TeamRepository>(DexieTeamRepository, SupabaseTeamRepository),
      deps: [CLOUD_CONFIG, Injector],
    },
    {
      provide: PLAYER_REPOSITORY,
      useFactory: select<PlayerRepository>(DexiePlayerRepository, SupabasePlayerRepository),
      deps: [CLOUD_CONFIG, Injector],
    },
    {
      provide: MATCH_REPOSITORY,
      useFactory: select<MatchRepository>(DexieMatchRepository, SupabaseMatchRepository),
      deps: [CLOUD_CONFIG, Injector],
    },
    {
      provide: MATCH_EVENT_REPOSITORY,
      useFactory: select<MatchEventRepository>(
        DexieMatchEventRepository,
        SupabaseMatchEventRepository,
      ),
      deps: [CLOUD_CONFIG, Injector],
    },
    { provide: StrategyRepository, useExisting: DexieStrategyRepository },
  ];
}

function select<T>(localType: Type<T>, cloudType: Type<T>) {
  return (config: CloudConfig, injector: Injector): T =>
    injector.get(config.mode === 'cloud' ? cloudType : localType);
}
