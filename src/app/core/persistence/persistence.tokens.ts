import { InjectionToken } from '@angular/core';
import { MatchEventRepository } from './ports/match-event.repository';
import { MatchRepository } from './ports/match.repository';
import { PlayerRepository } from './ports/player.repository';
import { TeamRepository } from './ports/team.repository';

export const TEAM_REPOSITORY = new InjectionToken<TeamRepository>('TEAM_REPOSITORY');
export const PLAYER_REPOSITORY = new InjectionToken<PlayerRepository>('PLAYER_REPOSITORY');
export const MATCH_REPOSITORY = new InjectionToken<MatchRepository>('MATCH_REPOSITORY');
export const MATCH_EVENT_REPOSITORY = new InjectionToken<MatchEventRepository>(
  'MATCH_EVENT_REPOSITORY',
);
