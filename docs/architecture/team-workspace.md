# Team Workspace

## Scope

The application operates inside one active Team before cloud synchronization is introduced. The
workspace is a UI and application boundary; IndexedDB remains the only operational store.

## Selection and onboarding

`TeamWorkspaceContext` loads available teams after built-in data initialization, restores the last
valid selection from local browser storage and otherwise selects the first team. If no team exists,
`teamWorkspaceGuard` redirects protected workspace routes to `/teams/new`.

Creating a team refreshes the context and makes that team active. A missing or removed persisted
selection never prevents startup: the context falls back to the first available team.

## Workspace navigation

- `/dashboard`: team summary and primary actions.
- `/players`: active-team roster management.
- `/matches`: active and finished matches for the active team.
- `/settings`: active-team identity settings and access to team switching.
- `/strategies`: tactical work initialized with the active team.

Legacy `/teams/:teamId` and `/teams/:teamId/edit` routes remain available for direct team
administration. `/live/:matchId` remains match-addressed so recovery links and finished-match
consultation do not depend on current workspace selection.

## Data boundaries

`Player.teamId` and `Match.teamId` are required. Match lists use `MatchRepository.listByTeam`, and
new-match setup exposes only the active team and rejects a mismatched `teamId`. Repository adapters
continue to enforce ownership and squad references at the persistence boundary.

The selected workspace ID is only a local UX preference. It is not authorization. Future cloud
membership and RLS work must derive access from authenticated server-side policy.
