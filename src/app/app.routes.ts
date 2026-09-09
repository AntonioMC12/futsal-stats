import { Routes } from '@angular/router';
import { noActiveMatchGuard } from './features/match-setup/application/no-active-match.guard';
import {
  matchTeamWorkspaceGuard,
  playerTeamWorkspaceGuard,
  teamWorkspaceGuard,
} from './core/team-workspace/team-workspace.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    canActivate: [teamWorkspaceGuard],
    loadComponent: () =>
      import('./features/workspace/ui/team-dashboard-page').then((m) => m.TeamDashboardPage),
  },
  {
    path: 'players',
    canActivate: [teamWorkspaceGuard],
    data: { workspaceMode: true },
    loadComponent: () =>
      import('./features/teams/ui/team-detail-page').then((m) => m.TeamDetailPage),
  },
  {
    path: 'players/:playerId',
    canActivate: [playerTeamWorkspaceGuard],
    loadComponent: () =>
      import('./features/player-profiles/ui/player-profile-page').then((m) => m.PlayerProfilePage),
  },
  {
    path: 'settings/devices',
    canActivate: [teamWorkspaceGuard],
    loadComponent: () =>
      import('./features/device-enrollment/ui/devices-page').then((m) => m.DevicesPage),
  },
  {
    path: 'settings',
    canActivate: [teamWorkspaceGuard],
    data: { workspaceMode: true },
    loadComponent: () =>
      import('./features/teams/ui/team-editor-page').then((m) => m.TeamEditorPage),
  },
  {
    path: 'join',
    loadComponent: () =>
      import('./features/device-enrollment/ui/join-team-page').then((m) => m.JoinTeamPage),
  },
  {
    path: 'teams',
    loadComponent: () => import('./features/teams/ui/teams-page').then((m) => m.TeamsPage),
  },
  {
    path: 'teams/new',
    loadComponent: () =>
      import('./features/teams/ui/team-editor-page').then((m) => m.TeamEditorPage),
  },
  {
    path: 'teams/:teamId/edit',
    loadComponent: () =>
      import('./features/teams/ui/team-editor-page').then((m) => m.TeamEditorPage),
  },
  {
    path: 'teams/:teamId',
    loadComponent: () =>
      import('./features/teams/ui/team-detail-page').then((m) => m.TeamDetailPage),
  },
  {
    path: 'matches/new',
    canActivate: [teamWorkspaceGuard, noActiveMatchGuard],
    loadComponent: () =>
      import('./features/match-setup/ui/match-setup-page').then((m) => m.MatchSetupPage),
  },
  {
    path: 'matches',
    canActivate: [teamWorkspaceGuard],
    loadComponent: () => import('./features/matches/ui/matches-page').then((m) => m.MatchesPage),
  },
  {
    path: 'matches/:matchId',
    canActivate: [matchTeamWorkspaceGuard],
    loadComponent: () =>
      import('./features/matches/ui/match-detail-page').then((m) => m.MatchDetailPage),
  },
  {
    path: 'strategies',
    canActivate: [teamWorkspaceGuard],
    loadComponent: () =>
      import('./features/strategies/ui/strategies-page/strategies-page').then(
        (m) => m.StrategiesPage,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'designer' },
      {
        path: 'designer',
        loadComponent: () =>
          import('./features/strategies/ui/strategy-designer-page/strategy-designer-page').then(
            (m) => m.StrategyDesignerPage,
          ),
      },
      {
        path: 'designer/:strategyId',
        loadComponent: () =>
          import('./features/strategies/ui/strategy-designer-page/strategy-designer-page').then(
            (m) => m.StrategyDesignerPage,
          ),
      },
      {
        path: 'library',
        loadComponent: () =>
          import('./features/strategies/ui/strategy-library-page/strategy-library-page').then(
            (m) => m.StrategyLibraryPage,
          ),
      },
    ],
  },
  {
    path: 'live/:matchId',
    canActivate: [matchTeamWorkspaceGuard],
    loadComponent: () =>
      import('./features/live-match/ui/live-match-page').then((m) => m.LiveMatchPage),
  },
  {
    path: 'reglamento-rfef',
    loadComponent: () =>
      import('./features/rfef-regulations/ui/rfef-regulations-page').then(
        (m) => m.RfefRegulationsPage,
      ),
  },
  { path: '**', redirectTo: 'dashboard' },
];
