import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { SystemNotificationComponent } from '../system-notification/system-notification';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, SystemNotificationComponent],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  readonly connectivity = inject(ConnectivityService);
  protected readonly workspace = inject(TeamWorkspaceContext, { optional: true });
  private readonly router = inject(Router);

  get liveMatchActive(): boolean {
    return this.router.url.startsWith('/live/');
  }

  get strategiesActive(): boolean {
    return this.router.url.startsWith('/strategies');
  }

  protected async changeWorkspace(event: Event): Promise<void> {
    const teamId = (event.target as HTMLSelectElement).value;
    if (await this.workspace?.selectTeam(teamId)) await this.router.navigate(['/dashboard']);
  }
}
