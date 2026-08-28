import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TeamsService, TeamSummary } from '../application/teams.service';

@Component({
  selector: 'app-teams-page',
  imports: [RouterLink],
  templateUrl: './teams-page.html',
  styleUrl: './teams-page.scss',
})
export class TeamsPage {
  private readonly teams = inject(TeamsService);

  protected readonly summaries = signal<TeamSummary[]>([]);
  protected readonly loadFailed = signal(false);

  constructor() {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      this.summaries.set(await this.teams.listSummaries());
    } catch {
      this.loadFailed.set(true);
    }
  }
}
