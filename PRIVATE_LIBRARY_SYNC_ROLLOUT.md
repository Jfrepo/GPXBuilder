# ManCardo Private My Library Sync Rollout

## Intended model

- My Library remains local-first and fully editable without a network connection.
- A verified private account owns the cloud copy.
- Local changes are queued durably in IndexedDB and uploaded when possible.
- Opening ManCardo on another device pulls the latest private cloud revisions into My Library.
- Shared Library remains a separate explicit publish/share action.

## Data integrity protections now built

1. **Local-first writes**: existing local My Library storage is written before cloud work begins.
2. **Durable upload queue**: pending PUT/DELETE operations are stored in IndexedDB and survive reloads.
3. **Optimistic revisions**: every cloud mutation includes the revision the device last saw. Stale writes receive HTTP 409.
4. **Conflict preservation**: if both devices changed the same track, the newer cloud track remains canonical and the unsynced local track is retained as a new Draft `(conflict copy)` with a new track ID.
5. **Delete conflict safety**: a delete is cancelled if another device has edited the track since the deleting device last synced; the newer cloud copy is restored locally.
6. **Duplicate retry safety**: if an upload response is lost but the server actually saved the same payload, SHA-256 comparison treats the retry as successful rather than manufacturing a false conflict.
7. **Integrity hashes**: server and client use SHA-256 over the stored track JSON.
8. **Immutable history**: D1 triggers write each successful cloud revision into `private_library_revisions`.
9. **Soft delete**: cloud deletes are revisioned tombstones rather than destructive row removal.
10. **Account isolation**: a browser profile is bound to the first verified private account. If a different private account later signs in, sync pauses instead of uploading the existing local library to the new account.
11. **No insecure identity fallback**: the Shared Library Justin/Paul selector is never accepted as private-account authentication.
12. **Server timestamps**: cloud ordering uses Worker/D1 timestamps instead of trusting device clocks.
13. **Validation and size guards**: invalid coordinates, malformed track structures and oversized track payloads are rejected before storage.
14. **Shared Library separation**: private sync does not publish, unpublish or alter Shared Library records.

## Device Check gate

Before enabling private cloud writes on a device, Device Check should show passes for:

- Secure HTTPS connection
- Local browser storage
- IndexedDB working storage
- Cloudflare app connection
- First-party cookies
- Private local workspace
- Private cloud storage
- Private account authentication

The following can remain optional depending on use case: persistent-storage guarantee, WebGL/3D, geolocation and service-worker support. A persistent-storage failure is not fatal because the cloud remains the durable copy once sync is active.

## Required Cloudflare provisioning

### D1

Create a dedicated D1 database named `mancardo-private-library` and apply:

`migrations/0001_private_library.sql`

Bind it to the Worker as:

`PRIVATE_LIBRARY_DB`

Do not reuse Shared Library data tables for private My Library content.

### Authentication

Protect `/api/private-library/*` with Cloudflare Access. For the initial release, Cloudflare Access One-Time PIN by email is sufficient and avoids storing passwords in ManCardo.

Set Worker variables:

- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`

The Worker verifies the Access JWT signature, issuer, audience and expiry before any private track read/write.

## Cross-device acceptance test

Use two browsers/devices signed into the same private account.

1. Device A: import a GPX into My Library. Confirm local save, then `☁ Synced`.
2. Device B: open ManCardo and Sync. Confirm imported track appears.
3. Device B: rename, recolour and edit geometry. Sync.
4. Device A: return to ManCardo. Confirm newer revision arrives.
5. Offline Device A: edit a track with networking disabled. Confirm status says Offline/Sync pending and local editing remains intact. Restore networking and confirm queued upload completes.
6. Conflict test: take both devices offline, edit the same track differently on each, reconnect B then A. Confirm one canonical cloud track and one local Draft conflict copy; neither geometry version may be discarded.
7. Delete conflict test: Device A queues delete while offline; Device B edits and syncs the same track; reconnect A. Confirm delete is cancelled and newer cloud copy is restored.
8. Fresh-device test: use a browser with empty local storage, sign in and Sync. Confirm the cloud library is rebuilt locally.
9. Account isolation test: sign in as a different private account in the same browser profile. Confirm sync pauses and no tracks are uploaded.
10. Shared separation test: confirm none of the above actions changes Shared Library until Share is explicitly used.

## Production release gate

Do not enable production private cloud writes until:

- D1 migration is applied successfully.
- D1 binding health passes.
- Cloudflare Access authentication passes.
- Device Check passes the private-sync checks on at least one desktop and one mobile device.
- The cross-device acceptance test above is completed.
- Production backup/export procedure for D1 has been documented.
