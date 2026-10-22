# Editor recovery Development candidate

This proposal is based on Production source 3a0d5849364e1709be6b8fd70ae82575d723e29e.
Map performance and shared-owner/filter changes are separate. No database migration
or restore is required. Production deployment is not authorized by this proposal.

Completed geometry transactions retain the complete serializable editor payload in
account-scoped local recovery records. Recovery is explicit: My Library → Recovery
copies → recover as a new unsaved copy, download GPX, keep, or discard. Recovery
never uploads automatically or overwrites the saved original. A recovered copy has
an independent ID and no active Shared linkage. Cloud Save remains explicit.

Limits: wait for “Recovery saved on this device.” Closing before asynchronous capture
completes can lose the latest edit. Browser storage is not an external backup.
Navigation guards compare geometry/point properties; metadata-only edits and text
not submitted from a dialog do not independently trigger capture or navigation guards.
The model payload captured at a geometry transaction includes its existing metadata.
GPX download retains the existing export/import limitations; it is not a full JSON backup.

Records have a 1 MiB individual/2 MiB combined UTF-16 serialized budget and a maximum
of 10 records across the browser profile. Nothing is evicted automatically. Copies
older than seven days are download/discard-only. Storage errors retain the previous
copy, display failure and recommend Save/GPX. Web Locks serialize admission across
tabs. Verified account ownership is required; offline reload before authentication
cannot recover. Pending deletes and permanent deletion fences prevent recovery of
known deleted IDs. Fence storage failure disables recovery and reports delete pending.

## Reproducible gates

- `npm ci` uses existing locked dependencies; Node22/ubuntu-24.04 in CI.
- `node scripts/check-production.cjs source`
- `node scripts/check-production.cjs packaged-server`
- `npx --no-install playwright install --with-deps chromium`
- `node scripts/check-production.cjs browser` includes all 19 recovery, 21 navigation/
  preservation and 83 existing browser tests using synthetic, intercepted fixtures.

Prior local recovery qualification: 378 source and 123 browser tests passed. The
Development packaging addition has 5 new source checks; final CI must qualify the
exact published commit, not merely reuse those earlier results.

Runtime manifest SHA256:
`b7ea49dfd9ac512946578c49a61591a8597ae6e69f3503881869415e77d3ea05`.
Development package manifest SHA256:
`28ad9328e5c2fa06880b4495b86f6b6b98c511058525699cce5e9b917085a7e1`.

The existing cloudflare-dev workflow has a manual-only recovery route on
`proposal/editor-integrity-20261022`. Dispatch inputs are `source_sha`,
`manifest_sha256` (runtime), and `development_manifest_sha256` (package).
It checks out the immutable event SHA and rejects input mismatch. Qualification has
no environment secrets. After all gates it builds the Development package from the
verified runtime; the deployment job downloads exactly that artifact without rebuilding.

The deploy job uses the existing development environment and existing credentials.
Before deployment it checks the existing Worker name, isolated D1 UUID/name/binding,
ASSETS binding and unchanged Access variables read-only. It rejects Production D1.
Only the verified Development placeholder is materialized. Locked Wrangler deploys
explicitly to mancardo-dev-test. `--keep-vars` preserves existing remote variables;
obsolete qualification variables are not removed, but the qualification module/routes
are excluded. Only assets/index.html is public; source modules are Worker modules,
and tests, documentation and harnesses are excluded from asset packaging.
No security permissions, credentials, environment policies or Production workflow
changes are part of this proposal. Push alone cannot select the recovery deploy job.

After a deployment error/uncertain result, inspect the actual current version before
retrying. Do not infer that an error means no deployment occurred. Final live evidence
must identify the deployed version and use only an authorized synthetic test account
and new disposable tracks. Local tests do not substitute for live account/auth checks.

Bounded acceptance: create a disposable track, complete geometry edits, wait for
recovery-saved status, refresh, explicitly recover as new unsaved copy, compare its
ordered points/export, verify explicit Save/reload, selection versus Show, then delete
only disposable records and confirm after a wait/refresh. Never select/edit real tracks.
Do not add an authentication bypass if the existing test identity is unavailable.
