import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { createMatchClock } from '../../../core/clock/match-clock';
import { TeamDashboardPage } from './team-dashboard-page';

describe('TeamDashboardPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads only the active team summary', async () => {
    const team = { id: 'team-a', name: 'Alpha', shortName: 'ALP', createdAt: 1, updatedAt: 1 };
    const listByTeam = vi.fn(async () => [
      {
        id: 'match-a',
        teamId: team.id,
        homeTeam: team,
        awayTeam: { name: 'Rival', shortName: 'RIV' },
        date: '2026-09-07',
        description: 'Liga',
        status: 'finished' as const,
        currentPeriod: 2,
        periodCount: 2,
        clock: createMatchClock(),
        squadPlayerIds: [],
        startingLineupPlayerIds: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    await TestBed.configureTestingModule({
      imports: [TeamDashboardPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        TeamWorkspaceContext,
        { provide: TEAM_REPOSITORY, useValue: { list: async () => [team] } },
        { provide: PLAYER_REPOSITORY, useValue: { listActiveByTeam: async () => [{}, {}] } },
        { provide: MATCH_REPOSITORY, useValue: { listByTeam } },
      ],
    }).compileComponents();
    const workspace = TestBed.inject(TeamWorkspaceContext);
    await workspace.initialize();

    const fixture = TestBed.createComponent(TeamDashboardPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('2');
    });

    expect(listByTeam).toHaveBeenCalledWith(team.id);
    expect(fixture.nativeElement.textContent).toContain('Alpha');
    expect(fixture.nativeElement.textContent).toContain('2');
    expect(fixture.nativeElement.textContent).toContain('1');
  });
});
