# Isolated ownership and full-editor safety qualification

This change adds tests only. It does not alter the runtime, `wrangler.dev.toml`,
the manual Development deployment pin, Production configuration, permissions,
migrations, or live records. The currently deployed runtime remains
`3d7a43b23b6ddc12a96074425c0e87c2c4c76685`.

## Actual server ownership tests

`tests/server-owner-isolation.test.cjs` enters the final
`worker-delete-durable-fix.fetch` wrapper and its actual module chain. The helper
adapts only the D1 transport shape to a fresh in-memory SQLite database and the
JWKS network response to locally generated, process-only RSA test keys. It runs
the repository's real migration, SQL predicates, constraints and history
triggers. Authentication and owner resolution are not mocked.

Eight substantive scenarios (nine Node test results including their parent)
cover both-owner positive controls, exact GET and paginated list isolation,
colliding-ID creation/update/deletion, owner-specific conflict metadata and
history, stale revision rejection, the same-request DELETE account-header
guard, and ten invalid-token variants. An unexpected network request fails
rather than falling through to the network. No live identity or secret is used.

SQLite tests establish behavior of the actual queries and handlers, not
Cloudflare Access edge policy, D1 replication, or production deployment safety.
They require `node:sqlite`, available without an extra flag in Node 22.13+ and
Node 24. The existing CI Node 22 job runs the suite; local validation used
Node 24.19.0 without installing dependencies.

## Full emitted-editor browser cases

Two additions in `tests/delete-cross-client.test.cjs` run the actual generated
editor and cloud/deletion code with real Chromium DOM, WebCrypto, localStorage
and IndexedDB:

1. Authorize a deletion offline at revision 1, edit and upload revision 2 through
   the other client's real rename/sync handlers, reload the deleting client,
   then reconnect. Require one revision-1 DELETE attempt, cancellation of its
   persisted intent, preservation/restoration of the exact revision-2 content,
   no stale PUT and no invented recovery copy, including another reload.
2. Switch the fixture's authenticated identity while a deletion is pending in
   the same browser profile. Require the real account binding to pause, keep
   the original account/revision intent and IndexedDB binding, make no library
   pulls or writes as the other account, and preserve a colliding-ID record in
   that account. Returning to the original identity may resume only its
   originally authorized deletion.

The synthetic API model now partitions rows by account and explicitly aborts
API requests while the new offline control is active. It still serves the fixed
app shell to permit an offline reload; this is not a claim of service-worker or
offline asset-cache support. Authentication responses and API storage are
fixtures, not live Access/D1. Map/CDN rendering remains stubbed. Programmatic DOM
controls do not qualify physical control actionability. These cases use the
actual online/retry/startup timers and durable workspace rather than replacing
the app's internal state or repeatedly retrying a sync until it passes.

## Commands and evidence boundary

```sh
node --test tests/release-safety.test.cjs tests/generated-html.test.cjs tests/delete-client.test.cjs tests/deployment-guard.test.cjs tests/delete-cross-client-node.test.cjs tests/remote-tombstone-review.test.cjs tests/server-owner-isolation.test.cjs
node --test tests/delete-behavior.test.cjs tests/delete-cross-client.test.cjs
```

The expanded source command passed 79/79 locally. The browser command has
22 cases including the two additions; exact-commit nondeploying CI and
independent review are required before crediting their execution. Local
Chromium remained unavailable under the established sandbox restriction, which
was not bypassed or retried for this change.

The earlier bounded live deletion and paired read-isolation observations remain
separate evidence. These automated additions do not by themselves qualify live
cross-account writes, same-profile account switches, offline/concurrent edits,
status/recovery UX, or full release readiness. No merge or deployment is implied.
