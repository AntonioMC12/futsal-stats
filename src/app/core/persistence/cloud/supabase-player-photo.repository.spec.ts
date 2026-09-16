import { TestBed } from '@angular/core/testing';
import { SupabaseClientService } from '../../cloud/supabase-client.service';
import { SupabasePlayerPhotoRepository } from './supabase-player-photo.repository';

describe('SupabasePlayerPhotoRepository', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('uses the private bucket and the Team/player path for upload and download', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const download = vi.fn().mockResolvedValue({ data: new Blob(['photo']), error: null });
    const from = vi.fn().mockReturnValue({ upload, download });
    TestBed.configureTestingModule({ providers: [
      SupabasePlayerPhotoRepository,
      { provide: SupabaseClientService, useValue: { requireClient: () => ({ storage: { from } }) } },
    ] });
    const repository = TestBed.inject(SupabasePlayerPhotoRepository);
    const blob = new Blob(['photo'], { type: 'image/png' });
    const ref = await repository.save('team-1', 'player-1', blob, 'image/png');
    expect(from).toHaveBeenCalledWith('player-photos');
    expect(upload).toHaveBeenCalledWith(ref.storageKey, blob, expect.objectContaining({ upsert: true }));
    expect((await repository.get(ref))?.size).toBe(blob.size);
    expect(download).toHaveBeenCalledWith(ref.storageKey);
  });
});
