import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { migrateToCloudDataModel } from './cloud-data-model.migration';
import {
  LocalMatchEventRecord,
  LocalMatchRecord,
  LocalPlayerRecord,
  LocalTeamRecord,
} from './local-records';

@Injectable()
export class FutsalStatsDb extends Dexie {
  teams!: Table<LocalTeamRecord, string>;
  players!: Table<LocalPlayerRecord, string>;
  matches!: Table<LocalMatchRecord, string>;
  events!: Table<LocalMatchEventRecord, string>;

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
    this.version(3)
      .stores({
        teams: 'id, name, updatedAt, &seedKey, syncStatus',
        players: 'id, teamId, number, active, updatedAt, syncStatus',
        matches: 'id, teamId, status, date, updatedAt, syncStatus, [teamId+updatedAt]',
        events: 'id, matchId, sequence, type, timestamp, updatedAt, syncStatus, [matchId+sequence]',
      })
      .upgrade(migrateToCloudDataModel);
  }
}
