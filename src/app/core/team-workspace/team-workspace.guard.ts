import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TeamWorkspaceContext } from './team-workspace.context';
import { MATCH_REPOSITORY, PLAYER_REPOSITORY } from '../persistence/persistence.tokens';

export const teamWorkspaceGuard: CanActivateFn = async () => {
  const workspace = inject(TeamWorkspaceContext);
  const router = inject(Router);
  await workspace.initialize();
  return workspace.activeTeam()
    ? true
    : router.createUrlTree(['/teams/new'], { queryParams: { onboarding: 'true' } });
};

export const matchTeamWorkspaceGuard: CanActivateFn = async (route) => {
  const workspace = inject(TeamWorkspaceContext);
  const matches = inject(MATCH_REPOSITORY);
  await workspace.initialize();
  const matchId = route.paramMap.get('matchId');
  if (!matchId) return true;
  try {
    const match = await matches.get(matchId);
    if (match) await workspace.selectTeam(match.teamId);
  } catch {
    // The live screen owns its existing missing/load-error handling.
  }
  return true;
};

export const playerTeamWorkspaceGuard: CanActivateFn = async (route) => {
  const workspace = inject(TeamWorkspaceContext);
  const players = inject(PLAYER_REPOSITORY);
  await workspace.initialize();
  const playerId = route.paramMap.get('playerId');
  if (!playerId) return true;
  try {
    const player = (await players.listByIds([playerId]))[0];
    if (player) await workspace.selectTeam(player.teamId);
  } catch {
    // The profile screen owns its missing/load-error handling.
  }
  return true;
};
