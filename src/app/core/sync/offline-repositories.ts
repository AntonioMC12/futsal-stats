import { inject, Injectable } from '@angular/core';
import { ACTIVE_MATCH_STATUSES, Match } from '../../shared/models/match';
import { MatchEvent } from '../../shared/models/match-event';
import { Player } from '../../shared/models/player';
import { PlayerProfile } from '../../shared/models/player-profile';
import { Team } from '../../shared/models/team';
import { DexieMatchRepository } from '../persistence/local/dexie-match.repository';
import { DexieMatchEventRepository } from '../persistence/local/dexie-match-event.repository';
import { DexiePlayerRepository } from '../persistence/local/dexie-player.repository';
import { DexiePlayerProfileRepository } from '../persistence/local/dexie-player-profile.repository';
import { DexieTeamRepository } from '../persistence/local/dexie-team.repository';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import {
  toLocalMatchEventRecord,
  toLocalMatchRecord,
  toLocalPlayerProfileRecord,
  toLocalPlayerRecord,
  toLocalTeamRecord,
} from '../persistence/local/local-record-mappers';
import {
  assertEventReferences,
  assertMatchReferences,
} from '../persistence/local/local-reference-validation';
import { MatchEventRepository } from '../persistence/ports/match-event.repository';
import { MatchRepository } from '../persistence/ports/match.repository';
import { PlayerProfileRepository } from '../persistence/ports/player-profile.repository';
import { PlayerRepository } from '../persistence/ports/player.repository';
import { TeamRepository } from '../persistence/ports/team.repository';
import { enqueueSyncOperation } from './sync-queue';
import { OfflineSyncService } from './offline-sync.service';

@Injectable()
export class OfflineTeamRepository implements TeamRepository {
  private readonly local = inject(DexieTeamRepository);
  private readonly db = inject(FutsalStatsDb);
  private readonly sync = inject(OfflineSyncService);

  list(): Promise<Team[]> {
    return this.local.list();
  }

  get(id: string): Promise<Team | undefined> {
    return this.local.get(id);
  }

  async put(team: Team): Promise<string> {
    await this.db.transaction('rw', this.db.teams, this.db.syncQueue, async () => {
      const previous = await this.db.teams.get(team.id);
      await this.db.teams.put(toLocalTeamRecord(team, previous));
      await enqueueSyncOperation(this.db.syncQueue, {
        kind: 'team-upsert',
        teamId: team.id,
        entityId: team.id,
        team,
      });
    });
    this.sync.requestSync();
    return team.id;
  }
}

@Injectable()
export class OfflinePlayerRepository implements PlayerRepository {
  private readonly local = inject(DexiePlayerRepository);
  private readonly db = inject(FutsalStatsDb);
  private readonly sync = inject(OfflineSyncService);

  listActiveByTeam(teamId: string): Promise<Player[]> {
    return this.local.listActiveByTeam(teamId);
  }

  listByTeam(teamId: string): Promise<Player[]> {
    return this.local.listByTeam(teamId);
  }

  countActiveByTeamIds(teamIds: readonly string[]): Promise<Map<string, number>> {
    return this.local.countActiveByTeamIds(teamIds);
  }

  listByIds(playerIds: readonly string[]): Promise<Player[]> {
    return this.local.listByIds(playerIds);
  }

  async put(player: Player): Promise<string> {
    await this.db.transaction('rw', this.db.teams, this.db.players, this.db.syncQueue, async () => {
      if (!(await this.db.teams.get(player.teamId))) {
        throw new Error(`Player ${player.id} references missing Team ${player.teamId}`);
      }
      const previous = await this.db.players.get(player.id);
      await this.db.players.put(toLocalPlayerRecord(player, Date.now(), previous));
      await enqueueSyncOperation(this.db.syncQueue, {
        kind: 'player-upsert',
        teamId: player.teamId,
        entityId: player.id,
        player,
      });
    });
    this.sync.requestSync();
    return player.id;
  }
}

@Injectable()
export class OfflinePlayerProfileRepository implements PlayerProfileRepository {
  private readonly local = inject(DexiePlayerProfileRepository);
  private readonly db = inject(FutsalStatsDb);
  private readonly sync = inject(OfflineSyncService);

  get(playerId: string): Promise<PlayerProfile | undefined> {
    return this.local.get(playerId);
  }

  listByTeam(teamId: string): Promise<PlayerProfile[]> {
    return this.local.listByTeam(teamId);
  }

  async put(profile: PlayerProfile): Promise<string> {
    await this.db.transaction(
      'rw',
      this.db.players,
      this.db.playerProfiles,
      this.db.syncQueue,
      async () => {
        const player = await this.db.players.get(profile.playerId);
        if (!player || player.teamId !== profile.teamId) {
          throw new Error(`PlayerProfile references missing or foreign Player ${profile.playerId}`);
        }
        const previous = await this.db.playerProfiles.get(profile.playerId);
        await this.db.playerProfiles.put(toLocalPlayerProfileRecord(profile, previous));
        await enqueueSyncOperation(this.db.syncQueue, {
          kind: 'player-profile-upsert',
          teamId: profile.teamId,
          entityId: profile.playerId,
          profile,
        });
      },
    );
    this.sync.requestSync();
    return profile.playerId;
  }
}

@Injectable()
export class OfflineMatchRepository implements MatchRepository {
  private readonly local = inject(DexieMatchRepository);
  private readonly db = inject(FutsalStatsDb);
  private readonly sync = inject(OfflineSyncService);

  findActive(): Promise<Match | null> {
    return this.local.findActive();
  }

  list(): Promise<Match[]> {
    return this.local.list();
  }

  listByTeam(teamId: string): Promise<Match[]> {
    return this.local.listByTeam(teamId);
  }

  get(id: string): Promise<Match | undefined> {
    return this.local.get(id);
  }

  async put(match: Match): Promise<string> {
    await this.write(match, false);
    this.sync.requestSync();
    return match.id;
  }

  async addIfNoActive(match: Match): Promise<boolean> {
    const added = await this.db.transaction(
      'rw',
      this.db.teams,
      this.db.players,
      this.db.matches,
      this.db.syncQueue,
      async () => {
        await assertMatchReferences(this.db, match);
        const active = await this.db.matches
          .where('status')
          .anyOf([...ACTIVE_MATCH_STATUSES])
          .first();
        if (active) return false;
        await this.db.matches.add(toLocalMatchRecord(match));
        await enqueueSyncOperation(this.db.syncQueue, {
          kind: 'match-upsert',
          teamId: match.teamId,
          entityId: match.id,
          match,
          createOnly: true,
        });
        return true;
      },
    );
    if (added) this.sync.requestSync();
    return added;
  }

  async delete(matchId: string): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.matches,
      this.db.events,
      this.db.syncQueue,
      async () => {
        const match = await this.db.matches.get(matchId);
        if (!match) return;
        await this.db.syncQueue.where('dedupeKey').equals(`match-events:${matchId}`).delete();
        await enqueueSyncOperation(this.db.syncQueue, {
          kind: 'match-delete',
          teamId: match.teamId,
          entityId: matchId,
        });
        await this.db.events.where('matchId').equals(matchId).delete();
        await this.db.matches.delete(matchId);
      },
    );
    this.sync.requestSync();
  }

  private async write(match: Match, createOnly: boolean): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.teams,
      this.db.players,
      this.db.matches,
      this.db.syncQueue,
      async () => {
        await assertMatchReferences(this.db, match);
        const previous = await this.db.matches.get(match.id);
        await this.db.matches.put(toLocalMatchRecord(match, previous));
        await enqueueSyncOperation(this.db.syncQueue, {
          kind: 'match-upsert',
          teamId: match.teamId,
          entityId: match.id,
          match,
          createOnly,
        });
      },
    );
  }
}

@Injectable()
export class OfflineMatchEventRepository implements MatchEventRepository {
  private readonly local = inject(DexieMatchEventRepository);
  private readonly db = inject(FutsalStatsDb);
  private readonly sync = inject(OfflineSyncService);

  listByMatch(matchId: string): Promise<MatchEvent[]> {
    return this.local.listByMatch(matchId);
  }

  async commit(match: Match, events: readonly MatchEvent[]): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.teams,
      this.db.players,
      this.db.matches,
      this.db.events,
      this.db.syncQueue,
      async () => {
        await assertMatchReferences(this.db, match);
        await assertEventReferences(this.db, match, events);
        if (events.length > 0) await this.db.events.bulkAdd(events.map(toLocalMatchEventRecord));
        const previous = await this.db.matches.get(match.id);
        await this.db.matches.put(toLocalMatchRecord(match, previous));
        await enqueueSyncOperation(this.db.syncQueue, {
          kind: 'match-events-commit',
          teamId: match.teamId,
          entityId: match.id,
          match,
          events,
        });
      },
    );
    this.sync.requestSync();
  }
}
