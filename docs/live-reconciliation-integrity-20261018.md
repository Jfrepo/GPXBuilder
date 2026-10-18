# Proposed live-row reconciliation integrity correction

## Status and scope

This is a local-only proposal based on published `e2684562f2385cdf43649087d2093cf8b2a3efd1`. It has not been uploaded, deployed or merged. Development remains on the older immutable `fe10024e` deployment; the existing manual workflow and its pin are unchanged. Production configuration and deployment are unchanged.

The proposal changes six files: the Development wrapper, three regression files, this scope document, and the nondeploying CI command that includes the new source suite. It does not change the shared server acknowledgement correction, database schema, authentication configuration, request-cadence helper, deployment workflows or Wrangler configurations.

## Reproduced defects

1. Ordinary live pulls hashed an earlier local object, then used that obsolete result after an asynchronous wait. A newly persisted mutable or replacement-object note could be overwritten without a recovery copy. A separate unsaved editor clone could also be cleared.
2. A conflicting upload's authoritative GET could likewise outlive an editor-only change. The newer editor content was discarded even though the older library content was copied.

These are executable preservation failures in the exact emitted client. An independent bridge to the actual signed Worker and SQLite handler also reproduces the ordinary-pull loss, so it is not explained solely by the modeled API fixture. No new live-service loss has been observed or asserted during this audit.

## Proposed behavior

- Capture the verified owner and validate the live row's identity/revision.
- Hash and inspect library, editor and sync metadata, then recheck every snapshot after the final awaited read.
- Reconsider changing input at most three times. Defer rather than discard a differing unsaved editor.
- Preserve exact latest note and geometry in a fresh-ID recovery copy before applying a genuinely newer cloud row.
- Route non-same-hash live upload conflicts through the same guard. Retain the original owner-bound queue when reconciliation is deferred; remove only its captured-owner key after a completed apply.
- Keep the existing verified same-hash acknowledgement and tombstone paths.
- Report targeted deferred live reconciliation as Sync pending / false, not a completed cycle. Defer does not mean the cloud row was applied.
- Fail closed if an HTML transform boundary is missing or duplicated.

The editor is a separate clone. A note UI event can update the library timestamp without updating that clone's timestamp. The proposed comparison deliberately does not ignore arbitrary timestamp differences. A selected-editor browser regression therefore requires safe deferral, then an explicit normal row reselect after proving the note is already persisted, before recovery can complete. It is not an automatic-merge claim or an instruction to discard genuinely unsaved editor work.

## Qualification evidence

- Local aggregate: **263 source checks pass**, zero failure, cancellation or skip. This includes 14 exact-emitted helper/anchor checks and five new full-client preservation cases.
- Frozen published-wrapper comparison: **17 pass / 5 fail** in the 22-case complete-client suite. The five new preservation/status cases fail on the old implementation; this is not five unrelated production incidents.
- Independent strict ordinary-pull and conflict-GET preservation controls pass on the proposed wrapper. Separate real-handler integration controls are audit evidence, not additions to the repository CI count.
- Two new full-page Chromium definitions retain actual DOM note input, real IndexedDB/WebCrypto, exact owner/base revision and request assertions, and online reload/no-duplicate checks. **They have not been executed locally.** A future approved exact-head CI run would execute 64 browser nodes, including the 62 existing nodes.
- Browser API boundaries differ: existing editor/traffic fixtures model the API; ownership scenarios normally use the actual signed Worker/SQLite handler with explicit fault overrides. None are live D1 tests.

## Remaining gates and restrictions

Independent review, a targeted public-content audit, and explicit public-upload approval are required before publication. Exact-head nondeploying CI must execute every browser case before claiming browser qualification. No deployment is implied by source publication.

Any later Development deployment requires separately approved immutable preparation and new user-started dispatch, with the changed wrapper and shared core handler both attested alongside existing dependency/configuration guards. Existing stopped live ownership baselines must not be recreated or mutated without the appropriate specific approval.

IndexedDB request-versus-transaction completion, multi-tab coordination, live account switching/write isolation, map/device acceptance, hung-request recovery and wider status behavior remain distinct boundaries. This narrow correction is not whole-release or Production approval.
