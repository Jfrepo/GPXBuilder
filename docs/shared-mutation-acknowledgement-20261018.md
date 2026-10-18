# Shared Library mutation acknowledgement correction

Status: isolated local proposal based on the exact published bytes of
`e2684562f2385cdf43649087d2093cf8b2a3efd1`. No publication, deployment, schema
migration, credential/settings change, live test, or cleanup is authorized by
this document. No deployment workflow or pin is changed by this proposal.

## Proven defect

The Shared handler used `meta.changes === 1` to acknowledge publish and DELETE.
An actual-Worker test with signed synthetic identities, the committed schema,
and real SQLite reproduces two distinct committed-but-misreported outcomes:

- Publish changes one track and inserts its immutable history row: direct count
  1, trigger-inclusive total count 2. Version 2 and the exact GPX are committed,
  but the API reports a false 409 revision conflict.
- DELETE removes one track and its version history through the existing foreign
  key cascade: direct count 1, total count 2 (or higher with more history).
  Physical deletion succeeds, but the API reports `deleted:false` and
  `alreadyDeleted:true`.

The existing SQLite adapter correctly measures `total_changes()`; this patch
neither weakens it nor replaces the actual SQL/authorization behavior with a
mock. No live D1 metadata or production state was inspected for this proposal.

## Narrow correction

Only `worker-shared-library-cloud.js` changes runtime behavior:

1. Append atomic `RETURNING` to the existing publish UPDATE and DELETE, execute
   via D1 `.all()`, and validate `success:true`, an array containing zero or one
   row, and every expected field using exact equality.
2. Publish requires the requested track ID, next version, exact GPX, timestamp,
   authenticated display label, and live deletion state. DELETE returns and
   requires the exact track ID. DELETE has no supplied version/owner predicate;
   adding one or adding a pre-read would change its existing contract.
3. A valid empty returned-row array remains a genuine zero-match outcome:
   publish returns the existing 409 conflict and DELETE returns the existing
   idempotent already-deleted response. Aggregate metadata never establishes
   success and cannot override valid atomic rows, even if missing or misleading.
4. Missing, failed, multiple, or wrong acknowledgement rows fail closed without
   retry. The publish and DELETE route returns now use `await`, so asynchronous
   failures reach the existing JSON `500 shared_error` boundary. Previously,
   rejected promises escaped that local catch. This is an explicit error-path
   compatibility correction; ordinary success/conflict response shapes remain
   unchanged. No new API fields or error codes are introduced.

A failure is not evidence of rollback. Tests distinguish a transport exception
before execution (unchanged state) from an exception or malformed response after
commit (changed state, no success acknowledgement). A later exact read may
establish current state; it must not be substituted for the atomic mutation
acknowledgement or treated as proof that this caller won a race.

## Preserved semantics

- Authentication and the current collaborative Shared access model are
  unchanged. Shared records do not acquire private-library ownership semantics.
- Publish still requires the exact track ID, base version, and `deleted=0` in
  its atomic UPDATE. DELETE still targets only its supplied track ID.
- History triggers, schema, physical deletion/cascades, timestamps, identity
  display labels, and request size/validation rules are unchanged.
- Renaming through publish still forks a track before the normal version check.
  The outer missing-track stale-link recovery still creates a replacement track
  (201); the acknowledgement fix must not silently remove that existing behavior.
- No client UI, retry policy, private-library handler, waypoint handler, or
  deployment configuration is changed.

## Local qualification

- Existing source suites on the published baseline: 244/244 pass.
- New suite on the same untouched baseline: 2/38 pass, 36 fail, demonstrating
  the acknowledgement and error-boundary defects rather than a permissive test.
- New suite on the candidate: 38/38 pass.
- Full source command on the candidate: 282/282 pass, with zero skipped or
  cancelled tests. This is one actual aggregate execution, not summed results.
- Independent strict Shared regression: baseline 0/2, candidate 2/2. The same
  assertions verify exact GPX/history/cascade state and stale-update immutability.
- Syntax checks pass for the changed Worker and new test file.
- Existing Chromium suites were attempted but blocked before browser execution:
  Chromium's process-singleton socket failed with `Operation not permitted`
  and crashpad initialization failed. The runner reports 43 failed top-level
  nodes from launch hooks; these are not 43 tested application regressions.
  No browser acceptance pass or live deployment pass is claimed.

Coverage includes trigger-inclusive counts 2 and 4; successful exact content;
missing/misleading metadata; true zero rows; stale and concurrent updates;
concurrent deletes; deletion between read and CAS; later writes after RETURNING;
authentication failure; preserved Shared collaborator/fork/recovery behavior;
before-execution and after-commit transport errors; malformed envelopes; and
mismatched identity/version/content/timestamp/label/deletion fields. No mutation
is replayed by the acknowledgement code.

Run the no-deploy workflow's source-test command, now including
`tests/shared-mutation-ack.test.cjs`, to repeat the aggregate qualification.
The tests run with Node's built-in SQLite and perform no live application
requests. Node 24.19.0 was used locally; the repository workflow currently uses
Node 22. Exact-head hosted CI and isolated-browser qualification remain required.

## Four-file proposal and later release gates

The proposed files are the Shared handler, its new acknowledgement test, this
document, and one test-path addition to the existing no-deploy qualification
workflow. Workflow triggers, permissions, environments, and deployment steps
are unchanged.

Before any future guarded Development pin, separately review and attest the
exact bytes of this shared dependency in addition to the existing entrypoint,
wrapper/helper, private-handler, and configuration attestations. Attesting only
the outer entrypoint does not independently check its imported Shared
implementation; an immutable commit pin still fixes the full checkout:

- Baseline Shared handler SHA-256:
  `c797cedb504c174caee4d065b8a08e3492ae01fd2759f4fd27402fbdc5fe264e`
- Candidate Shared handler SHA-256:
  `8239c8d8b9bff0298c7195747c1fc4aaedf8a60996ab8ac7023c971e4d6ee449`

The current Development guard and pinned deployment are deliberately unchanged.
Any later combination with another proposal needs its own source-tree integrity
check and actual full-suite run; these local counts do not qualify a combined
or deployed build. The old local Git HEAD/index were not used as a baseline.

The transport contract still matters: a malicious/corrupt binding that fabricates
an otherwise valid empty array or exact row cannot be distinguished from an
honest database acknowledgement by this handler. Tests detect malformed or
mismatched results, not arbitrary Byzantine fabrication. SQLite RETURNING
returns directly affected rows, not trigger-generated history rows; the current
history triggers do not rewrite the fields validated here. A future trigger
that changes them would need separate review. Local SQLite does not establish
Cloudflare D1 transport/runtime compatibility or real multi-region timing.
