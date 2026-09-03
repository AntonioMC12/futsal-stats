# ADR-001: Normalize alpha_0.1 local data for future synchronization

- Status: accepted
- Date: 2026-09-03

## Context

The alpha database uses stable strings as IndexedDB primary keys, but historical and built-in IDs
are not consistently UUIDs. `Match` also inferred ownership from an optional `homeTeam.id`. Events
contain several entity references, so changing only primary keys would corrupt the Event Store.

## Options considered

1. Preserve every legacy string forever. Lowest migration risk, but cloud UUID columns and global
   identity would remain unresolved.
2. Add separate cloud IDs while keeping local IDs. This creates permanent dual identity and mapper
   ambiguity.
3. Normalize non-UUID IDs once and rewrite all references atomically during the Dexie upgrade.

## Decision

Use option 3. Dexie v3 builds maps for Team, Player, Match and MatchEvent IDs. Valid UUIDs are
preserved. Other IDs receive UUIDs, except known Apaga IDs, which map to documented fixed UUIDs.
All foreign keys, player snapshots and event-to-event references are rewritten before any v3 data
is committed.

The migration refuses duplicate global UUIDs and orphan references. It does not silently remove,
repair or invent parent records. Sync metadata is stored only in local persistence records.

## Rollback and recovery

Dexie runs schema upgrades in a transaction. A thrown validation error rolls back all clears and
writes, leaving version 2 intact. The application must never respond by deleting IndexedDB.
Operators can inspect the diagnostic error, repair/export the invalid record with a dedicated tool,
and retry. There is no reverse v3→v2 migration because the upgrade preserves the complete logical
dataset and production rollback should deploy code capable of reading v3.

## Consequences

- Existing bookmarks or external references to non-UUID local IDs change after upgrade.
- Internal links, active-match recovery, undo and statistics remain consistent.
- Seed identity is stable across clean installs and migrated databases.
- Future repositories can use PostgreSQL UUID primary keys without a second identity migration.

## Verification

Automated tests create a real v2 fake IndexedDB database, upgrade it through the production v3
migration and verify counts, UUIDs, ownership, player snapshots, event ordering, undo references,
active-match recovery and derived statistics. A separate invalid fixture verifies transactional
rollback to v2, and the seed fixture verifies idempotence.
