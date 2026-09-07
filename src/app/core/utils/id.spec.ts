import { createId, isUuid } from './id';
import { APAGA_PLAYER_IDS, APAGA_TEAM_ID } from '../initialization/built-in-teams';

describe('entity IDs', () => {
  it('creates distinct globally stable UUIDs', () => {
    const first = createId();
    const second = createId();

    expect(isUuid(first)).toBe(true);
    expect(isUuid(second)).toBe(true);
    expect(second).not.toBe(first);
  });

  it('rejects positional and timestamp-like legacy IDs', () => {
    expect(isUuid('0')).toBe(false);
    expect(isUuid('player-3')).toBe(false);
    expect(isUuid(String(Date.now()))).toBe(false);
  });

  it('uses valid stable UUIDs for every built-in entity', () => {
    expect([APAGA_TEAM_ID, ...APAGA_PLAYER_IDS].every(isUuid)).toBe(true);
    expect(new Set([APAGA_TEAM_ID, ...APAGA_PLAYER_IDS]).size).toBe(17);
  });
});
