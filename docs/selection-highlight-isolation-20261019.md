# Render-only track identification proposal

## Status and scope

This is a local-only correction prepared from public branch commit c9ce269263d2927f24c770528108699e22e876ac. It has not been published or deployed. The live Development runtime remains ecc776998a6ae1cbca92b92714e42a74cff6c9f1. No live records, access settings, credentials, database schema, deployment workflow, configuration or immutable deployment pin are changed.

The changed runtime module is shared by the Development and Production import chains. This is not a Development-wrapper-only source change; no Production deployment or readiness claim follows from local validation.

## Reproduced problem

The existing row/name identification flash temporarily changes `visible` on both the library track and selected editor object. A normal cloud scan during that 750 ms interval can upload the temporary value, even though the user never changed Show. Saving an unrelated track can likewise serialize that temporary value because local persistence writes the whole library. A delayed 30 ms callback can also outlive a subsequent deliberate Show action.

An ordinary import's correctly observed HTTP 201 acknowledgement remains valid independently of this behavior. A later visibility-only write does not prove which interaction caused that specific live write. The original live trigger remains unproven; the local regression establishes the mechanism without attributing a user action.

## Correction

- Keep a short-lived, ID-keyed display override outside every track object. Identification does not assign, normalize, restore or serialize a track's visibility or timestamps.
- The existing 2D library/current renderers and 3D track renderer consult one pure display predicate. Google 2D continues converting the normal Leaflet render layers. Existing row selection and fit-to-track behavior are unchanged.
- Missing/null visibility continues displaying as visible, but the library renderer no longer adds or changes a stored property merely to implement that display default. No other default normalization is changed.
- Track both delayed-start and expiry timers. Generation checks prevent an already-queued stale callback from affecting a replacement flash. Pointer, keyboard/click and change-driven Show/Show-all actions cancel the temporary override before the ordinary persistent action runs.
- Note/editor controls do not start identification. Backgrounding clears the temporary display override. Reload starts with no override and uses the saved track state.
- Explicit Show/Show-all remains a durable content operation and is intentionally eligible for private sync. Export/delete selections still use saved Show state, not transient display state. Visibility is not removed from hashes or private payloads.
- Four exact-counted rendering anchors fail closed if missing or duplicated. Non-editor maintenance pages retain their existing response. Existing point-zoom rendering adjustments are unchanged.

## Qualification boundaries

The source tests execute the emitted implementation, including complete private-sync clients with asynchronous synthetic IndexedDB/WebCrypto and a modeled server. A separate rendering adapter exercises the exact emitted Leaflet render, Google conversion and 3D path generation, without an actual map-provider SDK or network. These are not live map-performance or browser claims.

Full-page Chromium definitions retain real DOM, localStorage, IndexedDB and WebCrypto, with local API and rendering adapters. They must run on the exact reviewed candidate before any browser qualification is claimed. Playwright and system Chromium are present, but earlier local launch attempts failed on the environment's denied process-singleton socket and sandbox setup. That restriction has not been retried or bypassed; no browser launch or live session is used for this preparation.

Expected invariants include unchanged canonical library/editor content, serialized track data, sync hashes and server revisions; no unintended outbox writes or PUT requests during selection/timer overlap; repeated-row and cross-row cancellation; null/absent visibility; reload; persistence of an unrelated edit; track replacement/removal before expiry; and an intentional Show/Show-all upload positive control. Normal read-only sync bookkeeping is distinct from changing track content.

## Recorded local results

- The unchanged source-test command passes **362/362**, with zero failures, cancellations or skips: 335 prior checks plus 12 generated-code/rendering checks and 15 emitted-client checks. Those 15 integration cases are included in 362, not an additional count.
- The 37-node emitted-client suite passes on the correction. With the untouched baseline entrypoint, 24 pass and 13 fail the new preservation expectations; the original 22 and two new positive controls still pass. These are multiple observations of the mechanism, not 13 distinct defects.
- A separate independent strict review suite fails 14/14 preservation expectations on the baseline and passes 14/14 on the correction. It is additional isolated review evidence, not part of repository CI counts.
- Seventeen new full-editor Chromium cases are defined, bringing the complete proposed browser gate to **81 test nodes**. No current-candidate browser test body has executed locally. Syntax, registration and platform-adapter self-checks are not browser passes. These tests use DOM events, including programmatic clicks, and cannot establish physical-pointer actionability or live map-provider performance.

## Next gates

Independent source/scope review and the exact final local receipts must be retained with the proposal. Publishing these files to the public branch requires separate approval; nondeploying CI and a later approved immutable Development pin/deployment remain separate steps. The current manual workflow still checks out the old ecc77699 runtime and does not deploy this proposal. A later preparation should explicitly attest the changed imported rendering module as well as the existing pinned sources.

No live retest, data cleanup, additional track creation, permanent deletion or Production action is authorized by this document.
