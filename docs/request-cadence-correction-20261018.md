# Proposed Development request-cadence correction

## Current status and scope

Development currently runs reviewed runtime `91af34b8532609bbc5735aa9fd5718b7a23c50a2`,
deployed by the user-started [run 39084061011](https://github.com/Jfrepo/GPXBuilder/actions/runs/39084061011),
Worker version `bc2a6e2b-6c5d-492b-8dea-a44c15ba6c54`. This later request-cadence
correction is proposed only. The guarded manual workflow still pins 91af34b;
its source/config checks reject the changed runtime. No deployment, migration,
permission change, existing-track mutation, or Production change is included.
Do not rerun the old manual workflow expecting this correction.

The earlier account-boundary/deletion documents describe historical preparation
milestones. Current live evidence includes a bounded note round trip/deletion,
newer-edit preservation after a stale offline deletion, and one exact-record
read-isolation check from a separate secondary profile. These do not establish
live write isolation, same-workspace account switching, or general release safety.

## Reproduced mechanisms, not inferred live attribution

The exact deployed emitted scripts reproduce three independent mechanisms with
synthetic DOM/network/timer adapters:

1. Shared-note decoration fetches the complete shared list and replaces note
   text. Its document-wide child-list observer sees its own writes and the
   existing periodic Save/status text writers. There is no acquisition lock.
2. A settled failed durable DELETE dispatches a synthetic `online` event. Its
   own online listener retries after 100 ms, while the private client also
   schedules another synchronization. This requires an unconfirmed intent;
   a confirmed watermark alone cannot enter that failure loop.
3. The private `syncing` flag covers uploads, not the entire health/pull/merge
   cycle. Concurrent wakes can therefore start overlapping list reads.

These controlled reproductions explain possible amplification, not the exact
live request counts or every Network-panel initiator. The observed high pending
request volume remains a library-sync stability issue, not a proven map defect.
A never-settling fetch is distinct from a settled failure and must stay bounded.

## Narrow correction

Only the final Development wrapper imports `worker-request-cadence.js`:

- Render each shared note from its exact canonical row using a DOM attribute and
  literal text. Duplicate names cannot borrow another row's note. Decoration
  performs no fetch and does not rewrite unchanged text. Observe only the two
  library containers, with one coalesced decoration timer.
- Keep boot, shared-tab, explicit Refresh and successful-write invalidation on
  the canonical shared loader. One request may run at a time; invalidations
  arriving after its snapshot coalesce into one later fresh read.
- Reconcile only successful deletion or cancellation, using a dedicated event,
  never a fabricated network-online event. Failures retain the original owner,
  target, authorization and base revision for the existing 15-second retry.
- Join complete private sync cycles, including health, uploads, pull and merge.
  Standalone autosave/rename uploads wait behind that cycle. Late queued edits
  drain after the previous upload snapshot, without requiring an unrelated wake.
- Coalesce one post-delete reconciliation after an active cycle, including a
  ready cycle that ends with unrelated pending uploads. Account/storage pauses
  fail closed. Failed pre-upload scans report a handled pending state, preserve
  local/queued data, release locks and permit a later explicit retry.
- Count required emitted-code anchors and refuse missing/ambiguous transforms.

There is no new fetch timeout, broad queue rewrite, or change to server ownership
predicates. An indefinitely unresolved request remains one in-flight request;
its timeout/recovery UX is not claimed fixed. The existing Sync-now capture shim
and optimistic intermediate status remain separate qualification limitations.
A future separately approved deployment pin must attest the new helper bytes as
well as the importing wrapper and configuration.

## Executable qualification

Independent local review and the complete source command passed **147/147**,
zero skips: 93 existing checks, 41 new emitted-behavior cases and 13 transform
anchor checks. The exact deployed emitted baseline passed 13 of those 41
behavior cases and failed 28. The 13 transform checks qualify the new helper
separately; they are not historical-runtime behavior evidence.

The exact emitted-client suite retains baseline failures and includes shared
note rendering/clearing/markup, post-publish freshness, failed and unresolved
responses, owner/revision-pinned delete retries, cancellation during old pulls,
whole-cycle joining, late edits and queue/hash failure recovery. Existing
ownership, unsynced-edit, tombstone, note and stale-delete tests remain enabled.
Older overlap fixtures now assert the deliberate joined-promise contract instead
of awaiting a competing sync before releasing their own held request.

The new full-page Chromium suite has 15 cases and retains real DOM observers,
Save/status timers, localStorage, IndexedDB and WebCrypto. Only synthetic API/CDN
responses and Leaflet rendering are substituted. It invokes installed handlers;
it does not qualify real map behavior, trusted-click actionability, live Access/D1,
or the separate capture-phase reload shim. Browser execution is pending exact
published-commit CI; the local socket restriction was not bypassed.

```sh
node --test tests/release-safety.test.cjs tests/generated-html.test.cjs tests/delete-client.test.cjs tests/deployment-guard.test.cjs tests/delete-cross-client-node.test.cjs tests/remote-tombstone-review.test.cjs tests/server-owner-isolation.test.cjs tests/note-account-boundary.test.cjs tests/request-volume-client.test.cjs
node --test tests/delete-behavior.test.cjs tests/delete-cross-client.test.cjs tests/request-volume-browser.test.cjs
```

## Publication and remaining gate

The only workflow edit extends the existing no-deploy PR test commands. Its
permissions remain `contents: read`; it has no deployment credentials or live
bindings. Existing deployment push triggers do not include this feature branch.
The manual Development route, Production workflow and Wrangler configurations
are unchanged. Nondeploying exact-head Chromium CI is the next gate, followed
only with separate authorization by reviewed Development pin preparation and
bounded live request-volume/note/deletion verification. No merge or release
approval is implied by green isolated tests.
