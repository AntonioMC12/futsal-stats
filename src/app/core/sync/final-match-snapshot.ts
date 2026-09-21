import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import { Match } from '../../shared/models/match';
import { integritySignature } from './match-integrity.model';

/** Call inside the transaction that writes the final match and its events. */
export async function saveFinalMatchSnapshot(db: FutsalStatsDb, match: Match): Promise<void> {
  if (match.status !== 'finished') return;
  const events = await db.events.where('matchId').equals(match.id).toArray();
  const eventIds = events.map((event) => event.id).sort();
  const lineupEventIds = events
    .filter(
      (event) =>
        'lineupPlayerIds' in event &&
        Array.isArray(event.lineupPlayerIds) &&
        event.lineupPlayerIds.length > 0,
    )
    .map((event) => event.id)
    .sort();
  const matchPlayerIds = [...match.squadPlayerIds].sort();
  const previous = await db.matchIntegrity.get(match.id);
  const checksum = integritySignature(match.id, eventIds, lineupEventIds, matchPlayerIds);
  await db.matchIntegrity.put({
    matchId: match.id,
    teamId: match.teamId,
    finishedAt: previous?.finishedAt ?? match.updatedAt,
    expectedEventIds: eventIds,
    expectedLineupEventIds: lineupEventIds,
    expectedMatchPlayerIds: matchPlayerIds,
    checksum,
    status: 'pending',
    checkedAt: null,
    lastError: null,
  });
}
