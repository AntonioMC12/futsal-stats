# Cloud-ready data model

## Scope

This iteration keeps IndexedDB as the only operational store. It adds no backend, network request,
authentication or synchronization engine. Its purpose is to make local records deterministic to
export and structurally compatible with a later PostgreSQL adapter.

## Entity model and ownership

```text
Team
├── Player[]          Player.teamId
└── Match[]           Match.teamId
    ├── squad/player snapshots
    └── MatchEvent[]  MatchEvent.matchId
        ├── optional Player references
        └── event-to-event references (undo/reduction)
```

`Team` is the ownership root. `Match.teamId` is explicit and must equal `Match.homeTeam.id`.
`MatchEvent` does not duplicate `teamId`: ownership is obtained through its required `matchId`.
Local adapters reject missing teams, players outside the owning team, invalid squad references,
events for another match, and missing undo/reduction targets.

## IDs

All newly created `Team`, `Player`, `Match` and `MatchEvent` entities use the central `createId()`
factory, backed by `crypto.randomUUID()` with an RFC 4122-compatible fallback. IDs never depend on
array positions, timestamps or IndexedDB auto-increment keys.

The built-in Apaga seed uses documented, fixed UUIDs. Stable constants are necessary to keep the
seed idempotent and preserve later user edits. The v3 migration maps its historical
`built-in-*` IDs to those UUIDs.

## Domain entities and local records

Sync transport state is infrastructure data and does not belong in pure sports-domain models.
Local records therefore extend the domain shape with:

```ts
interface LocalSyncMetadata {
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  revision: number;
  syncStatus: 'pending' | 'synced' | 'failed';
}
```

Pure mappers remove/add this metadata at repository boundaries. `Team` and `Match` already expose
their business timestamps; `Player` and `MatchEvent` receive persistence timestamps only in local
records. `MatchEvent.timestamp` remains the sporting occurrence time and is never replaced.

While no cloud exists, every local write uses `syncStatus: 'pending'`. This means “not yet sent to a
remote system”; it does not simulate a successful or failed synchronization. New records start at
revision 1. Updating a Team, Player or Match increments its revision. Events remain append-only at
revision 1.

Local timestamps are UTC epoch milliseconds, which are deterministic in JSON. A future SQL mapper
must convert them to/from PostgreSQL `timestamptz` using UTC ISO-8601 values. `createdAt` is retained
on updates; `updatedAt` changes only on writes. Reads do not mutate either value.

`deletedAt` is currently `null`. Local match deletion remains a physical, atomic deletion of Match
and MatchEvents. Soft deletion is reserved for cloud synchronization policy; Teams and Players are
not silently soft-deleted in this iteration.

## IndexedDB schema

Dexie v3 keeps the four existing stores and primary keys:

- `teams`: adds the `syncStatus` index.
- `players`: adds `updatedAt` and `syncStatus` indexes.
- `matches`: adds `teamId`, `syncStatus` and `[teamId+updatedAt]` indexes.
- `events`: adds `updatedAt`, `syncStatus` and `[matchId+sequence]` indexes.

No table is renamed. Live event commit, single-active-match creation, match deletion and the built-in
seed remain transactional.

## Legacy v2 → v3 migration

The Dexie version upgrade runs in its native transaction:

1. Read all four legacy stores.
2. Preserve every valid, globally non-colliding UUID.
3. Map fixed Apaga IDs to fixed UUIDs and generate UUIDs for other legacy IDs.
4. Rewrite `Player.teamId`, `Match.teamId`, `homeTeam.id`, squad and starter snapshots.
5. Rewrite every event ID, `matchId`, player reference, lineup snapshot, undo target and reduction
   event reference.
6. Derive missing timestamps deterministically from existing owner/match/event timestamps.
7. Validate every relationship; any orphan or collision throws a diagnostic migration error.
8. Replace store contents with v3 records inside the same upgrade transaction.

If any step fails, Dexie aborts the upgrade and IndexedDB retains the complete v2 database. The app
must not clear the database automatically. Recovery is to correct/export the invalid legacy data in
a diagnostic build and retry the same migration. Migration tests verify this rollback behavior.

## Stable Team bundle

`TeamDataBundle` contains the local Team record plus all Players, Matches and MatchEvents owned by
it. Serialization sorts entity IDs and events by match, sequence, timestamp and ID. The JSON uses
numbers, strings, booleans, arrays and plain objects only—no `Date` instances or circular links.
Deserialization validates the ownership chain before returning a bundle.

## PostgreSQL model

[`database/migrations/0001_initial_cloud_model.sql`](../../database/migrations/0001_initial_cloud_model.sql)
creates `teams`, `players`, `matches`, `match_players`, `match_events` and
`match_event_lineup_players`. It includes UUID primary keys, ownership foreign keys, ordering
constraints and indexes. Match deletion cascades to participation snapshots and events, matching
local behavior. Team/Player deletion is restricted to protect history; future soft-delete workflows
will set `deleted_at` instead.

`syncStatus` is intentionally absent from PostgreSQL because it describes the local transport
queue, not shared business state. `revision` and `deleted_at` are cloud records suitable for later
optimistic concurrency and soft delete. No conflict resolution is implemented yet.

## Differences and deferred decisions

- Local records use epoch milliseconds; PostgreSQL uses `timestamptz`.
- Local event variants are a TypeScript union; SQL stores common references in columns and remaining
  variant data in `metadata JSONB`.
- RLS, memberships, invitations, authentication, cloud repositories, retry queues, realtime and
  conflict resolution are deferred.
- Cross-table Team ownership is validated by adapters now; future PostgreSQL writes should enforce
  the same invariant in a transaction or trusted server function.

## Known risks

- A genuinely orphaned v2 record blocks migration by design; retaining data is safer than silently
  dropping it.
- A future mapper must keep SQL event-specific columns and JSONB metadata aligned with the
  TypeScript event union.
- `pending` records will require a durable sync queue before any cloud adapter is enabled.
