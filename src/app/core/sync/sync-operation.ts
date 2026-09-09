import { Match } from '../../shared/models/match';
import { MatchEvent } from '../../shared/models/match-event';
import { Player } from '../../shared/models/player';
import { PlayerProfile } from '../../shared/models/player-profile';
import { Team } from '../../shared/models/team';

export type SyncOperation =
  | { kind: 'team-upsert'; teamId: string; entityId: string; team: Team }
  | { kind: 'player-upsert'; teamId: string; entityId: string; player: Player }
  | { kind: 'player-profile-upsert'; teamId: string; entityId: string; profile: PlayerProfile }
  | { kind: 'match-upsert'; teamId: string; entityId: string; match: Match; createOnly: boolean }
  | {
      kind: 'match-events-commit';
      teamId: string;
      entityId: string;
      match: Match;
      events: readonly MatchEvent[];
    }
  | { kind: 'match-delete'; teamId: string; entityId: string };

export type SyncQueueStatus = 'pending' | 'failed';

export interface SyncQueueRecord {
  id: string;
  dedupeKey: string;
  operation: SyncOperation;
  status: SyncQueueStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SyncFailure {
  id: string;
  label: string;
  message: string;
  attempts: number;
}

export function syncDedupeKey(operation: SyncOperation): string {
  switch (operation.kind) {
    case 'team-upsert':
      return `team:${operation.entityId}`;
    case 'player-upsert':
      return `player:${operation.entityId}`;
    case 'player-profile-upsert':
      return `player-profile:${operation.entityId}`;
    case 'match-upsert':
    case 'match-delete':
      return `match:${operation.entityId}`;
    case 'match-events-commit':
      return `match-events:${operation.entityId}`;
  }
}

export function mergeSyncOperation(
  previous: SyncOperation | undefined,
  incoming: SyncOperation,
): SyncOperation {
  if (previous?.kind !== 'match-events-commit' || incoming.kind !== 'match-events-commit') {
    return incoming;
  }
  const events = new Map(previous.events.map((event) => [event.id, event]));
  for (const event of incoming.events) events.set(event.id, event);
  return { ...incoming, events: [...events.values()].sort((a, b) => a.sequence - b.sequence) };
}

export function operationLabel(operation: SyncOperation): string {
  switch (operation.kind) {
    case 'team-upsert':
      return 'Equipo';
    case 'player-upsert':
      return 'Jugador';
    case 'player-profile-upsert':
      return 'Perfil de jugador';
    case 'match-upsert':
      return 'Partido';
    case 'match-events-commit':
      return `${operation.events.length} acción${operation.events.length === 1 ? '' : 'es'} de partido`;
    case 'match-delete':
      return 'Eliminación de partido';
  }
}
