import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MATCH_REPOSITORY } from '../../../core/persistence/persistence.tokens';

export const noActiveMatchGuard: CanActivateFn = async () => {
  const matches = inject(MATCH_REPOSITORY);
  const router = inject(Router);
  return (await matches.findActive()) ? router.createUrlTree(['/matches']) : true;
};
