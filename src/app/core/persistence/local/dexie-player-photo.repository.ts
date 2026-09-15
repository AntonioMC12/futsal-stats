import { inject, Injectable } from '@angular/core';
import { PlayerPhotoRef } from '../../../shared/models/player-profile';
import { PlayerPhotoRepository } from '../ports/player-photo.repository';
import { FutsalStatsDb } from './futsal-stats.db';

@Injectable()
export class DexiePlayerPhotoRepository implements PlayerPhotoRepository {
  private readonly db = inject(FutsalStatsDb);

  async save(
    teamId: string,
    playerId: string,
    blob: Blob,
    mimeType: PlayerPhotoRef['mimeType'],
  ): Promise<PlayerPhotoRef> {
    const updatedAt = Date.now();
    const storageKey = `teams/${teamId}/players/${playerId}/profile`;
    await this.db.playerPhotos.put({
      storageKey,
      teamId,
      playerId,
      data: await blob.arrayBuffer(),
      mimeType,
      updatedAt,
    });
    return { storageKey, mimeType, updatedAt };
  }

  async get(ref: PlayerPhotoRef): Promise<Blob | undefined> {
    const record = await this.db.playerPhotos.get(ref.storageKey);
    return record ? new Blob([record.data], { type: record.mimeType }) : undefined;
  }

  async getMany(refs: readonly PlayerPhotoRef[]): Promise<Map<string, Blob>> {
    const records = await this.db.playerPhotos.bulkGet(refs.map(({ storageKey }) => storageKey));
    return new Map(
      records
        .filter((record) => record !== undefined)
        .map((record) => [record.storageKey, new Blob([record.data], { type: record.mimeType })]),
    );
  }

  delete(ref: PlayerPhotoRef): Promise<void> {
    return this.db.playerPhotos.delete(ref.storageKey);
  }
}
