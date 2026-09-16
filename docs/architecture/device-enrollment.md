# Device enrollment and recovery

Each device has a persisted Supabase Auth identity. `team_memberships` gives it OWNER, EDITOR or
VIEWER access. An OWNER creates a short-lived invitation (default EDITOR, 15 minutes), displayed
once as a code and QR. `consume_team_invite` locks the invitation, checks its hash, expiry and use,
then creates membership. The app invalidates cached role, pulls cloud data and selects the Team.

The Team Recovery Key is separate: a server-generated 256 bit secret shown once to the OWNER.
Only a SHA-256 hash is stored. The OWNER can rotate it in Settings; the old key stops working.
`recover_team_access` rate limits attempts per Auth identity (five per 15 minutes), gives a generic
failure for invalid keys and records successful recovery in `team_access_audit`. It grants OWNER to
the recovering anonymous identity, then the app rebuilds its local cache from cloud. The key is
never stored in localStorage or the database as plaintext.

Revocation removes membership. RLS immediately rejects further remote reads and writes. The next
successful pull hides the revoked Team locally and invalidates the cached role. OWNER can administer
devices; EDITOR can write sports data; VIEWER can only read. Server functions protect the last OWNER.

Supabase must have **Authentication > Providers / Sign In > Anonymous Sign-Ins** enabled and
migration `0010_anonymous_device_identity.sql` applied. Public installations should add CAPTCHA
or another control against anonymous signup abuse. Test QR/code consumption, role permissions,
revocation, key rotation and recovery on separate browsers or devices.
