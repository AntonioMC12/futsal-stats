import { computed, inject, Injectable, signal } from '@angular/core';
import { TEAM_REPOSITORY } from '../persistence/persistence.tokens';
import { Team } from '../../shared/models/team';

const ACTIVE_TEAM_STORAGE_KEY = 'futsal-stats.active-team-id';

@Injectable()
export class TeamWorkspaceContext {
  private readonly teamsRepository = inject(TEAM_REPOSITORY);
  private initialization: Promise<void> | null = null;

  readonly teams = signal<readonly Team[]>([]);
  readonly activeTeamId = signal<string | null>(null);
  readonly activeTeam = computed(
    () => this.teams().find(({ id }) => id === this.activeTeamId()) ?? null,
  );
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);

  initialize(): Promise<void> {
    this.initialization ??= this.loadTeams();
    return this.initialization;
  }

  async refresh(preferredTeamId = this.activeTeamId()): Promise<void> {
    this.initialization = null;
    await this.loadTeams(preferredTeamId);
    this.initialization = Promise.resolve();
  }

  async selectTeam(teamId: string): Promise<boolean> {
    await this.initialize();
    if (!this.teams().some(({ id }) => id === teamId)) return false;
    this.activate(teamId);
    return true;
  }

  private async loadTeams(preferredTeamId?: string | null): Promise<void> {
    this.error.set(null);
    try {
      const teams = await this.teamsRepository.list();
      this.teams.set(teams);
      const storedTeamId = preferredTeamId ?? readStoredTeamId();
      const activeId = teams.some(({ id }) => id === storedTeamId)
        ? storedTeamId
        : (teams[0]?.id ?? null);
      this.activate(activeId);
    } catch {
      this.teams.set([]);
      this.activeTeamId.set(null);
      this.error.set('No se ha podido cargar el espacio de equipo.');
    } finally {
      this.ready.set(true);
    }
  }

  private activate(teamId: string | null): void {
    this.activeTeamId.set(teamId);
    writeStoredTeamId(teamId);
  }
}

function readStoredTeamId(): string | null {
  try {
    return globalThis.localStorage?.getItem(ACTIVE_TEAM_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStoredTeamId(teamId: string | null): void {
  try {
    if (teamId) globalThis.localStorage?.setItem(ACTIVE_TEAM_STORAGE_KEY, teamId);
    else globalThis.localStorage?.removeItem(ACTIVE_TEAM_STORAGE_KEY);
  } catch {
    // The workspace remains usable when browser storage is unavailable.
  }
}
