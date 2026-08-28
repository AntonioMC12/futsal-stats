const LINEUP_SIZE = 5;

export function lineupId(playerIds: readonly string[]): string {
  return [...playerIds].sort().join('|');
}

export function isCompleteLineup(playerIds: readonly string[]): boolean {
  if (playerIds.length !== LINEUP_SIZE) {
    return false;
  }

  return new Set(playerIds).size === LINEUP_SIZE;
}
