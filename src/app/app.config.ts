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
import { TeamWorkspaceContext } from './core/team-workspace/team-workspace.context';
import { providePersistence } from './core/persistence/provide-persistence';
import { CLOUD_CONFIG } from './core/cloud/cloud.config';
import { CloudFoundationService } from './core/cloud/cloud-foundation.service';
import { OfflineSyncService } from './core/sync/offline-sync.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    ...providePersistence(),
    TeamWorkspaceContext,
    provideAppInitializer(() => inject(WebGpuDiagnosticsService).initialize()),
    provideAppInitializer(() => {
      const builtInData = inject(BuiltInDataInitializer);
      const workspace = inject(TeamWorkspaceContext);
      const config = inject(CLOUD_CONFIG);
      const cloud = inject(CloudFoundationService);
      const sync = inject(OfflineSyncService);
      return (async () => {
        if (config.mode === 'cloud') {
          await cloud.initialize();
          await sync.initialize();
        } else {
          await builtInData.ensureBuiltInTeams();
        }
        await workspace.initialize();
      })();
    }),
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
