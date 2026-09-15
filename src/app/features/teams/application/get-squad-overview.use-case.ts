import { inject, Injectable } from '@angular/core';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_PHOTO_REPOSITORY,
  PLAYER_PROFILE_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { isMatchFinished } from '../../../shared/models/match';
import { buildSquadOverview, SquadOverview } from '../domain/squad-overview';

export interface SquadOverviewResult extends SquadOverview {
  photoBlobs: Map<string, Blob>;
}

@Injectable({ providedIn: 'root' })
export class GetSquadOverviewUseCase {
  private readonly players = inject(PLAYER_REPOSITORY);
  private readonly profiles = inject(PLAYER_PROFILE_REPOSITORY);
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly events = inject(MATCH_EVENT_REPOSITORY);
  private readonly photos = inject(PLAYER_PHOTO_REPOSITORY);

  async execute(teamId: string, season = 'all'): Promise<SquadOverviewResult> {
    const [players, profiles, matches] = await Promise.all([
      this.players.listByTeam(teamId),
      this.profiles.listByTeam(teamId),
      this.matches.listByTeam(teamId),
    ]);
    const finished = matches.filter(isMatchFinished);
    const records = await Promise.all(
      finished.map(async (match) => ({ match, events: await this.events.listByMatch(match.id) })),
    );
    const overview = buildSquadOverview(players, profiles, records, season);
    const refs = profiles.flatMap(({ photoRef }) => (photoRef ? [photoRef] : []));
    return { ...overview, photoBlobs: await this.photos.getMany(refs) };
  }
}
