import { validatePlayerPhoto } from './player-photo';

describe('player photo', () => {
  it('accepts a real PNG signature', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
      type: 'image/png',
    });
    expect(await validatePlayerPhoto(blob)).toEqual({ ok: true, value: 'image/png' });
  });
  it('rejects unsupported, empty and spoofed files', async () => {
    expect((await validatePlayerPhoto(new Blob([], { type: 'image/png' }))).ok).toBe(false);
    expect((await validatePlayerPhoto(new Blob(['hello'], { type: 'text/plain' }))).ok).toBe(false);
    expect((await validatePlayerPhoto(new Blob(['not png'], { type: 'image/png' }))).ok).toBe(
      false,
    );
  });
});
