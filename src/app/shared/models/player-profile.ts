export const PREFERRED_FEET = ['unknown', 'right', 'left', 'both'] as const;

export type PreferredFoot = (typeof PREFERRED_FEET)[number];

export interface PlayerProfile {
  playerId: string;
  teamId: string;
  photoUrl?: string;
  preferredFoot: PreferredFoot;
  notes: string;
  metadata: Readonly<Record<string, string>>;
  createdAt: number;
  updatedAt: number;
}

export function emptyPlayerProfile(
  playerId: string,
  teamId: string,
  now = Date.now(),
): PlayerProfile {
  return {
    playerId,
    teamId,
    preferredFoot: 'unknown',
    notes: '',
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}
