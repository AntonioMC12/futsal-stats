import { inject, Injectable } from '@angular/core';
import {
  PLAYER_PHOTO_REPOSITORY,
  PLAYER_PROFILE_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { PlayerProfile } from '../../../shared/models/player-profile';
import { validatePlayerPhoto } from '../domain/player-photo';

@Injectable({ providedIn: 'root' })
export class UploadPlayerPhotoUseCase {
  private readonly photos = inject(PLAYER_PHOTO_REPOSITORY);
  private readonly profiles = inject(PLAYER_PROFILE_REPOSITORY);

  async execute(profile: PlayerProfile, blob: Blob): Promise<PlayerProfile> {
    const validation = await validatePlayerPhoto(blob);
    if (!validation.ok) throw new Error(validation.error);
    const photoRef = await this.photos.save(
      profile.teamId,
      profile.playerId,
      blob,
      validation.value,
    );
    const updated = { ...profile, photoRef, photoUrl: undefined, updatedAt: Date.now() };
    try {
      await this.profiles.put(updated);
    } catch (error) {
      try {
        await this.photos.delete(photoRef);
      } catch (cleanupError) {
        console.warn('player_photo_cleanup_failed', cleanupError);
      }
      throw error;
    }
    if (profile.photoRef && profile.photoRef.storageKey !== photoRef.storageKey) {
      try {
        await this.photos.delete(profile.photoRef);
      } catch (cleanupError) {
        console.warn('previous_player_photo_cleanup_failed', cleanupError);
      }
    }
    return updated;
  }
}

@Injectable({ providedIn: 'root' })
export class DeletePlayerPhotoUseCase {
  private readonly photos = inject(PLAYER_PHOTO_REPOSITORY);
  private readonly profiles = inject(PLAYER_PROFILE_REPOSITORY);

  async execute(profile: PlayerProfile): Promise<PlayerProfile> {
    const updated = { ...profile, photoRef: undefined, photoUrl: undefined, updatedAt: Date.now() };
    await this.profiles.put(updated);
    if (profile.photoRef) await this.photos.delete(profile.photoRef);
    return updated;
  }
}
