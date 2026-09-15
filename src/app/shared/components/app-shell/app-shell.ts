import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { SystemNotificationComponent } from '../system-notification/system-notification';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { CLOUD_CONFIG } from '../../../core/cloud/cloud.config';
import { CloudFoundationService } from '../../../core/cloud/cloud-foundation.service';
import { PwaUpdateService } from '../../../core/update/pwa-update.service';
import { UpdateNotificationComponent } from '../update-notification/update-notification';
import { AuthService } from '../../../core/auth/auth.service';
import { OfflineSyncService } from '../../../core/sync/offline-sync.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SystemNotificationComponent,
    UpdateNotificationComponent,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  readonly connectivity = inject(ConnectivityService);
  protected readonly workspace = inject(TeamWorkspaceContext, { optional: true });
  protected readonly cloudConfig = inject(CLOUD_CONFIG);
  protected readonly cloud = inject(CloudFoundationService);
  protected readonly auth = inject(AuthService);
  protected readonly sync = inject(OfflineSyncService, { optional: true });
  private readonly router = inject(Router);
  private readonly updates = inject(PwaUpdateService);

  constructor() {
    this.updates.initialize();
  }

  get liveMatchActive(): boolean {
    return this.router.url.startsWith('/live/');
  }

  get strategiesActive(): boolean {
    return this.router.url.startsWith('/strategies');
  }

  get strategyDesignerActive(): boolean {
    return this.router.url.startsWith('/strategies/designer');
  }

  protected async changeWorkspace(event: Event): Promise<void> {
    const teamId = (event.target as HTMLSelectElement).value;
    if (await this.workspace?.selectTeam(teamId)) await this.router.navigate(['/dashboard']);
  }

  protected async retryCloud(): Promise<void> {
    await this.cloud.initialize();
    if (this.cloud.status() === 'connected') await this.workspace?.refresh();
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }

  protected async retrySync(): Promise<void> {
    await this.sync?.retryFailed();
  }
}
