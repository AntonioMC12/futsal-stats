import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const config = inject(CLOUD_CONFIG);
  if (config.mode === 'local') return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.initialize();
  return auth.authenticated() ? true : router.createUrlTree(['/access']);
};
