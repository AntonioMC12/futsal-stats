import { PlayerPhotoRef } from '../../../shared/models/player-profile';

export interface PlayerPhotoRepository {
  save(
    teamId: string,
    playerId: string,
    blob: Blob,
    mimeType: PlayerPhotoRef['mimeType'],
  ): Promise<PlayerPhotoRef>;
  get(ref: PlayerPhotoRef): Promise<Blob | undefined>;
  getMany(refs: readonly PlayerPhotoRef[]): Promise<Map<string, Blob>>;
  delete(ref: PlayerPhotoRef): Promise<void>;
}
