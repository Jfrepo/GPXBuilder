# Responsive toolbar placement correction

## Scope and status

This is a local-only proposal based on preparation commit `0ccfa3ec9845d75886abb6155d5f54cdadfbeaeb`, whose runtime is `583badd5be6c760c8824b4ebec1a92f515a35742`. It has not been published or deployed. The existing manual deployment pin, workflows, Wrangler configuration, database schema, account bindings and authorization rules are unchanged.

Five proposed files: `index.html`, `worker-mobile-layout.js`, the existing generated-HTML and full-page browser test files, and this document. The two runtime files are also used by the Production import chain. This is therefore a shared-source correction, not a Development-only wrapper change; no Production release is implied.

## Reproduced defect

The base editor's narrow-screen placement tried to insert the toolbar into the dock before the point-list toggle. The mobile modules had already moved the toolbar into a scrolling viewport and the toggle into the stats row. The reference was no longer a direct child of the dock, so a later resize could throw `NotFoundError`.

A second initialization path occurred on cold desktop startup: the base editor moved the toolbar into the desktop host before the mobile installer searched for it only inside the dock. The installer then returned without creating the mobile ribbon. A later transition to narrow layout could either throw or leave the ribbon absent, depending on media-query/resize ordering.

Both source mechanisms predate the selection-highlight correction. Synthetic reproduction establishes the paths, not which resize sequence occurred in the reported live session. The errors arise in placement callbacks; they do not themselves demonstrate a lost track or failed cloud write.

## Correction

- Keep one toolbar-placement function: desktop host on wide screens, the installed scrolling viewport on narrow screens.
- Before mobile installation, use the dock fallback only with a verified direct-child reference or a null reference.
- Find the existing toolbar from its actual document location, including after desktop placement.
- Create the mobile navigation container under the dock, never beside a toolbar currently in the desktop host.
- Have mobile layout changes call the shared placement function instead of restoring a stale remembered toolbar parent.

The same toolbar and its controls are moved, not recreated. Existing point-list placement, control handlers, map-control relocation, map-size invalidation, explicit Show/Show-all behavior and all track persistence paths remain unchanged. This does not catch and suppress the original exception or merely move the toolbar out of its mobile ribbon.

## Verification

- Full existing source command plus the new checks: **375/375 passed**, with zero failures, cancellations or skips.
- Generated-HTML suite: **40/40 passed**, including 12 new cases executing exact emitted base, mobile-v2 and mobile-v3 code through both configured entrypoints.
- The same 12 new cases against unchanged baseline code: **10 fail, 2 pass**. The two passing absent-toggle controls distinguish the defective moved-toggle/ribbon paths from a harmless null reference. This is not a claim of ten separate defects.
- Separate independent responsive review: **8/8 candidate versus 0/8 baseline**; eight additional base-only controls pass on both. These counts are not added to the repository source count.
- Two new full-page Chromium cases are defined, increasing the complete browser gate from 81 to **83 nodes**. They cover cold mobile/desktop, 13 native width/height changes including repeated breakpoint crossings, node identity and intended parent/display, point-list and editing controls, cloud sync and reload with no unintended writes. All eight existing intentional Show positive controls remain unchanged. Syntax passes; **zero candidate browser bodies have run locally**.

The source tests use a synthetic DOM with strict direct-child insertion, explicit media/resize ordering and timer draining. They verify unchanged hidden/shown/null/absent track serialization/hash and record attempted storage/network/persistence effects, including caught attempts. They do not emulate browser layout, real pointer actionability, provider SDKs or real network traffic.

The browser fixture retains real DOM, localStorage, IndexedDB, WebCrypto and the complete emitted editor, while substituting network and Leaflet rendering. Its keyboard activation and row-event dispatch do not establish physical-pointer hit targets, mobile swipe/overflow usability or real-provider rendering. Local Chromium launch remains blocked by previously observed process-singleton/socket and sandbox restrictions; it has not been retried or bypassed. The new browser bodies have not executed locally. Any public CI, deployment or live acceptance requires separate approval.

## Limits and next gate

Obtain independent final patch review, then separately authorized public CI on the exact frozen tree. A later Development preparation must pin that tested immutable commit and attest the newly changed index asset and mobile-layout dependency as well as existing dependencies. Neither the unchanged manual pin nor a source-only pass qualifies this candidate for deployment.

Favicon response handling, Maps script-loading configuration, intermittent blank imagery, Production packaging and broader release gates are outside this patch. No Maps URL/key, live account identifier, real track payload, saved-track operation or live service request is needed for these tests. The reported favicon error and Maps loading warning are not claimed fixed here.
