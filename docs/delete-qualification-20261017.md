# Mancardo deletion correction: draft candidate, not release-qualified

## Baseline and scope

- Source baseline: `85d7868c29b5b1b1a4626ddf295b332ecae71021`, latest inspected `mancardo-dev` and Development deployment #62.
- Deployment target proposed by this patch: `mancardo-dev-test`, dedicated `mancardo-private-library-dev` D1 through existing Development configuration. **Not deployed.**
- Production `wrangler.toml`, migrations, and shared server/client source modules are unchanged. After separate authorization, the existing Development workflow's feature-branch copy adds a guarded manual-only job; its original job and all automatic triggers are unchanged. See [manual Development steps](manual-development-candidate.md). This preparation is not a deployment.
- PR #79 is not merged or qualified by this patch. Its `409` retry guard alone does not protect an offline delete that first discovers a newer revision before sending DELETE. This candidate supersedes that behavior in the Development-only wrapper.

## Reproduced causes

1. Current deployed autosave wrapper appends its explicit-delete bridge outside the editor IIFE. Its `state` reference is out of scope; the caught lookup returns an empty list. The bridge also omits the menu-delete selector. Local deletion therefore has no durable cloud counterpart, permitting later reconciliation to restore the track.
2. The rolled-back durable wrapper embeds a leading-newline `String.raw` value whose opener was stripped with `^<script`. The opener survives and lands inside the editor script. Rendering the actual Worker chain and compiling its returned script reproduced `Unexpected token '<'`. All ten old source-regex tests still passed against that broken wrapper.
3. That wrapper returned an already-consumed response if the editor boot marker was absent.
4. Both old delete clients fetched the latest server revision instead of pinning the revision the user had reconciled. Removing only the immediate 409 retry did not close the offline/concurrent-edit loss window.

## Proposed change

- Inject plain JavaScript inside the editor IIFE; no nested script tags. Return a fresh readable response for fallback HTML.
- Persist a v4 intent before local removal, bound to the existing IndexedDB workspace account and last reconciled revision. Verify that the confirmed local content matches the revision hash (allowing only known presentation-only visibility variants) and remains unchanged while authorization is pending.
- Send only that captured revision, including on retry after network loss. Cancel on a live revision conflict rather than acquiring permission to delete a newer edit.
- Verify the expected account again server-side on the same authenticated DELETE request, closing a health-check/account-switch race.
- Guard cloud reconciliation, late asynchronous local replacement, and conflict-copy creation while an explicit intent is pending. Retain a confirmed revision watermark to block old in-flight pulls; permit a genuinely newer live recreation.
- Leave legacy v2/v3 pending records untouched. They do not contain enough account/revision authority to replay safely.
- Add a secret-free, non-deploying PR qualification workflow. It runs isolated source/client/browser fixtures only.

## Evidence

Executed locally on Node v24.19.0:

`node --test tests/release-safety.test.cjs tests/generated-html.test.cjs tests/delete-client.test.cjs`

**35 passed, 0 failed:** 10 source safety assertions, 11 actual generated-HTML/mutation tests, and 14 executable client/server-guard scenarios with deterministic in-memory adapters. Scenarios cover persistence, reload, offline stale conflicts, lost response retry, owner isolation, storage failure, unknown revisions, malformed queue, independent queued failures, stale pulls, repeated actions, interrupted authorization, and same-request account checking.

`node --check` on every `worker*.js` and `tests/*.cjs`: passed.

`git diff --check`: passed.

Local Chromium launch was blocked by this execution environment's Unix-socket sandbox; the permitted escalation failed before browser startup. After authorized publication as [draft PR #80](https://github.com/Jfrepo/GPXBuilder/pull/80), [CI run 39031795479](https://github.com/Jfrepo/GPXBuilder/actions/runs/39031795479) successfully executed **35 nonbrowser checks and all 13 initial Chromium/localStorage/IndexedDB fixtures** on candidate `760e393fdcb0f182b2409393318c9e75d5a44805`. The tested PR merge tree was verified identical to that candidate tree. These fixtures use a routed synthetic API, not a live account or D1.

The current browser suite adds two focused confirmed main-button and selected-delete fixtures, for **15 cases**. It exercises the injected capture handlers with minimal fixture DOM, including the base editor's confirmation CSS state supplied by the fixture; it does not claim the entire editor confirmation flow is integrated. Require the new exact-SHA CI run to pass before crediting these two additions.

No authenticated browser, real D1, mobile-device, two-live-account, or deployment checks were performed. No claim of full map rendering is made from script compilation alone. Current Production, Development, and live records were not modified.

## Known limitations and required qualification

- This draft deliberately refuses deletion of unsynced/local-only tracks, tracks without a known reconciled revision, and tracks edited while delete authorization is pending. It preserves the local copy and requests sync/review instead. Visibility-only changes are now accepted by checking the stored exact hash against true/false/null/absent variants of the visible field; substantive edits remain protected. This is a temporary UX limitation and must be resolved or explicitly accepted before release; do not call this a comprehensive deletion fix.
- Full-editor browser UX, all three integrated UI deletion entrypoints, authenticated account switching, and existing outbox/in-flight PUT interactions still require Development tests. Isolated browser fixtures do not establish these live-system properties.
- A missing sync record is not proof of a never-uploaded track: PUT may have committed while its success response was lost, or still be in flight. Safe local-only deletion needs positive never-uploaded provenance plus serialization/cancellation against the uploader; this patch does not invent that invariant.
- Persistent confirmed watermarks are retained locally for safety. Storage growth/retention requires review before a long-lived release.
- Actual automatic refresh and manual refresh must both be exercised after an authorized Development deployment, including another device seeing the same tombstone, and cloud-side records inspected without modifying unrelated data.
- Backup/restore evidence and investigation of previously missing tracks remain separate blockers.

## Publication safety and deployment hold

Proposed branch: `chatgpt/mancardo-delete-qualification`, based on the exact baseline above, draft PR into `mancardo-dev`.

The repository's existing Actions deploy only `main`, `mancardo-dev`, or its named release branch. This feature branch does not trigger those deployment jobs. User-provided Cloudflare settings screenshots inspected on 2026-10-17 show Production branch `main`, no build command, root `/`, Production command `npx wrangler deploy`, and Preview command `npx wrangler preview`. Preview-branch builds are enabled, but Preview URLs are disabled. No settings were changed.

Root `wrangler.toml` is unchanged, has no `[previews]` block, and the repository has no package scripts. Released [Wrangler 4.151.1](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.151.1) calls `ensurePreviewsConfig` before building or uploading. Its [configuration guard](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/wrangler/src/preview/ensure-config.ts) rejects the missing block in CI, regardless of dashboard Preview Base bindings; it does not silently copy Production bindings or fall back to a Production deployment. Therefore the existing automatic Cloudflare preview check is expected to fail closed, not provide a usable test URL. This conclusion is scoped to the inspected commands/configuration and released implementation, not an assumption that every preview is data-isolated.

The separate draft is published and its secret-free qualification workflow is running/passing as recorded in the PR description for each exact SHA. Do not enable Preview URLs or change preview bindings as a side effect. The separately approved manual Development route pins the tested runtime to `63dc68e2eb4703a24a9bf607869ea3770baa3164`; preparing it does not run it. The available connector cannot dispatch the run, so the user must follow the exact [Run workflow steps](manual-development-candidate.md). Do not merge or deploy Production. Keep the draft unqualified until authenticated Development acceptance is evidenced.
