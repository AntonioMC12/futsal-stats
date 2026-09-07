export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface LocalSyncMetadata {
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  revision: number;
  syncStatus: SyncStatus;
}

export const INITIAL_REVISION = 1;
export const LOCAL_ONLY_SYNC_STATUS: SyncStatus = 'pending';
