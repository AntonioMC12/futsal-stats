import { inject, Injectable, signal } from '@angular/core';
import {
  APAGA_TEAM_ID,
  createApagaPlayers,
  createApagaTeam,
} from '../../../core/initialization/built-in-teams';
import { PLAYER_REPOSITORY, TEAM_REPOSITORY } from '../../../core/persistence/persistence.tokens';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import { StrategyPlaybackStore } from './strategy-playback.store';

@Injectable()
export class StrategyWorkspaceContext {
  private readonly teamsRepository = inject(TEAM_REPOSITORY, { optional: true });
  private readonly playersRepository = inject(PLAYER_REPOSITORY, { optional: true });
  private readonly store = inject(StrategyPlaybackStore);
  readonly teams = signal<readonly Team[]>([]);
  readonly roster = signal<readonly Player[]>([]);
  readonly teamId = signal(APAGA_TEAM_ID);
  readonly ready = signal(false);

  async initialize(): Promise<void> {
    const fallback = createApagaTeam(Date.now());
    try {
      const teams = await this.teamsRepository?.list();
      this.teams.set(teams?.length ? teams : [fallback]);
    } catch {
      this.teams.set([fallback]);
    }
    this.teamId.set(this.teams()[0]?.id ?? APAGA_TEAM_ID);
    await this.loadTeam();
    this.ready.set(true);
  }

  async selectTeam(teamId: string): Promise<void> {
    this.teamId.set(teamId);
    await this.loadTeam();
  }
  createStrategy(): string {
    this.store.create(this.teamId(), this.roster());
    return this.store.selectedStrategyId()!;
  }

  private async loadTeam(): Promise<void> {
    try {
      this.roster.set(
        (await this.playersRepository?.listActiveByTeam(this.teamId())) ??
          (this.teamId() === APAGA_TEAM_ID ? createApagaPlayers() : []),
      );
    } catch {
      this.roster.set([]);
    }
    await this.store.load(this.teamId());
  }
}
