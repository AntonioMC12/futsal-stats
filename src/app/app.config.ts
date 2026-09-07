import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
  provideZonelessChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { BuiltInDataInitializer } from './core/initialization/built-in-data.initializer';
import { WebGpuDiagnosticsService } from './core/diagnostics/web-gpu-diagnostics.service';
import { provideLocalPersistence } from './core/persistence/provide-local-persistence';
import { TeamWorkspaceContext } from './core/team-workspace/team-workspace.context';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    ...provideLocalPersistence(),
    TeamWorkspaceContext,
    provideAppInitializer(() => inject(WebGpuDiagnosticsService).initialize()),
    provideAppInitializer(() => {
      const builtInData = inject(BuiltInDataInitializer);
      const workspace = inject(TeamWorkspaceContext);
      return builtInData.ensureBuiltInTeams().then(() => workspace.initialize());
    }),
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
