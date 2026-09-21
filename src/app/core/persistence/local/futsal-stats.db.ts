import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { migrateToCloudDataModel } from './cloud-data-model.migration';
import { SyncQueueRecord } from '../../sync/sync-operation';
import { FinalMatchSnapshot } from '../../sync/match-integrity.model';
import {
  LocalMatchEventRecord,
  LocalMatchRecord,
  LocalPlayerRecord,
  LocalPlayerProfileRecord,
  LocalPlayerPhotoRecord,
  LocalTeamRecord,
  LocalStrategyRecord,
} from './local-records';

@Injectable()
export class FutsalStatsDb extends Dexie {
  teams!: Table<LocalTeamRecord, string>;
  players!: Table<LocalPlayerRecord, string>;
  playerProfiles!: Table<LocalPlayerProfileRecord, string>;
  playerPhotos!: Table<LocalPlayerPhotoRecord, string>;
  matches!: Table<LocalMatchRecord, string>;
  events!: Table<LocalMatchEventRecord, string>;
  strategies!: Table<LocalStrategyRecord, string>;
  syncQueue!: Table<SyncQueueRecord, string>;
  matchIntegrity!: Table<FinalMatchSnapshot, string>;

  constructor() {
    super('futsal-stats');
    this.version(1).stores({
      teams: 'id, name, updatedAt',
      players: 'id, teamId, number, active',
      matches: 'id, status, date, updatedAt',
      events: 'id, matchId, sequence, type, timestamp',
    });
    this.version(2).stores({
      teams: 'id, name, updatedAt, &seedKey',
      players: 'id, teamId, number, active',
      matches: 'id, status, date, updatedAt',
      events: 'id, matchId, sequence, type, timestamp',
    });
    this.version(3).stores({
      teams: 'id, name, updatedAt, &seedKey',
      players: 'id, teamId, number, active',
      matches: 'id, status, date, updatedAt',
      events: 'id, matchId, sequence, type, timestamp',
      strategies: 'id, teamId, updatedAt',
    });
    this.version(4)
      .stores({
        teams: 'id, name, updatedAt, &seedKey, syncStatus',
        players: 'id, teamId, number, active, updatedAt, syncStatus',
        matches: 'id, teamId, status, date, updatedAt, syncStatus, [teamId+updatedAt]',
        events: 'id, matchId, sequence, type, timestamp, updatedAt, syncStatus, [matchId+sequence]',
        strategies: 'id, teamId, updatedAt',
      })
      .upgrade(migrateToCloudDataModel);
    this.version(5).stores({
      teams: 'id, name, updatedAt, &seedKey, syncStatus',
      players: 'id, teamId, number, active, updatedAt, syncStatus',
      matches:
        'id, teamId, status, date, season, competition, updatedAt, syncStatus, [teamId+updatedAt]',
      events: 'id, matchId, sequence, type, timestamp, updatedAt, syncStatus, [matchId+sequence]',
      strategies: 'id, teamId, updatedAt',
    });
    this.version(6).stores({
      teams: 'id, name, updatedAt, &seedKey, syncStatus',
      players: 'id, teamId, number, active, updatedAt, syncStatus',
      playerProfiles: 'playerId, teamId, updatedAt, syncStatus',
      matches:
        'id, teamId, status, date, season, competition, updatedAt, syncStatus, [teamId+updatedAt]',
      events: 'id, matchId, sequence, type, timestamp, updatedAt, syncStatus, [matchId+sequence]',
      strategies: 'id, teamId, updatedAt',
    });
    this.version(7).stores({
      teams: 'id, name, updatedAt, &seedKey, syncStatus',
      players: 'id, teamId, number, active, updatedAt, syncStatus',
      playerProfiles: 'playerId, teamId, updatedAt, syncStatus',
      matches:
        'id, teamId, status, date, season, competition, updatedAt, syncStatus, [teamId+updatedAt]',
      events: 'id, matchId, sequence, type, timestamp, updatedAt, syncStatus, [matchId+sequence]',
      strategies: 'id, teamId, updatedAt',
      syncQueue: 'id, &dedupeKey, status, nextAttemptAt, createdAt, [status+nextAttemptAt]',
    });
    this.version(8).stores({
      teams: 'id, name, updatedAt, &seedKey, syncStatus',
      players: 'id, teamId, number, active, updatedAt, syncStatus',
      playerProfiles: 'playerId, teamId, updatedAt, syncStatus',
      playerPhotos: 'storageKey, teamId, playerId, updatedAt',
      matches:
        'id, teamId, status, date, season, competition, updatedAt, syncStatus, [teamId+updatedAt]',
      events: 'id, matchId, sequence, type, timestamp, updatedAt, syncStatus, [matchId+sequence]',
      strategies: 'id, teamId, updatedAt',
      syncQueue: 'id, &dedupeKey, status, nextAttemptAt, createdAt, [status+nextAttemptAt]',
    });
    this.version(9).stores({
      teams: 'id, name, updatedAt, &seedKey, syncStatus',
      players: 'id, teamId, number, active, updatedAt, syncStatus',
      playerProfiles: 'playerId, teamId, updatedAt, syncStatus',
      playerPhotos: 'storageKey, teamId, playerId, updatedAt',
      matches:
        'id, teamId, status, date, season, competition, updatedAt, syncStatus, [teamId+updatedAt]',
      events: 'id, matchId, sequence, type, timestamp, updatedAt, syncStatus, [matchId+sequence]',
      strategies: 'id, teamId, updatedAt',
      syncQueue: 'id, &dedupeKey, status, nextAttemptAt, createdAt, [status+nextAttemptAt]',
      matchIntegrity: 'matchId, teamId, status, checkedAt',
    });
  }
}
