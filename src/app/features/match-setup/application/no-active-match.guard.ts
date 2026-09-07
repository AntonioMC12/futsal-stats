import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MATCH_REPOSITORY } from '../../../core/persistence/persistence.tokens';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';

export const noActiveMatchGuard: CanActivateFn = async () => {
  const matches = inject(MATCH_REPOSITORY);
  const router = inject(Router);
  const workspace = inject(TeamWorkspaceContext, { optional: true });
  const activeMatch = await matches.findActive();
  if (!activeMatch) return true;
  await workspace?.selectTeam(activeMatch.teamId);
  return router.createUrlTree(['/matches']);
};
