import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { OfflineSyncService } from '../../../core/sync/offline-sync.service';
import { DashboardFacade, DashboardViewModel } from '../application/dashboard.facade';

@Component({
  selector: 'app-team-dashboard-page',
  imports: [RouterLink],
  templateUrl: './team-dashboard-page.html',
})
export class TeamDashboardPage {
  protected readonly workspace = inject(TeamWorkspaceContext);
  protected readonly sync = inject(OfflineSyncService, { optional: true });
  private readonly dashboard = inject(DashboardFacade);

  protected readonly viewModel = signal<DashboardViewModel | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private requestId = 0;

  constructor() {
    effect(() => {
      const teamId = this.workspace.activeTeamId();
      if (teamId) void this.load(teamId);
    });
  }

  protected retry(): void {
    const teamId = this.workspace.activeTeamId();
    if (teamId) void this.load(teamId);
  }

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }

  private async load(teamId: string): Promise<void> {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const viewModel = await this.dashboard.load(teamId);
      if (this.workspace.activeTeamId() !== teamId || requestId !== this.requestId) return;
      this.viewModel.set(viewModel);
    } catch {
      this.error.set('No se ha podido cargar el resumen del equipo.');
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }
}
