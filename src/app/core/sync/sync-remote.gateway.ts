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
import { SyncOperation } from './sync-operation';

export interface RemoteSyncSnapshot {
  teams: readonly Team[];
  players: readonly Player[];
  profiles: readonly PlayerProfile[];
  matches: readonly Match[];
  events: readonly MatchEvent[];
}

export class PermanentSyncError extends Error {}

@Injectable()
export class SyncRemoteGateway {
  private readonly teams = inject(SupabaseTeamRepository);
  private readonly players = inject(SupabasePlayerRepository);
  private readonly profiles = inject(SupabasePlayerProfileRepository);
  private readonly matches = inject(SupabaseMatchRepository);
  private readonly events = inject(SupabaseMatchEventRepository);

  async push(operation: SyncOperation): Promise<void> {
    switch (operation.kind) {
      case 'team-upsert':
        await this.teams.put(operation.team);
        return;
      case 'player-upsert':
        await this.players.put(operation.player);
        return;
      case 'player-profile-upsert':
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
      case 'match-delete':
        await this.matches.delete(operation.entityId);
    }
  }

  async pull(): Promise<RemoteSyncSnapshot> {
    const teams = await this.teams.list();
    const playerGroups = await Promise.all(teams.map((team) => this.players.listByTeam(team.id)));
    const profileGroups = await Promise.all(teams.map((team) => this.profiles.listByTeam(team.id)));
    const matchGroups = await Promise.all(teams.map((team) => this.matches.listByTeam(team.id)));
    const matches = matchGroups.flat();
    const eventGroups = await Promise.all(
      matches.map((match) => this.events.listByMatch(match.id)),
    );
    return {
      teams,
      players: playerGroups.flat(),
      profiles: profileGroups.flat(),
      matches,
      events: eventGroups.flat(),
    };
  }
}
