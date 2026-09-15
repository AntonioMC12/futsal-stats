import { TestBed } from '@angular/core/testing';
import { TEAM_REPOSITORY } from '../persistence/persistence.tokens';
import { Team } from '../../shared/models/team';
import { TeamWorkspaceContext } from './team-workspace.context';

const teams: Team[] = [
  { id: 'team-a', name: 'Alpha', shortName: 'ALP', createdAt: 1, updatedAt: 1 },
  { id: 'team-b', name: 'Beta', shortName: 'BET', createdAt: 2, updatedAt: 2 },
];

describe('TeamWorkspaceContext', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.resetTestingModule());

  it('selects the first team and persists explicit workspace changes', async () => {
    TestBed.configureTestingModule({
      providers: [
        TeamWorkspaceContext,
        { provide: TEAM_REPOSITORY, useValue: { list: async () => teams } },
      ],
    });
    const context = TestBed.inject(TeamWorkspaceContext);

    await context.initialize();
    expect(context.activeTeam()?.id).toBe('team-a');
    expect(await context.selectTeam('team-b')).toBe(true);
    expect(context.activeTeam()?.id).toBe('team-b');

    const restored = TestBed.runInInjectionContext(() => new TeamWorkspaceContext());
    await restored.initialize();
    expect(restored.activeTeam()?.id).toBe('team-b');
  });

  it('falls back safely when a persisted team no longer exists', async () => {
    localStorage.setItem('futsal-stats.active-team-id', 'removed');
    TestBed.configureTestingModule({
      providers: [
        TeamWorkspaceContext,
        { provide: TEAM_REPOSITORY, useValue: { list: async () => teams } },
      ],
    });
    const context = TestBed.inject(TeamWorkspaceContext);

    await context.initialize();
    expect(context.activeTeam()?.id).toBe('team-a');
  });
});
