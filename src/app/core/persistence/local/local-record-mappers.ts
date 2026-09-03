import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import {
  LocalMatchEventRecord,
  LocalMatchRecord,
  LocalPlayerRecord,
  LocalTeamRecord,
} from './local-records';
import { INITIAL_REVISION, LOCAL_ONLY_SYNC_STATUS } from './sync-metadata';

export function toLocalTeamRecord(team: Team, previous?: LocalTeamRecord): LocalTeamRecord {
  return {
    ...team,
    deletedAt: previous?.deletedAt ?? null,
    revision: nextRevision(previous),
    syncStatus: LOCAL_ONLY_SYNC_STATUS,
  };
}

export function fromLocalTeamRecord(record: LocalTeamRecord): Team {
  const { deletedAt: _, revision: __, syncStatus: ___, ...team } = record;
  return team;
}

export function toLocalPlayerRecord(
  player: Player,
  now: number,
  previous?: LocalPlayerRecord,
): LocalPlayerRecord {
  return {
    ...player,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
    revision: nextRevision(previous),
    syncStatus: LOCAL_ONLY_SYNC_STATUS,
  };
}

export function fromLocalPlayerRecord(record: LocalPlayerRecord): Player {
  const {
    createdAt: _,
    updatedAt: __,
    deletedAt: ___,
    revision: ____,
    syncStatus: _____,
    ...player
  } = record;
  return player;
}

export function toLocalMatchRecord(match: Match, previous?: LocalMatchRecord): LocalMatchRecord {
  return {
    ...match,
    deletedAt: previous?.deletedAt ?? null,
    revision: nextRevision(previous),
    syncStatus: LOCAL_ONLY_SYNC_STATUS,
  };
}

export function fromLocalMatchRecord(record: LocalMatchRecord): Match {
  const { deletedAt: _, revision: __, syncStatus: ___, ...match } = record;
  return match;
}

export function toLocalMatchEventRecord(event: MatchEvent): LocalMatchEventRecord {
  return {
    ...event,
    createdAt: event.timestamp,
    updatedAt: event.timestamp,
    deletedAt: null,
    revision: INITIAL_REVISION,
    syncStatus: LOCAL_ONLY_SYNC_STATUS,
  };
}

export function fromLocalMatchEventRecord(record: LocalMatchEventRecord): MatchEvent {
  const {
    createdAt: _,
    updatedAt: __,
    deletedAt: ___,
    revision: ____,
    syncStatus: _____,
    ...event
  } = record;
  return event;
}

function nextRevision(previous?: LocalSyncMetadataLike): number {
  return previous ? previous.revision + 1 : INITIAL_REVISION;
}

interface LocalSyncMetadataLike {
  revision: number;
}
