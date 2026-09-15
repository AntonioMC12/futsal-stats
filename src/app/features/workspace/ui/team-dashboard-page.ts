import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MATCH_REPOSITORY, PLAYER_REPOSITORY } from '../../../core/persistence/persistence.tokens';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { isMatchActive, isMatchFinished, Match } from '../../../shared/models/match';

@Component({
  selector: 'app-team-dashboard-page',
  imports: [RouterLink],
  templateUrl: './team-dashboard-page.html',
  styleUrl: './team-dashboard-page.scss',
})
export class TeamDashboardPage {
  protected readonly workspace = inject(TeamWorkspaceContext);
  private readonly players = inject(PLAYER_REPOSITORY);
  private readonly matches = inject(MATCH_REPOSITORY);

  protected readonly playerCount = signal(0);
  protected readonly activeMatch = signal<Match | null>(null);
  protected readonly finishedCount = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const teamId = this.workspace.activeTeamId();
      if (teamId) void this.load(teamId);
    });
  }

  private async load(teamId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [players, matches] = await Promise.all([
        this.players.listActiveByTeam(teamId),
        this.matches.listByTeam(teamId),
      ]);
      if (this.workspace.activeTeamId() !== teamId) return;
      this.playerCount.set(players.length);
      this.activeMatch.set(matches.find(isMatchActive) ?? null);
      this.finishedCount.set(matches.filter(isMatchFinished).length);
    } catch {
      this.error.set('No se ha podido cargar el resumen del equipo.');
    } finally {
      this.loading.set(false);
    }
  }
}
