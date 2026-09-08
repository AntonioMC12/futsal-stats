# Cloud foundation (iteration 4)

The selected infrastructure is Supabase: PostgreSQL, anonymous Supabase Auth and Row Level
Security. Cloud mode is deliberately opt-in; without valid runtime configuration the application
continues to use IndexedDB.

## Provisioning

1. Create separate Supabase projects for development and production.
2. Enable anonymous sign-ins in **Authentication > Providers**. Add CAPTCHA before exposing a
   public production deployment to limit automated anonymous-account creation.
3. Apply `database/migrations/0001_initial_cloud_model.sql` and then
   `database/migrations/0002_cloud_foundation.sql` through the Supabase migration workflow.
4. Copy `public/cloud-config.js` per deployment and set:

```js
globalThis.__FUTSAL_STATS_CLOUD__ = {
  mode: 'cloud',
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
};
```

Only the publishable (or legacy `anon`) key belongs in browser configuration. A `service_role`
key bypasses RLS and must never be included in this repository, deployment assets or Angular
environment files.

## Security and data ownership

Each browser gets an anonymous authenticated user. `team_memberships` links that identity to its
teams. The first call to `upsert_team_workspace` creates the team and owner membership atomically;
all later writes require owner/editor membership. RLS follows the team relationship through
players, matches, match players, events and lineup snapshots. Anonymous PostgreSQL access is
revoked; only the `authenticated` role receives explicit grants.

## Runtime behaviour

At startup `CloudFoundationService` restores or creates the anonymous session and performs a
minimal RLS-protected read health check. Repository tokens select Supabase adapters only in cloud
mode. Strategies remain local until their cloud model is introduced. Offline synchronization and
conflict resolution are intentionally deferred to the synchronization iteration; cloud-mode
writes currently require connectivity.

## Manual acceptance check

- In browser A, create a team and a player; reload and verify both can be read.
- In a clean browser profile B using the same project, verify browser A's team is not returned.
- Inspect the built JavaScript and deployed `cloud-config.js`; verify no `service_role` key exists.
- Disable connectivity in cloud mode and verify the operation reports an error rather than
  silently claiming persistence.
