# Private-library mutation acknowledgement correction

Status: local proposed correction only. No publication, deployment, database
migration, permission change, live retry, or cleanup is authorized by this file.
The manual Development workflow remains pinned to the previously reviewed
`fe10024e79143d47fbaf86a3864f69db60fa7200` runtime.

## Finding

A bounded Development test received a revision-conflict response after creating
its exact disposable record. A subsequent read showed the expected live
revision and unchanged invented payload. Testing stopped instead of repeating
the create or continuing foreign-write probes.

The deployed private-library handler accepts a successful create, update, or
tombstone only when `meta.changes === 1`. Its schema also writes an immutable
history row through an AFTER trigger. Cloudflare defines this metadata using
SQLite's trigger-inclusive total-change counter. A mutation of one track and
one history row can therefore produce two changes and a false conflict.

An isolated reproduction executes the unchanged handler, signed synthetic
identities, actual schema, and real SQLite triggers. With trigger-inclusive
metadata, create/update/delete each commit exactly one track change and one
history row but return 409. Duplicate, stale, foreign, and repeated-delete
zero-match controls still change nothing. This reproduces the mechanism;
the live internal D1 metadata was not directly captured.

The prior test adapter reported direct statement changes, excluding the
trigger. Earlier passing isolated tests did not qualify this D1 metadata
boundary. Their owner-predicate and content assertions are retained, not
weakened to accept the unexpected response.

## Proposed correction

- Keep all owner, track-ID, base-revision, and live/tombstone SQL predicates.
- Add `RETURNING` to each existing single-statement mutation. Only the affected
  track row is returned, not the history trigger's additional writes.
- Validate the D1 success/result envelope, at most one row, and exact expected
  owner, ID, revision, deletion state, timestamp, and PUT content hash.
- An empty affected-row result retains the existing conflict response. Wrong,
  multiple, missing, or malformed acknowledgements fail closed. No mutation is
  automatically retried and no aggregate count is treated as success proof.
- Model real trigger-inclusive D1 counts in the shared SQLite fixture. Expose
  only synthetic statement audits for direct/total changes and returned rows.

No history trigger, schema, authentication rule, account header, delete intent,
editor logic, or recovery behavior is relaxed. No record is deleted by these
tests outside disposable in-memory databases.

## Qualification and remaining gates

Local executable checks: **244/244 pass**, including **26** new mutation-result
regression nodes, with zero failures, cancellations, or skips. Independent
review reran the same full source command. The tests cover exact history/content,
zero-match stale/foreign/repeated operations, competing same-revision writes,
a later writer after an earlier atomic acknowledgement, and malformed or lost
responses without automatic mutation replay.

Existing full-browser harness tests use this same actual handler and SQLite
adapter, so their next execution will exercise the corrected metadata boundary.
The **62** existing Chromium nodes have not been rerun on this candidate locally;
new exact-head CI is still required. No new browser or live pass is claimed.

This proposed patch changes five files: this document, the shared private
handler, the SQLite fixture helper, a new mutation-acknowledgement test, and
one test-path addition to the no-deploy qualification workflow. Its triggers,
permissions, and deployment workflow remain unchanged. The handler is a shared
dependency; retaining Production configuration is not a claim that its code
could never affect Production if separately deployed there.

After independent review and explicit public-upload approval, the next step
would be nondeploying CI. Any later Development pin/deployment preparation
requires separate approval and must attest the changed private-handler bytes
as well as the existing entrypoint/wrapper/helper/configuration. Never rerun
the old pin expecting this correction. Preserve existing disposable baselines
and the stopped live-test state until the corrected build and protocol are
reviewed. Same-workspace account switching remains unqualified.

## Primary references

- [Cloudflare D1 result metadata](https://developers.cloudflare.com/api/resources/d1/)
- [SQLite total changes, including trigger programs](https://sqlite.org/c3ref/total_changes.html)
- [SQLite RETURNING and directly affected rows](https://www.sqlite.org/lang_returning.html)
- [Cloudflare D1 prepared-statement methods](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
