# ADR-005: Anonymous device identity and Team recovery

- Status: accepted
- Date: 2026-09-16
- Supersedes: [ADR-004](004-passwordless-stable-identity.md)

## Decision

Each installation restores its persisted Supabase session or creates one anonymous Auth user. A
`team_memberships` row authorizes that user for a Team and assigns OWNER, EDITOR or VIEWER. RLS
enforces every cloud read and write. A short lived, single use invitation grants access to an
additional device. A separate 256 bit Team Recovery Key can restore OWNER access after local
storage loss. The server stores only its SHA-256 hash and returns plaintext only at creation or
rotation. Recovery checks run in a `security definer` RPC with per-identity rate limiting and audit.

## Consequences

No email, SSO or SMTP is needed. Existing device enrollment, Team isolation, revocation and the
local-first outbox remain in use. A normal PWA update keeps the same origin, Supabase Auth storage
and IndexedDB. Clearing browser storage loses the device identity; the Team Recovery Key or an
invitation is then required. There is no personal account recovery. Important Teams should keep
two OWNER devices and store the recovery key outside the app. Unsynced local data may be lost if
all browser storage is removed.

Existing email Auth sessions remain valid as device sessions. They retain their UUID and Team
memberships; the OWNER should create a recovery key from Settings before clearing the session.
No ownership is reassigned automatically.
