import { inject, Injectable } from '@angular/core';
import { PlayerPhotoRef } from '../../shared/models/player-profile';
import { SupabasePlayerPhotoRepository } from '../persistence/cloud/supabase-player-photo.repository';
import { DexiePlayerPhotoRepository } from '../persistence/local/dexie-player-photo.repository';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import { PlayerPhotoRepository } from '../persistence/ports/player-photo.repository';
import { TeamAccessService } from '../team-workspace/team-access.service';
import { OfflineSyncService } from './offline-sync.service';
import { enqueueSyncOperation } from './sync-queue';
import { parsePlayerPhotoPath } from '../persistence/player-photo-path';

@Injectable()
export class OfflinePlayerPhotoRepository implements PlayerPhotoRepository {
  private readonly local = inject(DexiePlayerPhotoRepository);
  private readonly remote = inject(SupabasePlayerPhotoRepository);
  private readonly db = inject(FutsalStatsDb);
  private readonly access = inject(TeamAccessService);
  private readonly sync = inject(OfflineSyncService);

  async save(
    teamId: string,
    playerId: string,
    blob: Blob,
    mimeType: PlayerPhotoRef['mimeType'],
  ): Promise<PlayerPhotoRef> {
    await this.access.assertCanWrite(teamId);
    const ref = await this.local.save(teamId, playerId, blob, mimeType);
    await enqueueSyncOperation(this.db.syncQueue, {
      kind: 'photo-upload',
      teamId,
      entityId: playerId,
      ref,
    });
    this.sync.requestSync();
    return ref;
  }

  async get(ref: PlayerPhotoRef): Promise<Blob | undefined> {
    const local = await this.local.get(ref);
    if (local) return local;
    try {
      const blob = await this.remote.get(ref);
      if (blob) await this.cache(ref, blob);
      return blob;
    } catch {
      return undefined;
    }
  }

  async getMany(refs: readonly PlayerPhotoRef[]): Promise<Map<string, Blob>> {
    const result = new Map<string, Blob>();
    await Promise.all(
      refs.map(async (ref) => {
        const blob = await this.get(ref);
        if (blob) result.set(ref.storageKey, blob);
      }),
    );
    return result;
  }

  async delete(ref: PlayerPhotoRef): Promise<void> {
    const parsed = parsePlayerPhotoPath(ref.storageKey);
    if (!parsed) throw new Error('Referencia de foto inválida.');
    const { teamId, playerId } = parsed;
    await this.access.assertCanWrite(teamId);
    await enqueueSyncOperation(this.db.syncQueue, {
      kind: 'photo-delete',
      teamId,
      entityId: playerId,
      ref,
    });
    await this.local.delete(ref);
    this.sync.requestSync();
  }

  private async cache(ref: PlayerPhotoRef, blob: Blob): Promise<void> {
    const parsed = parsePlayerPhotoPath(ref.storageKey);
    if (!parsed) return;
    const existing = await this.db.playerPhotos.get(ref.storageKey);
    if (
      existing &&
      (existing.syncStatus === 'pending' ||
        existing.syncStatus === 'failed' ||
        existing.updatedAt > ref.updatedAt)
    )
      return;
    await this.db.playerPhotos.put({
      storageKey: ref.storageKey,
      teamId: parsed.teamId,
      playerId: parsed.playerId,
      mimeType: ref.mimeType,
      data: await blob.arrayBuffer(),
      updatedAt: ref.updatedAt,
      syncStatus: 'synced',
    });
  }
}
