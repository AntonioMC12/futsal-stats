import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import { Strategy } from '../../../features/strategies/domain/strategy';

@Injectable()
export class FutsalStatsDb extends Dexie {
  teams!: Table<Team, string>;
  players!: Table<Player, string>;
  matches!: Table<Match, string>;
  events!: Table<MatchEvent, string>;
  strategies!: Table<Strategy, string>;

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
  }
}
