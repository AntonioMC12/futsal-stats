import { describe, expect, it } from 'vitest';
import { formatInviteCode, normalizeInviteCode } from './device-enrollment.service';

describe('device invitation codes', () => {
  it('formats the server token into readable groups without losing entropy', () => {
    const token = '0123456789abcdef0123456789abcdef0123';
    const formatted = formatInviteCode(token);
    expect(formatted).toBe('012345-6789AB-CDEF01-234567-89ABCD-EF0123');
    expect(normalizeInviteCode(formatted)).toBe(token);
  });

  it('normalizes pasted spaces, dashes and casing', () => {
    expect(normalizeInviteCode(' AB12-cd34 ef56 ')).toBe('ab12cd34ef56');
  });
});
