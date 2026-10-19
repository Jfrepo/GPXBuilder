# Proposed recovery-copy note preservation

## Current boundary

Development currently runs immutable runtime
`fde3864c5fb621b5c8c9a3ef28ad596b6202a3f6`, deployed by the user-started
[run 39106312887](https://github.com/Jfrepo/GPXBuilder/actions/runs/39106312887)
as Worker version `a9e7dba3-43ea-43a1-9bda-e8c601778ea3`.
That deployed runtime passed its prior isolated 147 source and 40 Chromium
checks, and bounded live note/deletion and visible request-volume checks.
Those checks did **not** establish preservation of a genuinely unsynced note
when another client deletes or changes the same record.

This later correction is local/proposed only. The manual deployment workflow
still pins fde3864c and rejects the changed wrapper. No workflow/configuration,
request-cadence helper, D1 schema, ownership predicate, permission, Production
entrypoint, live track or authentication state is changed by this patch.
Do not rerun the existing manual workflow expecting this correction.

## Reproduced data-loss defect

Two independent exact-emitted-client tests first persisted a substantive
offline note through the real queue scan, proving its owner, base revision,
content and hash in the outbox. After reconciliation, both the local and
uploaded fresh-ID recovery copy replaced that text with a generic message:

- Remote tombstone: `Recovery snapshot before cloud delete`.
- Newer live revision: `Recovered from cross-device conflict`.

Both strict note-preservation tests failed on the deployed source. A later
run of the complete 17-case emitted-client suite against the frozen deployed
wrapper passed its 13 existing cases and failed all four new note cases, with
zero skips or cancellations. Geometry
and the authoritative remote tombstone/newer record remained intact. This is
a synthetic local reproduction, not evidence that a user's live note was lost.
The previously passing rename cases did not cover note preservation.

A further held-GET regression reproduced a related stale-reference window:
an immutable local note replacement arriving during the authoritative conflict
GET could be replaced by a recovery copy of the earlier captured object.

## Narrow correction

- Keep the cloned note exactly as stored. Do not trim, truncate, coerce, append
  a diagnostic, or add a replacement note when the source has no note.
- Put the latest recovery reason in the existing session-local “Conflicts kept”
  element's title instead. The existing conflict-copy name, draft flag and
  count still identify recovery. The reason is not persisted in track payloads,
  so it cannot overwrite an existing user metadata field; it resets on reload.
- Immediately after the authoritative live-conflict GET and existing owner
  checks, reread the current library item before making the recovery copy.
  This adds no new asynchronous window or permission/revision policy.
- Require exactly one note-assignment transform anchor. Missing or ambiguous
  source refuses transformation rather than silently emitting the lossy path.

Existing fresh-ID generation, conflict-copy naming, geometry, timestamp and
shared-link handling are retained. Existing account pause, stale tombstone,
pending-delete and lost-acknowledgement protections remain under regression.
This is not a general redesign of merge policy or editor recovery UX.

## Qualification and next gate

The complete source command passed **159/159** locally, zero failures,
cancellations or skips: 149 existing checks plus four full-client regressions,
five delivered-function/transform checks and one unchanged-pin rejection.
The local engine was Node 24.19.0; the exact-head workflow will independently
run the repository's configured Node 22 environment.

The exact emitted-client regressions cover both remote states, exact local and
uploaded text, unchanged authoritative original, one recovery copy, expected
write count/base revisions, reload/rehydration and note edits during awaited
tombstone hashing or a live-conflict GET. Delivered-function cases separately
cover note representations, unrelated metadata and fail-closed anchors.

Two additional full-editor Chromium cases use real DOM note handlers,
IndexedDB, localStorage and WebCrypto in separate contexts. They preserve
Unicode, whitespace and line breaks through an actual committed offline
outbox, a fixture-served offline reload, conflict resolution, upload and online
reload. The network and map are synthetic; fixture app-shell availability is
not proof of live offline caching. These new browser bodies have not yet run:
the local browser launch was blocked before tests by the execution environment's
process-singleton socket restriction. No workaround was attempted.
The complete browser gate contains **42 cases** (40 existing plus these two);
registration and syntax checks are not execution evidence.

Run the unchanged no-deploy source command:

```sh
node --test tests/release-safety.test.cjs tests/generated-html.test.cjs tests/delete-client.test.cjs tests/deployment-guard.test.cjs tests/delete-cross-client-node.test.cjs tests/remote-tombstone-review.test.cjs tests/server-owner-isolation.test.cjs tests/note-account-boundary.test.cjs tests/request-volume-client.test.cjs
```

Then execute all existing and new isolated browser cases in exact-head CI:

```sh
node --test tests/delete-behavior.test.cjs tests/delete-cross-client.test.cjs tests/request-volume-browser.test.cjs
```

After independent review and explicit public-upload approval, the next step
is publication to the existing draft PR and its nondeploying CI, not a live
destructive test. Any
later Development pin/deployment requires separate approval and fresh-client
verification. Live unsynced-note recovery remains unqualified until that fixed
runtime is deployed and a bounded disposable-track protocol is completed.
Live cross-account writes and same-workspace account switching remain separate,
unverified gates; separate-profile read checks do not substitute for them.
