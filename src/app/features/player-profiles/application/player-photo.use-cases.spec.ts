import { TestBed } from '@angular/core/testing';
import {
  PLAYER_PHOTO_REPOSITORY,
  PLAYER_PROFILE_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { PlayerPhotoRef, emptyPlayerProfile } from '../../../shared/models/player-profile';
import { UploadPlayerPhotoUseCase } from './player-photo.use-cases';

const previous: PlayerPhotoRef = {
  storageKey:
    'teams/3cc467c5-0a7a-4c53-9001-da3b0a0e0140/players/82561dce-e51a-4e2e-87a0-b0486a31e232/profile',
  mimeType: 'image/png',
  updatedAt: 1,
};
const next: PlayerPhotoRef = {
  storageKey:
    'teams/3cc467c5-0a7a-4c53-9001-da3b0a0e0140/players/82561dce-e51a-4e2e-87a0-b0486a31e232/profile-ac3658d3-215f-4c64-8d0b-f70e16f87aa6',
  mimeType: 'image/png',
  updatedAt: 2,
};
const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });

describe('UploadPlayerPhotoUseCase', () => {
  const profile = {
    ...emptyPlayerProfile(
      '82561dce-e51a-4e2e-87a0-b0486a31e232',
      '3cc467c5-0a7a-4c53-9001-da3b0a0e0140',
    ),
    photoRef: previous,
  };
  const save = vi.fn();
  const remove = vi.fn();
  const put = vi.fn();

  beforeEach(() => {
    save.mockReset().mockResolvedValue(next);
    remove.mockReset().mockResolvedValue(undefined);
    put.mockReset().mockResolvedValue(profile.playerId);
    TestBed.configureTestingModule({
      providers: [
        UploadPlayerPhotoUseCase,
        { provide: PLAYER_PHOTO_REPOSITORY, useValue: { save, delete: remove } },
        { provide: PLAYER_PROFILE_REPOSITORY, useValue: { put } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('persists the new reference before removing the previous object', async () => {
    const result = await TestBed.inject(UploadPlayerPhotoUseCase).execute(profile, png);
    expect(result.photoRef).toEqual(next);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ photoRef: next }));
    expect(remove).toHaveBeenCalledWith(previous);
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });

  it('keeps the previous reference if upload fails', async () => {
    save.mockRejectedValue(new Error('Storage unavailable'));
    await expect(TestBed.inject(UploadPlayerPhotoUseCase).execute(profile, png)).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes only the newly created object if profile persistence fails', async () => {
    put.mockRejectedValue(new Error('Database unavailable'));
    await expect(TestBed.inject(UploadPlayerPhotoUseCase).execute(profile, png)).rejects.toThrow();
    expect(remove).toHaveBeenCalledWith(next);
    expect(remove).not.toHaveBeenCalledWith(previous);
  });
});
