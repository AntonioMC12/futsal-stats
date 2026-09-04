import { Routes } from '@angular/router';
import { noActiveMatchGuard } from './features/match-setup/application/no-active-match.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'matches',
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
    canActivate: [noActiveMatchGuard],
    loadComponent: () =>
      import('./features/match-setup/ui/match-setup-page').then((m) => m.MatchSetupPage),
  },
  {
    path: 'matches',
    loadComponent: () => import('./features/matches/ui/matches-page').then((m) => m.MatchesPage),
  },
  {
    path: 'strategies',
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
  { path: '**', redirectTo: 'matches' },
];
