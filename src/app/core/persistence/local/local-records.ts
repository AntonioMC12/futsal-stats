import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { PlayerProfile } from '../../../shared/models/player-profile';
import { Team } from '../../../shared/models/team';
import { LocalSyncMetadata } from './sync-metadata';
import { Strategy } from '../../../features/strategies/domain/strategy';

export type LocalTeamRecord = Team &
  LocalSyncMetadata & {
    accessRevoked?: boolean;
    everSynced?: boolean;
  };
export type LocalPlayerRecord = Player & LocalSyncMetadata;
export type LocalPlayerProfileRecord = PlayerProfile & LocalSyncMetadata;
export interface LocalPlayerPhotoRecord {
  storageKey: string;
  teamId: string;
  playerId: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: ArrayBuffer;
  updatedAt: number;
  syncStatus?: 'pending' | 'synced' | 'failed';
}
export type LocalMatchRecord = Match & LocalSyncMetadata;
export type LocalMatchEventRecord = MatchEvent & LocalSyncMetadata;
export type LocalStrategyRecord = Strategy & {
  syncStatus?: 'pending' | 'synced' | 'failed';
  deletedAt?: string | null;
};
