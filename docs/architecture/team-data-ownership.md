# Team data ownership

`Team` is the data boundary. A valid `team_memberships` row authorizes access; the invitation code only creates that membership. OWNER and EDITOR may write sporting content, VIEWER may read it, and only OWNER manages memberships. The database and Storage policies enforce these rules independently of Angular.

Dexie is the operational store and offline cache. Its durable queue uploads local changes before a pull of the authorized Team snapshot. Supabase is shared persistence. Matches, imported matches, events, lineups, players, profiles and Team settings use the existing repositories and queue. Statistics and player history are derived from those records on each device.

Strategies are stored as one versioned Team row with ordered `phases` JSONB. Each phase contains its pieces, arrows and animation duration. The UUID and the existing sequence UUIDs survive local migration. Saving and deleting enqueue an idempotent operation. RLS grants direct reads; write RPCs check membership and prevent a stale cache from reviving a remote tombstone. The built-in RAVI example remains a local seed until explicitly edited and saved.

Player photo blobs use the private `player-photos` Storage bucket at `teams/{teamId}/players/{playerId}/profile`. The profile metadata holds the reference. Existing Dexie blobs are queued for upload at startup. On another device the photo is downloaded on demand and cached in Dexie. An upload is completed before its profile reference is sent. Storage policies check both Team membership and player ownership. The bucket must remain private.

When a successful cloud pull no longer includes a previously synchronized Team, the local Team is marked revoked and removed from the workspace. Cached sporting records remain in IndexedDB so failed local operations can be reviewed, but navigation and Team selection no longer expose the revoked workspace. Server RLS rejects subsequent requests.

Apply `database/migrations/0009_team_shared_assets.sql` after `0008`. An actual Supabase project and two authenticated devices are needed to confirm Storage policies, RLS, data convergence, session restoration, and revocation end to end.
