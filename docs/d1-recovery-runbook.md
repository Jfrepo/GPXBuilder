# Mancardo D1 recovery runbook (development review)

**Status:** procedure prepared, production backup/restore NOT verified. **Do not execute restoration against production.**

## Findings
- Production database: `mancardo-private-library` (binding `PRIVATE_LIBRARY_DB`).
- The private API currently stores latest track payload in `private_library_tracks.payload_json`, with `revision`, `content_sha256`, `deleted`, `updated_at`, and `owner_id`.
- `revision` is a concurrency counter, **not** an archived copy of every revision. Earlier track payloads cannot be recovered from that counter alone.
- Do not assume `private_library_revisions` exists; inspect schema first.
- Cloudflare D1 Time Travel / backup retention must be checked in the dashboard; do not assume historical restore points exist.

## Read-only inventory (Cloudflare D1 Console; production)
```sql
SELECT name,sql FROM sqlite_master WHERE type='table' AND name LIKE 'private_library%' ORDER BY name;
SELECT COUNT(*) AS total, SUM(CASE WHEN deleted=0 THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN deleted=1 THEN 1 ELSE 0 END) AS tombstones FROM private_library_tracks;
SELECT owner_id, COUNT(*) AS total, SUM(CASE WHEN deleted=0 THEN 1 ELSE 0 END) AS active FROM private_library_tracks GROUP BY owner_id;
```
Treat owner IDs and track payloads as private data. Never paste complete user payloads or credentials into tickets.

## Verify backup
1. In Cloudflare D1, inspect the production database's available backup/Time Travel points, retention, and most recent recoverable timestamp.
2. Record a backup reference and take a protected export/snapshot using an authorized Cloudflare account; store outside public GitHub.
3. Create a **new disposable D1 recovery database**; never use the production or development D1 as restore target.
4. Restore the selected backup into the recovery database following Cloudflare's currently supported D1 recovery procedure.
5. Run the read-only inventory SQL on source and recovery target. Compare counts, owner partitions, and representative content hashes at the snapshot timestamp. Differences after snapshot time may be expected.
6. Test a single-track extraction from recovery DB without writing to production; export the JSON/GPX securely and manually verify geometry/name/colour.
7. Record backup timestamp, restore outcome, data completeness and recovery duration. Delete the disposable recovery database only after approval.

## Individual-track recovery
Look up by authenticated owner and track ID or known name; inspect `deleted`, `revision`, `updated_at`, and hash. Check the original browser's local copy and GPX exports before any restoration. Prefer extracting one payload from the isolated recovery database, then import as a **new** track through the user's account; do not overwrite existing IDs or bulk-restore production.

## Release blockers
- Confirm an actual recoverable production backup and isolated restore.
- Add immutable per-track history/snapshots for future versions (current revision counter alone is insufficient).
- Verify safe user-initiated delete workflow and test concurrent edits and interrupted saves.
- Obtain explicit production release approval.
