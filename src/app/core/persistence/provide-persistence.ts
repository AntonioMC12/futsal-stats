import { Injector, Provider, Type } from '@angular/core';
import { CLOUD_CONFIG, CloudConfig } from '../cloud/cloud.config';
import { StrategyRepository } from '../../features/strategies/domain/strategy';
import { PlayerPhotoRepository } from './ports/player-photo.repository';
import { SupabaseMatchEventRepository } from './cloud/supabase-match-event.repository';
import { SupabaseMatchRepository } from './cloud/supabase-match.repository';
import { SupabasePlayerRepository } from './cloud/supabase-player.repository';
import { SupabasePlayerProfileRepository } from './cloud/supabase-player-profile.repository';
import { SupabaseTeamRepository } from './cloud/supabase-team.repository';
import { SupabaseStrategyRepository } from './cloud/supabase-strategy.repository';
import { SupabasePlayerPhotoRepository } from './cloud/supabase-player-photo.repository';
import { DexieMatchEventRepository } from './local/dexie-match-event.repository';
import { DexieMatchRepository } from './local/dexie-match.repository';
import { DexiePlayerRepository } from './local/dexie-player.repository';
import { DexiePlayerProfileRepository } from './local/dexie-player-profile.repository';
import { DexiePlayerPhotoRepository } from './local/dexie-player-photo.repository';
import { DexieStrategyRepository } from './local/dexie-strategy.repository';
import { DexieTeamRepository } from './local/dexie-team.repository';
import { FutsalStatsDb } from './local/futsal-stats.db';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_PROFILE_REPOSITORY,
  PLAYER_PHOTO_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from './persistence.tokens';
import { MatchEventRepository } from './ports/match-event.repository';
import { MatchRepository } from './ports/match.repository';
import { PlayerRepository } from './ports/player.repository';
import { PlayerProfileRepository } from './ports/player-profile.repository';
import { TeamRepository } from './ports/team.repository';
import {
  OfflineMatchEventRepository,
  OfflineMatchRepository,
  OfflinePlayerProfileRepository,
  OfflinePlayerRepository,
  OfflineTeamRepository,
} from '../sync/offline-repositories';
import { SyncRemoteGateway } from '../sync/sync-remote.gateway';
import { OfflineSyncService } from '../sync/offline-sync.service';
import { OfflineStrategyRepository } from '../sync/offline-strategy.repository';
import { OfflinePlayerPhotoRepository } from '../sync/offline-player-photo.repository';

export function providePersistence(): Provider[] {
  return [
    FutsalStatsDb,
    DexieTeamRepository,
    DexiePlayerRepository,
    DexiePlayerProfileRepository,
    DexiePlayerPhotoRepository,
    DexieMatchRepository,
    DexieMatchEventRepository,
    DexieStrategyRepository,
    SupabaseTeamRepository,
    SupabasePlayerRepository,
    SupabasePlayerProfileRepository,
    SupabaseMatchRepository,
    SupabaseMatchEventRepository,
    SupabaseStrategyRepository,
    SupabasePlayerPhotoRepository,
    SyncRemoteGateway,
    OfflineSyncService,
    OfflineTeamRepository,
    OfflinePlayerRepository,
    OfflinePlayerProfileRepository,
    OfflineMatchRepository,
    OfflineMatchEventRepository,
    OfflineStrategyRepository,
    OfflinePlayerPhotoRepository,
    {
      provide: TEAM_REPOSITORY,
      useFactory: select<TeamRepository>(DexieTeamRepository, OfflineTeamRepository),
      deps: [CLOUD_CONFIG, Injector],
    },
    {
      provide: PLAYER_REPOSITORY,
      useFactory: select<PlayerRepository>(DexiePlayerRepository, OfflinePlayerRepository),
      deps: [CLOUD_CONFIG, Injector],
    },
    {
      provide: PLAYER_PROFILE_REPOSITORY,
      useFactory: select<PlayerProfileRepository>(
        DexiePlayerProfileRepository,
        OfflinePlayerProfileRepository,
      ),
      deps: [CLOUD_CONFIG, Injector],
    },
    {
      provide: PLAYER_PHOTO_REPOSITORY,
      useFactory: select<PlayerPhotoRepository>(
        DexiePlayerPhotoRepository,
        OfflinePlayerPhotoRepository,
      ),
      deps: [CLOUD_CONFIG, Injector],
    },
    {
      provide: MATCH_REPOSITORY,
      useFactory: select<MatchRepository>(DexieMatchRepository, OfflineMatchRepository),
      deps: [CLOUD_CONFIG, Injector],
    },
    {
      provide: MATCH_EVENT_REPOSITORY,
      useFactory: select<MatchEventRepository>(
        DexieMatchEventRepository,
        OfflineMatchEventRepository,
      ),
      deps: [CLOUD_CONFIG, Injector],
    },
    {
      provide: StrategyRepository,
      useFactory: select<StrategyRepository>(DexieStrategyRepository, OfflineStrategyRepository),
      deps: [CLOUD_CONFIG, Injector],
    },
  ];
}

function select<T>(localType: Type<T>, cloudType: Type<T>) {
  return (config: CloudConfig, injector: Injector): T =>
    injector.get(config.mode === 'cloud' ? cloudType : localType);
}
