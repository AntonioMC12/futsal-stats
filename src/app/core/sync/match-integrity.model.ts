export type MatchIntegrityStatus =
  'unknown' | 'checking' | 'verified' | 'pending' | 'mismatch' | 'repairing' | 'unreachable';

export interface FinalMatchSnapshot {
  matchId: string;
  teamId: string;
  finishedAt: number;
  expectedEventIds: string[];
  expectedLineupEventIds: string[];
  expectedMatchPlayerIds: string[];
  checksum: string;
  status: MatchIntegrityStatus;
  checkedAt: number | null;
  lastError: string | null;
}

export interface MatchIntegrityReport {
  matchId: string;
  teamId: string;
  checkedAt: number;
  local: {
    matchExists: boolean;
    eventIds: string[];
    lineupEventIds: string[];
    matchPlayerIds: string[];
    status: string;
  };
  cloud: {
    reachable: boolean;
    matchExists: boolean;
    eventIds: string[];
    lineupEventIds: string[];
    matchPlayerIds: string[];
    status: string | null;
  };
  sync: { pendingCount: number; failedCount: number; lastError: string | null };
  status: Extract<
    MatchIntegrityStatus,
    'unknown' | 'verified' | 'pending' | 'mismatch' | 'unreachable'
  >;
  missingEventIds: string[];
  missingLineupEventIds: string[];
  unexpectedCloudEventIds: string[];
  unexpectedCloudLineupEventIds: string[];
  unexpectedCloudMatchPlayerIds: string[];
  checksumLocal: string;
  checksumCloud: string | null;
  repairAvailable: boolean;
}

export function integritySignature(
  matchId: string,
  eventIds: readonly string[],
  lineupEventIds: readonly string[],
  playerIds: readonly string[],
): string {
  return JSON.stringify([
    matchId,
    [...eventIds].sort(),
    [...lineupEventIds].sort(),
    [...playerIds].sort(),
  ]);
}
