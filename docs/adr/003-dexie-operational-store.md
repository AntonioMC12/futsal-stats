# ADR-003: Dexie and IndexedDB as the operational store

- Status: accepted
- Date: 2026-09-15

## Context

A network request cannot delay or invalidate recording a goal, foul, substitution or lineup
change. Browser reloads and PWA restarts must recover the active match and its pending work.

## Decision

All sports mutations go through repository ports. Cloud-mode repositories first commit the entity
and its outbox operation in one Dexie transaction, then notify the UI and request background sync.
The queue survives reloads, retries with bounded exponential backoff and reuses global entity UUIDs
to make pushes idempotent.

Dexie schema upgrades are transactional. Legacy migrations preserve the source on failure and
statistics remain derivable from `match_events`.

## Consequences

- IndexedDB is authoritative for the live session until synchronization converges.
- Clearing browser site data can remove unsynchronized work.
- `navigator.storage.persist()` is requested only as an extra durability measure; cloud recovery is
  still required.
