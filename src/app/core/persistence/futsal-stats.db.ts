import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Match } from '../../shared/models/match';
import { MatchEvent } from '../../shared/models/match-event';
import { Player } from '../../shared/models/player';
import { Team } from '../../shared/models/team';

@Injectable({ providedIn: 'root' })
export class FutsalStatsDb extends Dexie {
  teams!: Table<Team, string>;
  players!: Table<Player, string>;
  matches!: Table<Match, string>;
  events!: Table<MatchEvent, string>;

  constructor() {
    super('futsal-stats');
    this.version(1).stores({
      teams: 'id, name, updatedAt',
      players: 'id, teamId, number, active',
      matches: 'id, status, date, updatedAt',
      events: 'id, matchId, sequence, type, timestamp',
    });
  }
}
