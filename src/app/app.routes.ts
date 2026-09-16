import { Routes } from '@angular/router';
import { noActiveMatchGuard } from './features/match-setup/application/no-active-match.guard';
import {
  matchTeamWorkspaceGuard,
  playerTeamWorkspaceGuard,
  teamRouteWriteGuard,
  teamWorkspaceGuard,
  workspaceOwnerGuard,
  workspaceWriteGuard,
} from './core/team-workspace/team-workspace.guard';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/ui/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, teamWorkspaceGuard],
    loadComponent: () =>
      import('./features/workspace/ui/team-dashboard-page').then((m) => m.TeamDashboardPage),
  },
  {
    path: 'players',
    canActivate: [authGuard, teamWorkspaceGuard],
    data: { workspaceMode: true },
    loadComponent: () =>
      import('./features/teams/ui/team-detail-page').then((m) => m.TeamDetailPage),
  },
  {
    path: 'players/:playerId',
    canActivate: [authGuard, playerTeamWorkspaceGuard],
    loadComponent: () =>
      import('./features/player-profiles/ui/player-profile-page').then((m) => m.PlayerProfilePage),
  },
  {
    path: 'settings/devices',
    canActivate: [authGuard, teamWorkspaceGuard, workspaceOwnerGuard],
    loadComponent: () =>
      import('./features/device-enrollment/ui/devices-page').then((m) => m.DevicesPage),
  },
  {
    path: 'settings',
    canActivate: [authGuard, teamWorkspaceGuard],
    data: { workspaceMode: true },
    loadComponent: () =>
      import('./features/teams/ui/team-editor-page').then((m) => m.TeamEditorPage),
  },
  {
    path: 'join',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/device-enrollment/ui/join-team-page').then((m) => m.JoinTeamPage),
  },
  {
    path: 'teams',
    canActivate: [authGuard],
    loadComponent: () => import('./features/teams/ui/teams-page').then((m) => m.TeamsPage),
  },
  {
    path: 'teams/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/teams/ui/team-editor-page').then((m) => m.TeamEditorPage),
  },
  {
    path: 'teams/:teamId/edit',
    canActivate: [authGuard, teamRouteWriteGuard],
    loadComponent: () =>
      import('./features/teams/ui/team-editor-page').then((m) => m.TeamEditorPage),
  },
  {
    path: 'teams/:teamId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/teams/ui/team-detail-page').then((m) => m.TeamDetailPage),
  },
  {
    path: 'matches/new',
    canActivate: [authGuard, teamWorkspaceGuard, workspaceWriteGuard, noActiveMatchGuard],
    loadComponent: () =>
      import('./features/match-setup/ui/match-setup-page').then((m) => m.MatchSetupPage),
  },
  {
    path: 'matches',
    canActivate: [authGuard, teamWorkspaceGuard],
    loadComponent: () => import('./features/matches/ui/matches-page').then((m) => m.MatchesPage),
  },
  {
    path: 'matches/import',
    canActivate: [authGuard, teamWorkspaceGuard, workspaceWriteGuard],
    loadComponent: () =>
      import('./features/matches/ui/import-match-page').then((m) => m.ImportMatchPage),
  },
  {
    path: 'matches/:matchId',
    canActivate: [authGuard, matchTeamWorkspaceGuard],
    loadComponent: () =>
      import('./features/matches/ui/match-detail-page').then((m) => m.MatchDetailPage),
  },
  {
    path: 'strategies',
    canActivate: [authGuard, teamWorkspaceGuard],
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
    canActivate: [authGuard, matchTeamWorkspaceGuard, workspaceWriteGuard],
    loadComponent: () =>
      import('./features/live-match/ui/live-match-page').then((m) => m.LiveMatchPage),
  },
  {
    path: 'reglamento-rfef',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/rfef-regulations/ui/rfef-regulations-page').then(
        (m) => m.RfefRegulationsPage,
      ),
  },
  { path: '**', redirectTo: 'dashboard' },
];
