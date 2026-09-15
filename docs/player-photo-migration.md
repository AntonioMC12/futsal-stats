# Player photo asset migration

Player photos uploaded from this iteration are stored as binary assets in the IndexedDB
`playerPhotos` table (database version 8). `PlayerProfile.photoRef` contains only the stable storage
key, MIME type and update timestamp; image data is never embedded as base64 in the profile.

Existing `photoUrl` values remain readable as a temporary compatibility fallback, but the field is
no longer editable and new uploads clear it. In cloud mode the reference is serialized into the
profile metadata so it can evolve without breaking the current `player_profiles` schema. Binary
asset synchronization to a private cloud bucket is intentionally isolated behind
`PlayerPhotoRepository`; until that adapter is enabled, the asset remains local to the device.

The legacy `photoUrl` mapping can be removed after existing profiles have been migrated to managed
assets and all supported clients understand `photoRef`.
