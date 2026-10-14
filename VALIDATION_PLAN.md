# Shared note validation plan

This branch deliberately removes the active Shared-note request-wrapping chain from the Worker entrypoint. Normal Shared Library POST requests are handled by the existing resource-optimized/shared-library path without Request reconstruction.

Validation targets before production merge:

1. My Library track without a note can publish to Shared Library.
2. My Library track with a note can publish to Shared Library.
3. The note is embedded by the canonical `buildGpx(item)` path as `<mancardoNote>` and is returned on `GET /api/tracks` by reading the stored Shared GPX.
4. Editing the note of an already-shared track republishes that track using its existing `sharedId` and optimistic `sharedBaseVersion`, with one conflict retry.
5. Private note replication still uses the private track API and does not modify Shared publish requests.
6. No D1 schema changes.
