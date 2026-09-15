import { DomainResult, fail, ok } from '../../../core/utils/result';
import { PlayerProfile, PreferredFoot } from '../../../shared/models/player-profile';

export interface PlayerProfileInput {
  preferredFoot: PreferredFoot;
  notes: string;
}

export function updatePlayerProfile(
  current: PlayerProfile,
  input: PlayerProfileInput,
  now: number,
): DomainResult<PlayerProfile> {
  const notes = input.notes.trim();
  if (notes.length > 2_000) return fail('Las notas no pueden superar los 2.000 caracteres.');
  return ok({ ...current, preferredFoot: input.preferredFoot, notes, updatedAt: now });
}
