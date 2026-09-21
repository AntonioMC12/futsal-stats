import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { FutsalStatsDb } from './futsal-stats.db';

export async function assertMatchReferences(db: FutsalStatsDb, match: Match): Promise<void> {
  const team = await db.teams.get(match.teamId);
  if (!team) throw new Error(`Match ${match.id} references missing Team ${match.teamId}`);
  if (match.homeTeam.id !== match.teamId) {
    throw new Error(`Match ${match.id} ownership does not match its home Team`);
  }

  const squadIds = [...new Set(match.squadPlayerIds)];
  const players = await db.players.bulkGet(squadIds);
  if (
    players.some((player) => !player || player.teamId !== match.teamId) ||
    match.startingLineupPlayerIds.some((id) => !squadIds.includes(id))
  ) {
    throw new Error(`Match ${match.id} contains missing or foreign Player references`);
  }
}

export async function assertEventReferences(
  db: FutsalStatsDb,
  match: Match,
  events: readonly MatchEvent[],
): Promise<void> {
  const squadIds = new Set(match.squadPlayerIds);
  const batchEventIds = new Set(events.map(({ id }) => id));
  const storedEventIds = new Set(
    (await db.events.where('matchId').equals(match.id).primaryKeys()).map(String),
  );
  const eventExists = (id: string) => batchEventIds.has(id) || storedEventIds.has(id);
  const assertPlayer = (id: string | undefined) => {
    if (id !== undefined && !squadIds.has(id)) {
      throw new Error(`MatchEvent references Player ${id} outside Match ${match.id}`);
    }
  };

  for (const event of events) {
    if (event.matchId !== match.id) {
      throw new Error(`MatchEvent ${event.id} references a different Match`);
    }
    if (event.relatedEventId && !eventExists(event.relatedEventId)) {
      throw new Error(`MatchEvent ${event.id} references missing related event`);
    }
    switch (event.type) {
      case 'PLAYER_ENTERED':
      case 'PLAYER_LEFT':
        assertPlayer(event.playerId);
        break;
      case 'SUBSTITUTION':
        assertPlayer(event.outPlayerId);
        assertPlayer(event.inPlayerId);
        break;
      case 'FOUL':
        assertPlayer(event.foulPlayerId);
        assertPlayer(event.playerId);
        assertPlayer(event.receivedByPlayerId);
        break;
      case 'SHOT':
      case 'SAVE':
        assertPlayer(event.playerId);
        break;
      case 'DISCIPLINE':
      case 'BENCH_DISCIPLINE':
      case 'RED_CARD_REPLACEMENT':
        assertPlayer(event.playerId);
        if (event.type === 'RED_CARD_REPLACEMENT' && !eventExists(event.reductionEventId)) {
          throw new Error(`MatchEvent ${event.id} references missing reduction event`);
        }
        break;
      case 'GOAL_FOR':
        assertPlayer(event.scorerPlayerId);
        event.lineupPlayerIds.forEach(assertPlayer);
        break;
      case 'GOAL_AGAINST':
        event.lineupPlayerIds.forEach(assertPlayer);
        break;
      case 'EVENT_UNDONE':
        if (!eventExists(event.targetEventId)) {
          throw new Error(`MatchEvent ${event.id} references missing undo target`);
        }
        break;
    }
  }
}
