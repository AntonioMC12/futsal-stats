import { inject, Injectable } from '@angular/core';
import { PlayerPhotoRef } from '../../../shared/models/player-profile';
import { PlayerPhotoRepository } from '../ports/player-photo.repository';
import { FutsalStatsDb } from './futsal-stats.db';
import { buildPlayerPhotoPath } from '../player-photo-path';
import { createId } from '../../utils/id';

@Injectable()
export class DexiePlayerPhotoRepository implements PlayerPhotoRepository {
  private readonly db = inject(FutsalStatsDb);

  async save(
    teamId: string,
    playerId: string,
    blob: Blob,
    mimeType: PlayerPhotoRef['mimeType'],
  ): Promise<PlayerPhotoRef> {
    const storageKey = buildPlayerPhotoPath(teamId, playerId, createId());
    const updatedAt = Date.now();
    await this.db.playerPhotos.put({
      storageKey,
      teamId,
      playerId,
      data: await blob.arrayBuffer(),
      mimeType,
      updatedAt,
      syncStatus: 'pending',
    });
    return { storageKey, mimeType, updatedAt };
  }

  async get(ref: PlayerPhotoRef): Promise<Blob | undefined> {
    const record = await this.db.playerPhotos.get(ref.storageKey);
    return record && record.updatedAt === ref.updatedAt
      ? new Blob([record.data], { type: record.mimeType })
      : undefined;
  }

  async getMany(refs: readonly PlayerPhotoRef[]): Promise<Map<string, Blob>> {
    const records = await this.db.playerPhotos.bulkGet(refs.map(({ storageKey }) => storageKey));
    return new Map(
      records
        .filter(
          (record, index): record is NonNullable<typeof record> =>
            record !== undefined && record.updatedAt === refs[index]?.updatedAt,
        )
        .map((record) => [record.storageKey, new Blob([record.data], { type: record.mimeType })]),
    );
  }

  delete(ref: PlayerPhotoRef): Promise<void> {
    return this.db.playerPhotos.delete(ref.storageKey);
  }
}
