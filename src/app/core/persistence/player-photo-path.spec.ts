import { buildPlayerPhotoPath, parsePlayerPhotoPath } from './player-photo-path';

const teamId = '3cc467c5-0a7a-4c53-9001-da3b0a0e0140';
const playerId = '82561dce-e51a-4e2e-87a0-b0486a31e232';
const photoId = 'ac3658d3-215f-4c64-8d0b-f70e16f87aa6';

describe('player photo path', () => {
  it('builds a scoped versioned path and reads existing legacy paths', () => {
    const key = buildPlayerPhotoPath(teamId, playerId, photoId);
    expect(key).toBe(`teams/${teamId}/players/${playerId}/profile-${photoId}`);
    expect(parsePlayerPhotoPath(key)).toEqual({ teamId, playerId });
    expect(parsePlayerPhotoPath(`teams/${teamId}/players/${playerId}/profile`)).toEqual({
      teamId,
      playerId,
    });
  });

  it('rejects empty identifiers and malformed paths before Storage', () => {
    expect(() => buildPlayerPhotoPath('', playerId, photoId)).toThrow();
    expect(() => buildPlayerPhotoPath(teamId, '', photoId)).toThrow();
    expect(parsePlayerPhotoPath(`teams//players/${playerId}/profile`)).toBeNull();
    expect(parsePlayerPhotoPath(`teams/${teamId}/players//profile`)).toBeNull();
    expect(parsePlayerPhotoPath(`teams/${teamId}/players/${playerId}/other`)).toBeNull();
  });
});
