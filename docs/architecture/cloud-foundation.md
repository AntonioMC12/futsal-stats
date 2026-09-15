# Cloud foundation (iteration 4)

The selected infrastructure is Supabase: PostgreSQL, passwordless email Auth and Row Level
Security. Cloud mode is deliberately opt-in; without valid runtime configuration the application
continues to use IndexedDB.

## Provisioning

1. Create separate Supabase projects for development and production.
2. Enable email Magic Link/OTP in **Authentication > Providers**. Add the production origin and
   `/auth/callback` to the allowed redirect URLs. Configure SMTP and abuse protection before a
   public production deployment.
3. Apply every file in `database/migrations` in numeric order, including
   `0008_passwordless_identity.sql`, through the Supabase migration workflow.
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

Each person gets a stable Supabase Auth user recoverable through email. `team_memberships` links
that identity to its teams. The first call to `upsert_team_workspace` creates the team and owner membership atomically;
all later writes require owner/editor membership. RLS follows the team relationship through
players, matches, match players, events and lineup snapshots. Anonymous PostgreSQL access is
revoked; only the `authenticated` role receives explicit grants.

## Runtime behaviour

At startup `AuthService` restores the persistent session. Private routes redirect to `/login` when
it is absent. Once authenticated, `CloudFoundationService` performs a minimal RLS-protected health
check and the offline sync service pushes its durable outbox before pulling the authorized snapshot.
Repository tokens select local-first adapters in cloud mode. Strategies remain local until their
cloud model is introduced.

## Manual acceptance check

- In browser A, sign in by email, create a team and a player, then reload and verify both can be read.
- In a clean browser profile B, sign in with the same email and verify the team is restored.
- Sign in as an account without membership and verify the first team's UUID cannot be read.
- Inspect the built JavaScript and deployed `cloud-config.js`; verify no `service_role` key exists.
- Disable connectivity in cloud mode and verify the operation reports an error rather than
  silently claiming persistence.
