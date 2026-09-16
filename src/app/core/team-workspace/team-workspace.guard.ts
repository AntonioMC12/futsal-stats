import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TeamWorkspaceContext } from './team-workspace.context';
import { MATCH_REPOSITORY, PLAYER_REPOSITORY } from '../persistence/persistence.tokens';
import { TeamAccessService } from './team-access.service';

export const teamWorkspaceGuard: CanActivateFn = async () => {
  const workspace = inject(TeamWorkspaceContext);
  const router = inject(Router);
  await workspace.initialize();
  return workspace.activeTeam()
    ? true
    : router.createUrlTree(['/access']);
};

export const matchTeamWorkspaceGuard: CanActivateFn = async (route) => {
  const workspace = inject(TeamWorkspaceContext);
  const router = inject(Router);
  const matches = inject(MATCH_REPOSITORY);
  await workspace.initialize();
  const matchId = route.paramMap.get('matchId');
  if (!matchId) return true;
  try {
    const match = await matches.get(matchId);
    if (match && !(await workspace.selectTeam(match.teamId)))
      return router.createUrlTree(['/teams']);
  } catch {
    // The live screen owns its existing missing/load-error handling.
  }
  return true;
};

export const playerTeamWorkspaceGuard: CanActivateFn = async (route) => {
  const workspace = inject(TeamWorkspaceContext);
  const router = inject(Router);
  const players = inject(PLAYER_REPOSITORY);
  await workspace.initialize();
  const playerId = route.paramMap.get('playerId');
  if (!playerId) return true;
  try {
    const player = (await players.listByIds([playerId]))[0];
    if (player && !(await workspace.selectTeam(player.teamId)))
      return router.createUrlTree(['/teams']);
  } catch {
    // The profile screen owns its missing/load-error handling.
  }
  return true;
};

export const workspaceWriteGuard: CanActivateFn = async () => {
  const workspace = inject(TeamWorkspaceContext);
  const access = inject(TeamAccessService);
  const router = inject(Router);
  await workspace.initialize();
  const teamId = workspace.activeTeamId();
  if (teamId) await access.load(teamId);
  return teamId && access.canWrite()
    ? true
    : router.createUrlTree(['/dashboard'], { queryParams: { readOnly: 'true' } });
};

export const workspaceOwnerGuard: CanActivateFn = async () => {
  const workspace = inject(TeamWorkspaceContext);
  const access = inject(TeamAccessService);
  const router = inject(Router);
  await workspace.initialize();
  const teamId = workspace.activeTeamId();
  if (teamId) await access.load(teamId);
  return teamId && access.role() === 'owner'
    ? true
    : router.createUrlTree(['/dashboard'], { queryParams: { ownerRequired: 'true' } });
};

export const teamRouteWriteGuard: CanActivateFn = async (route) => {
  const access = inject(TeamAccessService);
  const router = inject(Router);
  const teamId = route.paramMap.get('teamId');
  if (!teamId) return true;
  await access.load(teamId);
  return access.canWrite()
    ? true
    : router.createUrlTree(['/teams', teamId], { queryParams: { readOnly: 'true' } });
};
