# ADR-002: Supabase as the cloud backend

- Status: accepted
- Date: 2026-09-15

## Context

Futsal Stats needs recoverable multi-device data without putting a custom server in the critical
path of live match capture. The browser must never receive administrative database credentials.

## Decision

Use Supabase PostgreSQL, Auth and Row Level Security. The Angular bundle receives only the public
publishable key. Every exposed sports table enables RLS and derives access from
`team_memberships`; privileged membership operations are narrow `security definer` RPCs which
repeat authorization checks.

Supabase is a convergence and recovery layer. IndexedDB remains the operational store and an
outbox performs idempotent synchronization.

## Consequences

- A deployment must configure Auth redirect URLs and apply migrations in order.
- OWNER/EDITOR/VIEWER authorization is enforced in PostgreSQL even if a client is modified.
- Realtime collaborative editing is not implied by this decision.
- The `service_role` key is forbidden in source, browser configuration and build artifacts.
