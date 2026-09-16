import { inject, Injectable } from '@angular/core';
import { PlayerPhotoRef } from '../../../shared/models/player-profile';
import { PlayerPhotoRepository } from '../ports/player-photo.repository';
import { SupabaseClientService } from '../../cloud/supabase-client.service';

const BUCKET = 'player-photos';

@Injectable()
export class SupabasePlayerPhotoRepository implements PlayerPhotoRepository {
  private readonly bucket = inject(SupabaseClientService).requireClient().storage.from(BUCKET);

  async save(
    teamId: string,
    playerId: string,
    blob: Blob,
    mimeType: PlayerPhotoRef['mimeType'],
  ): Promise<PlayerPhotoRef> {
    const ref = {
      storageKey: `teams/${teamId}/players/${playerId}/profile`,
      mimeType,
      updatedAt: Date.now(),
    };
    await this.upload(ref, blob);
    return ref;
  }

  async upload(ref: PlayerPhotoRef, blob: Blob): Promise<void> {
    const { error } = await this.bucket.upload(ref.storageKey, blob, {
      contentType: ref.mimeType,
      upsert: true,
      cacheControl: '0',
    });
    if (error) throw error;
  }

  async get(ref: PlayerPhotoRef): Promise<Blob | undefined> {
    const { data, error } = await this.bucket.download(ref.storageKey);
    if (error) throw error;
    return data;
  }

  async getMany(refs: readonly PlayerPhotoRef[]): Promise<Map<string, Blob>> {
    const blobs = await Promise.all(refs.map((ref) => this.get(ref)));
    return new Map(
      refs.flatMap((ref, index) => (blobs[index] ? [[ref.storageKey, blobs[index]!]] : [])),
    );
  }

  async delete(ref: PlayerPhotoRef): Promise<void> {
    const { error } = await this.bucket.remove([ref.storageKey]);
    if (error) throw error;
  }
}
