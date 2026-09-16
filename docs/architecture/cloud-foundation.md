# Cloud foundation

Cloud mode uses Supabase PostgreSQL, Anonymous Auth and Row Level Security. Without a valid
runtime cloud configuration the application continues in local mode with IndexedDB.

## Provisioning

1. Create separate development and production Supabase projects.
2. Enable **Authentication > Providers / Sign In > Anonymous Sign-Ins**. For a publicly accessible
   app, configure CAPTCHA or equivalent abuse protection for anonymous signups.
3. Apply every file in `database/migrations` in numeric order through `0010_anonymous_device_identity.sql`.
   Keep the `player-photos` Storage bucket private.
4. Configure `public/cloud-config.js` with `mode: 'cloud'`, the HTTPS Supabase URL and the
   publishable key. Never include a `service_role` key in browser assets.

## Identity and storage

`AuthService` waits for Supabase to restore its session from the SDK's persistent browser storage.
It checks a restored identity with `getUser()` before cloud writes. If Supabase reports that the
user no longer exists, it clears only the local Auth session, creates a new anonymous identity,
isolates the previous Team cache and waits for recovery by key or invitation. A transient network
failure keeps the saved session usable for offline work, while Team creation and cloud sync wait
for remote verification. It calls `signInAnonymously()` only when no session exists or a stored
session is confirmed invalid. The Supabase client keeps
`persistSession` and `autoRefreshToken` enabled and uses the SDK's unchanged default storage key.
No service worker update clears Auth storage or IndexedDB. The outbox is flushed before a cloud pull;
voluntary PWA activation waits while a match or pending/failed outbox item exists.

`team_memberships` links an Auth UUID to its Teams. Supabase anonymous users have the PostgreSQL
`authenticated` role. RLS checks membership for sports data, strategies and private photos;
OWNER and EDITOR can write, VIEWER can read. Team creation calls
`create_team_with_recovery_key`, which creates Team, OWNER membership and hashed recovery key in
one transaction. Device invites and recovery run through server RPCs.

An existing email Auth session remains valid and keeps its memberships. Its OWNER should generate
a recovery key before deleting the session. There is no automatic identity reassignment. Clearing
all browser storage discards any unsynced local operations; synced Team data is recovered from
Supabase with the saved key.

For administrative diagnosis in Supabase SQL Editor, check the Auth user and the foreign key
source before changing any data:

```sql
select id, is_anonymous, created_at from auth.users where id = '<AUTH_UID>';
select id, name, created_by from public.teams order by created_at desc;
select team_id, auth_user_id, role, device_name
from public.team_memberships order by created_at desc;
```

`teams.created_by` still references `auth.users(id)` and defaults to `auth.uid()`. This hotfix does
not alter that foreign key, RLS or an applied migration.

## Manual acceptance

On device A, create a Team and save the key. Add a player, profile, photo, strategy and match;
wait for `Sincronizado`. Reload and confirm the Auth UUID and Team remain the same. Generate an
EDITOR invite and consume it on device B; verify the same data can be read and edited. A device
without membership must fail to read the Team by UUID. Revoke B and verify a new pull removes
its access. Clear storage on a separate test device, enter the recovery key and verify the full
cloud snapshot is restored. Repeat after deploying a new service worker version on iPad Safari PWA.
