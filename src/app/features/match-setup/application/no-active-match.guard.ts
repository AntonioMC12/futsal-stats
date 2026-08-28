import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatchRepository } from '../../../core/persistence/match.repository';

export const noActiveMatchGuard: CanActivateFn = async () => {
  const matches = inject(MatchRepository);
  const router = inject(Router);
  return (await matches.findActive()) ? router.createUrlTree(['/matches']) : true;
};
