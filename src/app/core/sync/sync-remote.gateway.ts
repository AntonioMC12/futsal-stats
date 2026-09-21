import { inject, Injectable } from '@angular/core';
import { Match } from '../../shared/models/match';
import { MatchEvent } from '../../shared/models/match-event';
import { Player } from '../../shared/models/player';
import { PlayerProfile } from '../../shared/models/player-profile';
import { Team } from '../../shared/models/team';
import { SupabaseMatchEventRepository } from '../persistence/cloud/supabase-match-event.repository';
import { SupabaseMatchRepository } from '../persistence/cloud/supabase-match.repository';
import { SupabasePlayerProfileRepository } from '../persistence/cloud/supabase-player-profile.repository';
import { SupabasePlayerRepository } from '../persistence/cloud/supabase-player.repository';
import { SupabaseTeamRepository } from '../persistence/cloud/supabase-team.repository';
import {
  SupabaseStrategyRepository,
  CloudStrategyRecord,
} from '../persistence/cloud/supabase-strategy.repository';
import { SupabasePlayerPhotoRepository } from '../persistence/cloud/supabase-player-photo.repository';
import { FutsalStatsDb } from '../persistence/local/futsal-stats.db';
import { SyncOperation } from './sync-operation';
import { SupabaseClientService } from '../cloud/supabase-client.service';

export interface RemoteSyncSnapshot {
  teams: readonly Team[];
  players: readonly Player[];
  profiles: readonly PlayerProfile[];
  matches: readonly Match[];
  events: readonly MatchEvent[];
  strategies: readonly CloudStrategyRecord[];
}

export class PermanentSyncError extends Error {}

@Injectable()
export class SyncRemoteGateway {
  private readonly teams = inject(SupabaseTeamRepository);
  private readonly players = inject(SupabasePlayerRepository);
  private readonly profiles = inject(SupabasePlayerProfileRepository);
  private readonly matches = inject(SupabaseMatchRepository);
  private readonly events = inject(SupabaseMatchEventRepository);
  private readonly strategies = inject(SupabaseStrategyRepository);
  private readonly photos = inject(SupabasePlayerPhotoRepository);
  private readonly db = inject(FutsalStatsDb);
  private readonly client = inject(SupabaseClientService).requireClient();

  async push(operation: SyncOperation): Promise<void> {
    switch (operation.kind) {
      case 'team-upsert':
        await this.teams.put(operation.team);
        return;
      case 'player-upsert':
        await this.players.put(operation.player);
        return;
      case 'player-profile-upsert':
        if (operation.profile.photoRef) {
          const record = await this.db.playerPhotos.get(operation.profile.photoRef.storageKey);
          if (
            record?.syncStatus === 'pending' &&
            record.updatedAt === operation.profile.photoRef.updatedAt
          ) {
            await this.photos.upload(
              operation.profile.photoRef,
              new Blob([record.data], { type: record.mimeType }),
            );
          }
        }
        await this.profiles.put(operation.profile);
        return;
      case 'match-upsert': {
        if (operation.createOnly) {
          const accepted = await this.matches.addIfNoActive(operation.match);
          if (!accepted) {
            throw new PermanentSyncError(
              'Otro partido activo impide publicar este encuentro. Finaliza el partido remoto o elimina el local.',
            );
          }
        } else {
          await this.matches.put(operation.match);
        }
        return;
      }
      case 'match-events-commit':
        await this.events.commit(operation.match, operation.events);
        return;
      case 'match-integrity-manifest': {
        const { error } = await this.client.rpc('publish_match_integrity_manifest', {
          p_match_id: operation.entityId,
          p_event_ids: operation.snapshot.expectedEventIds,
          p_lineup_event_ids: operation.snapshot.expectedLineupEventIds,
          p_player_ids: operation.snapshot.expectedMatchPlayerIds,
          p_checksum: operation.snapshot.checksum,
        });
        if (error) throw error;
        return;
      }
      case 'match-event-update':
        await this.events.updateEvent(operation.match, operation.event);
        return;
      case 'match-delete':
        await this.matches.delete(operation.entityId);
        return;
      case 'strategy-upsert':
        await this.strategies.save(operation.strategy);
        return;
      case 'strategy-delete':
        await this.strategies.delete(operation.entityId);
        return;
      case 'photo-upload': {
        const record = await this.db.playerPhotos.get(operation.ref.storageKey);
        if (!record || record.updatedAt !== operation.ref.updatedAt)
          throw new PermanentSyncError('La foto local no está disponible para sincronizar.');
        await this.photos.upload(operation.ref, new Blob([record.data], { type: record.mimeType }));
        return;
      }
      case 'photo-delete':
        await this.photos.delete(operation.ref);
        return;
    }
  }

  async pull(): Promise<RemoteSyncSnapshot> {
    const teams = await this.teams.list();
    const playerGroups = await Promise.all(teams.map((team) => this.players.listByTeam(team.id)));
    const profileGroups = await Promise.all(teams.map((team) => this.profiles.listByTeam(team.id)));
    const matchGroups = await Promise.all(teams.map((team) => this.matches.listByTeam(team.id)));
    const matches = matchGroups.flat();
    const strategyGroups = await Promise.all(
      teams.map((team) => this.strategies.listIncludingDeleted(team.id)),
    );
    const eventGroups = await Promise.all(
      matches.map((match) => this.events.listByMatch(match.id)),
    );
    return {
      teams,
      players: playerGroups.flat(),
      profiles: profileGroups.flat(),
      matches,
      events: eventGroups.flat(),
      strategies: strategyGroups.flat(),
    };
  }
}
