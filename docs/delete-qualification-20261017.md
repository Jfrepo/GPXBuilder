# Mancardo deletion correction: draft, not release-qualified

## Current result and exact boundaries

- [Draft PR #80](https://github.com/Jfrepo/GPXBuilder/pull/80) targets `mancardo-dev` from `chatgpt/mancardo-delete-qualification`. Source baseline: `85d7868c29b5b1b1a4626ddf295b332ecae71021`. No merge or Production deployment.
- The user-dispatched [Development run 39069567577, attempt 2](https://github.com/Jfrepo/GPXBuilder/actions/runs/39069567577) deployed runtime `63dc68e2eb4703a24a9bf607869ea3770baa3164` on 2026-10-17 at 21:18:27 UTC. Real metadata guards verified existing Worker `mancardo-dev-test` and D1 `mancardo-private-library-dev`. Worker version: `18b3ed15-9620-46f2-b611-9e710e76bc78`. No migrations or reseeding.
- **That deployed runtime failed independently observed cross-client no-reappearance acceptance.** The original synthetic record was correctly tombstoned, but another client created and uploaded a new conflict-copy record. Earlier user-reported refresh and second-tab passes were narrower observations, not full qualification.
- This revision proposes the focused cross-client correction below. **It is not deployed.** The manual Development workflow deliberately still checks out `63dc68e` and rejects the changed runtime. Do not rerun that workflow expecting this correction. A new runtime deployment requires separate approval and an explicitly updated pin.
- Production configuration, shared base modules, migrations, main/dev branches, and the manual deployment workflow are unchanged by this follow-up.

## Reproduced causes

1. The original autosave wrapper's delete bridge was outside the editor IIFE. Its inaccessible `state` lookup was caught and returned no IDs, so deletion was local only. Its selector also missed menu deletion.
2. The rolled-back durable wrapper retained a leading-newline `<script>` opener inside the editor script, breaking map startup. Actual delivered-HTML compilation reproduced the failure while all ten old regex assertions passed. Fallback HTML also reused a consumed response.
3. The old delete clients acquired the latest cloud revision before DELETE. A 409 retry guard alone did not protect offline deletion against an intervening edit.
4. **New live finding:** the full cloud client unconditionally called `preserveConflictCopy(local, 'Recovery snapshot before cloud delete')` for every incoming tombstone, including unchanged replicas. Other clients lack the initiating browser's local pending intent, so its guards did not prevent this. Their next queue scan uploaded the copy under a new ID.
5. The adjacent stale-PUT/409 path also copied unchanged visibility-only replicas. Its same-hash shortcut could mistake a tombstone for a successful live PUT because tombstones retain the old content hash; the base-revision-zero conflict response can omit the deleted flag entirely.

## Proposed behavior

The existing v4 wrapper keeps account-bound, durable intent; exact reconciled base revision; unchanged-content proof; pinned retries; 409 cancellation; same-request server account validation; pending-intent guards; and readable, valid generated HTML.

The follow-up adds reconciliation inside the actual cloud-sync IIFE:

- Both incoming tombstones and stale-PUT conflicts use the same conservative helper.
- Suppress recovery copies only with positive known-live metadata, a strictly newer tombstone, and an exact reconciled hash match allowing only boolean/null/absent top-level visibility variants.
- Preserve substantive local edits or uncertain provenance as recovery copies. Ignore older/equal tombstones that cannot supersede known live metadata.
- Re-read metadata, library snapshot, separate editor clone, and account after asynchronous hashing. If an uncommitted editor clone differs substantively, defer rather than erase it. Repeated concurrent changes also defer.
- Scope final outbox deletion to the captured owner and recheck that owner inside the asynchronous database transaction callback.
- Treat the PUT shortcut as live only when `deleted` is explicitly false or zero. Otherwise fetch the authoritative row and reconcile. A verified same-hash live acknowledgment updates metadata atomically without replacing local content or clearing newer queued edits; this preserves lost-initial-PUT-response recovery without inventing a copy.

## Live evidence, synthetic data only

Approved test track `DOT-DELETE-QUAL-20261017-2140`, ID `tr_mvcxthk6_ehcpgj`, contained three invented points. An authenticated, independent cloud browser observed revision 1/live before deletion and revision 2/deleted with null payload after the one specifically approved permanent deletion at 22:01:27 UTC. After more than 60 seconds and full reload, the original stayed tombstoned.

A new record `tr_mvcxzbou_tarphn`, revision 1/live, appeared at 22:02:12.078 UTC, with the matching synthetic geometry and note `Recovery snapshot before cloud delete`. Its device identifier differed from the initiating browser's. The exact synthetic-record GET verified that this copy was persisted server-side, not merely a stale UI row. No exact other-device identity is inferred. The copy is retained as evidence; no extra deletion was performed. No existing user tracks were edited or deleted, and no credentials or real-track payloads are included in test artifacts.

## Executable evidence and limits

- Exact deployed wrapper, fetched by immutable SHA: **11 complete emitted-client Node tests, 2 pass / 9 fail**. The clean receiver produces the same recovery-copy note observed live; visibility-only stale PUT produces a second conflict path.
- Proposed revision: **70 nonbrowser checks pass locally**: 10 source safety, 11 delivered HTML/hash, 14 explicit-delete client/server guard, 9 deployment guard, 13 complete emitted-client sync, and 13 independent tombstone/acknowledgment safety checks. Adapters replace storage/network in Node; these are not live D1 proofs.
- Four new browser cases run the actual generated full editor, real Chromium DOM/localStorage/IndexedDB/WebCrypto, two independent contexts, and shared synthetic API fixtures. Only Leaflet rendering/CDN assets and network services are stubbed. They cover unchanged receiver, genuine rename recovery, visibility-only stale upload, and edit during tombstone hashing. Local browser launch is sandbox-blocked; execution is pending exact-SHA nondeploying CI.
- The prior [CI 39032743920](https://github.com/Jfrepo/GPXBuilder/actions/runs/39032743920) passed 43 checks and 15 isolated Chromium deletion fixtures on `de8b122955db1b34437279d48b6a7022aa82ec09`. Those results do not qualify this new correction. The new workflow runs all current source checks plus the prior 15 and new 4 browser fixtures.
- Syntax checks and `git diff --check` pass. Frozen deployed-runtime fixture SHA-256 is `d3f63a6fdf56a74c31eb2958b0934005deeec3a0336f3f270b6b63735ed0e8fb`; guard tests verify that the unchanged manual route accepts only its pinned bytes and rejects this newer proposal.

## Remaining release gates, in priority order

1. Pass exact-candidate full-editor CI and independent review, then obtain separate approval for a newly pinned Development-only deployment. Existing manual steps target the old runtime.
2. Repeat the disposable-track test across independent clients after deployment, proving original tombstone and absence of newly uploaded conflict copies after auto/manual refresh. A stale client with genuine unsynced changes must retain those changes, not lose data.
3. Complete authenticated offline/concurrent-edit and account-isolation checks using synthetic records only. Another account requires separate authorized access; no broad admin permission is needed.
4. Resolve or explicitly accept local-only deletion UX, persistent watermark retention, and backup/recovery evidence before release. Never infer missing metadata means never uploaded: an in-flight or lost-response PUT may already exist remotely.

The wrapper deliberately refuses explicit deletion without a positively reconciled revision, including unsynced/local-only tracks or substantive edits during authorization. It preserves data and asks for sync/review. Deferring a tombstone while the editor has uncommitted changes can leave the row visible until the edit is resolved. The outer sync UI may still say Synced in that case; this remains a pending-conflict UX limitation, not proof deletion finished.

## Publication safety

Only the feature branch is updated. Qualification Actions have read-only repository permissions, no secrets, deployment, migrations, or live records. Existing Actions deploy only named main/dev/release branches; the feature branch does not trigger those jobs. The manually gated candidate route remains byte-for-byte unchanged and pinned to the previously approved runtime.

Inspected Cloudflare settings use Production branch `main` and `npx wrangler deploy`, while preview branches use `npx wrangler preview` with Preview URLs disabled. Root configuration has no `[previews]` block. Released [Wrangler 4.151.1's preview guard](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.151.1/packages/wrangler/src/preview/ensure-config.ts) fails before build/upload on that missing configuration. Thus the existing preview check is expected to fail closed, not provide a test release. No preview settings or access permissions are changed by this follow-up. PR #79 remains separate, unmerged, and unqualified.
