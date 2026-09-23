import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
  TEAM_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { TeamDashboardPage } from './team-dashboard-page';

describe('TeamDashboardPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders real dashboard data and all requested navigation links', async () => {
    const team = { id: 'team-a', name: 'Alpha', shortName: 'ALP', createdAt: 1, updatedAt: 1 };
    const match = {
      id: 'match-a',
      teamId: team.id,
      homeTeam: team,
      awayTeam: { name: 'Rival', shortName: 'RIV' },
      date: '2026-09-07',
      season: '2026/27',
      competition: 'Liga',
      description: '',
      status: 'finished' as const,
      currentPeriod: 2,
      periodCount: 2,
      clock: createMatchClock(),
      squadPlayerIds: ['p1'],
      startingLineupPlayerIds: ['p1'],
      createdAt: 1,
      updatedAt: 1,
      importMetadata: {
        fileName: 'fixture.csv',
        importedAt: '2026-09-07T00:00:00Z',
        fingerprint: 'fixture',
        legacySnapshot: {
          importFormat: 'legacy-player-snapshot' as const,
          reconstructionVersion: 1 as const,
          observedTeamName: 'Alpha',
          observedScore: { home: 3, away: 1 },
          players: [{ playerId: 'p1', secondsPlayed: 1_200 }],
          missingData: ['eventTimeline', 'substitutionTimeline', 'lineupHistory'] as const,
        },
      },
    };
    await TestBed.configureTestingModule({
      imports: [TeamDashboardPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        TeamWorkspaceContext,
        { provide: TEAM_REPOSITORY, useValue: { list: async () => [team] } },
        {
          provide: PLAYER_REPOSITORY,
          useValue: {
            listByTeam: async () => [
              { id: 'p1', teamId: team.id, number: 7, name: 'Juan', active: true },
            ],
          },
        },
        { provide: MATCH_REPOSITORY, useValue: { listByTeam: async () => [match] } },
        { provide: MATCH_EVENT_REPOSITORY, useValue: { listByMatch: async () => [] } },
      ],
    }).compileComponents();
    const workspace = TestBed.inject(TeamWorkspaceContext);
    await workspace.initialize();

    const fixture = TestBed.createComponent(TeamDashboardPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Último partido');
      expect(fixture.nativeElement.textContent).toContain('Juan');
    });

    const links = [...fixture.nativeElement.querySelectorAll('a')].map(
      (link: HTMLAnchorElement) => ({
        text: link.textContent?.trim(),
        href: link.getAttribute('href'),
      }),
    );
    expect(fixture.nativeElement.textContent).toContain('3 - 1');
    expect(links).toContainEqual(
      expect.objectContaining({
        text: expect.stringContaining('Ver resumen'),
        href: '/matches/match-a',
      }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining('Ver todos'), href: '/matches' }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining('Ver plantilla'), href: '/players' }),
    );
  });

  it('renders the empty states for matches and players', async () => {
    const team = { id: 'team-a', name: 'Alpha', shortName: 'ALP', createdAt: 1, updatedAt: 1 };
    await TestBed.configureTestingModule({
      imports: [TeamDashboardPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        TeamWorkspaceContext,
        { provide: TEAM_REPOSITORY, useValue: { list: async () => [team] } },
        { provide: PLAYER_REPOSITORY, useValue: { listByTeam: async () => [] } },
        { provide: MATCH_REPOSITORY, useValue: { listByTeam: async () => [] } },
        { provide: MATCH_EVENT_REPOSITORY, useValue: { listByMatch: async () => [] } },
      ],
    }).compileComponents();
    await TestBed.inject(TeamWorkspaceContext).initialize();

    const fixture = TestBed.createComponent(TeamDashboardPage);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Todavía no hay partidos registrados');
    });
    expect(fixture.nativeElement.textContent).toContain('Todavía no hay jugadores en la plantilla');
  });
});
