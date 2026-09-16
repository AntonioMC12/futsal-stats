import { Component, effect, inject } from '@angular/core';
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
import { TeamAccessService } from '../../../core/team-workspace/team-access.service';

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
  private readonly access = inject(TeamAccessService);
  private readonly handledRevocations = new Set<string>();

  constructor() {
    this.updates.initialize();
    effect(() => {
      const revoked = this.sync?.revokedTeamIds() ?? [];
      const activeId = this.workspace?.activeTeamId();
      const fresh = revoked.filter((teamId) => !this.handledRevocations.has(teamId));
      if (!fresh.length) return;
      for (const teamId of fresh) {
        this.handledRevocations.add(teamId);
        this.access.revoke(teamId);
      }
      void this.workspace?.refresh().then(() => {
        if (activeId && fresh.includes(activeId)) return this.router.navigate(['/teams']);
        return false;
      });
    });
    effect(() => {
      if (!this.sync?.lastSyncedAt()) return;
      const teamId = this.workspace?.activeTeamId();
      if (!teamId) return;
      this.access.invalidate();
      void this.access.load(teamId);
    });
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

  protected async retrySync(): Promise<void> {
    await this.sync?.retryFailed();
  }
}
