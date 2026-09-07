import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TeamsService, TeamSummary } from '../application/teams.service';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { Router } from '@angular/router';

@Component({
  selector: 'app-teams-page',
  imports: [RouterLink],
  templateUrl: './teams-page.html',
  styleUrl: './teams-page.scss',
})
export class TeamsPage {
  private readonly teams = inject(TeamsService);
  protected readonly workspace = inject(TeamWorkspaceContext, { optional: true });
  private readonly router = inject(Router);

  protected readonly summaries = signal<TeamSummary[]>([]);
  protected readonly loadFailed = signal(false);

  constructor() {
    void this.refresh();
  }

  protected async activate(teamId: string): Promise<void> {
    if (await this.workspace?.selectTeam(teamId)) await this.router.navigate(['/dashboard']);
  }

  private async refresh(): Promise<void> {
    try {
      this.summaries.set(await this.teams.listSummaries());
    } catch {
      this.loadFailed.set(true);
    }
  }
}
