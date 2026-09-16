# ADR-004: Stable passwordless identity

- Status: accepted
- Date: 2026-09-15

## Context

Anonymous browser identities cannot recover access after reinstalling the PWA or moving to a new
device. Team ownership must belong to a person with a stable, recoverable identity.

## Decision

Use Supabase Auth email OTP. The SDK persists and refreshes the session, the router
protects private routes, and explicit logout removes the local session without deleting pending
IndexedDB changes. A minimal `profiles` row is created for each Auth user.

Membership roles are cached locally by Auth user ID and team ID so a previously verified OWNER or
EDITOR can continue recording offline. PostgreSQL RLS remains authoritative and rejects stale or
forged permissions during sync.

## Consequences

- Users must have access to their email to recover the account on another device.
- The Supabase email sign-in template must use `{{ .Token }}`. The flow does not use a Magic Link
  redirect.
- Anonymous Auth is no longer created automatically or accepted as the durable identity.
