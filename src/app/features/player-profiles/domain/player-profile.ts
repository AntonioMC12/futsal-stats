import { DomainResult, fail, ok } from '../../../core/utils/result';
import { PlayerProfile, PreferredFoot } from '../../../shared/models/player-profile';

export interface PlayerProfileInput {
  photoUrl: string;
  preferredFoot: PreferredFoot;
  notes: string;
}

export function updatePlayerProfile(
  current: PlayerProfile,
  input: PlayerProfileInput,
  now: number,
): DomainResult<PlayerProfile> {
  const photoUrl = input.photoUrl.trim();
  if (photoUrl && !isHttpUrl(photoUrl)) {
    return fail('La foto debe ser una URL http o https válida.');
  }
  const notes = input.notes.trim();
  if (notes.length > 2_000) {
    return fail('Las notas no pueden superar los 2.000 caracteres.');
  }
  return ok({
    ...current,
    ...(photoUrl ? { photoUrl } : { photoUrl: undefined }),
    preferredFoot: input.preferredFoot,
    notes,
    updatedAt: now,
  });
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
