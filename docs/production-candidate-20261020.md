# Production candidate — local preparation, Production HOLD

## Scope and provenance

Prepared only in the GPXBuilder cloud workspace. No push, PR publication, merge,
workflow dispatch, deployment, live application request, live-data read/write,
credential change, or persistent database creation/restore/migration was performed.
Tests use synthetic identities, intercepted requests, and process-local `:memory:`
SQLite fixtures. No Mac or personal folders were used.

Local branch: `chatgpt/mancardo-production-candidate`.
Worktree: `/workspace/mancardo-production-candidate`.
Base: `56588cee1e1c41ed07392bfaaab97c9bb6f587b2` (reviewed Development preparation).
Runtime: `492f222a7ffa8c1337786b8b699ef5c7f56d54d1`.
All 50 reachable runtime modules and `index.html` are byte-identical to that runtime.
The original `/workspace/GPXBuilder` checkout is clean and unchanged.
No `.agents/skills` files were present in the repository or workspace skill directory.
Read `AGENTS.md`, `CHATGPT_WORKFLOW.md`, `VALIDATION_PLAN.md`, qualification workflows,
and relevant release/recovery documents. This is the explicitly approved Production
composition of Development work, not new functional work started on main.

Read-only remote ref verification (`git ls-remote`, fetch; no remote writes):

| Ref | SHA |
| --- | --- |
| main | bd9d7d9be0308ba294335fe2af3b3e9be2099122 |
| dev | b0b7913147d94c453dbb0686ef00784fcce81515 |
| mancardo-dev | 85d7868c29b5b1b1a4626ddf295b332ecae71021 |
| chatgpt/mancardo-delete-qualification / pull/80/head | 56588cee1e1c41ed07392bfaaab97c9bb6f587b2 |

Runtime and mancardo-dev are ancestors of preparation. Current main is NOT an
ancestor; merge base is `aa9246f073a734e3f77aa71f73f7a23fe9358ce4`.
The four main-only commits cover the earlier merge/rollback/reapplication/redeploy.
The actual tree comparison was inspected: runtime differences are the deliberate
protection and UI changes below. No automatic merge was performed. PR80 metadata
(base/draft) is supplied history, not independently API-verified in this session.

## Local release changes relative to preparation

- `wrangler.toml`: selects `worker-delete-durable-fix.js`; assets point to
  `dist/production/assets`. Existing Production identity, Access settings, D1
  binding and disabled preview URLs are preserved. No schema change.
- `scripts/build-production.cjs`: offline deterministic package, exact reviewed
  config digest and Worker/D1/preview/entrypoint guards; copies the reachable
  local module graph, one allowlisted asset, package-relative config and SHA256
  manifest. Rejects qualification modules/nonlocal imports. Cleans only its output.
- `scripts/check-production.cjs`: reproducible source and isolated browser runners.
- `.github/workflows/cloudflare-workers.yml`: adds local artifact build before
  credentials/deploy, changes deploy config to the packaged config. No workflow run.
- `.gitignore`: ignores local dependencies and build outputs.
- `tests/production-artifact.test.cjs`: negative target guards, deterministic
  packaging/file inventory/hash checks, packaged/source delivered-HTML equality,
  authenticated synthetic qualification-route 404 with unchanged data, workflow
  package selection.
- `tests/generated-html.test.cjs`: requires durable entrypoint for both configs;
  calls the old transform baseline `legacyBaseEntry` to avoid misleading naming.
- `tests/release-safety.test.cjs`: Production must select durable wrapper while
  retaining the existing track-size guard chain.
- `tests/workflow-boundaries.test.cjs`: permits exactly the new build step/config
  path in the historical workflow-byte guard; retains branch/target checks.
- This document: provenance, evidence and remaining gates.

Relative to main, the inherited runtime changes are `index.html` and
`worker-mobile-layout.js` (toolbar ownership), `worker-waypoint-zoom.js`
(selection without durable visibility changes), `worker-autosave-stability.js`,
`worker-delete-durable-fix.js`, `worker-request-cadence.js` (durable pinned deletion,
account checks, late-edit/reconciliation, request cadence),
`worker-private-library-sync.js`, `worker-shared-library-cloud.js` (atomic mutation
acknowledgement). `worker-owner-qualification.js` remains review/test source only:
it is absent from the reachable Production graph and package. Development workflow,
tests and documents inherited from preparation are not public runtime assets.

## Validation

| Check | Result |
| --- | --- |
| `node scripts/check-production.cjs source` | PASS: 381, zero fail/skip |
| `MANCARDO_DELETE_TEST_ENTRY=$PWD/dist/production/worker-delete-durable-fix.js node --test tests/delete-behavior.test.cjs tests/delete-cross-client.test.cjs tests/request-volume-browser.test.cjs tests/owner-qualification-browser.test.cjs` | PASS: 83 Chromium checks, zero fail/skip; reproducible with `node scripts/check-production.cjs browser` |
| `MANCARDO_DELETE_TEST_ENTRY=$PWD/dist/production/worker-delete-durable-fix.js node --test tests/server-owner-isolation.test.cjs tests/d1-mutation-ack.test.cjs tests/shared-mutation-ack.test.cjs` | PASS: 81 checks, zero fail/skip |
| `node scripts/build-production.cjs` | PASS: 50 modules, one public asset, deterministic manifest |
| `npm exec --cache /tmp/mancardo-npm-cache --yes --package=esbuild@0.25.11 -- esbuild dist/production/worker-delete-durable-fix.js --bundle --format=esm --platform=browser --outfile=dist/production-worker.mjs` | PASS: offline runtime bundle compilation, 441.5 KiB |
| `node --check` on all 50 packaged runtime modules; `git diff --check` | PASS |
| Dedicated lint | UNRUN: no linter/config/package test instructions present |
| Cloudflare/Wrangler edge validation, live smoke, backup/export/restore, deployment | UNRUN: outside authorization |

The first source run passed 379/380: a legacy test still required the old Production
entrypoint. Corrected that expectation; final suite above includes additional
artifact assertions. Initial npm install could not use its default home cache;
using `/tmp/mancardo-npm-cache` succeeded. No unresolved test failures or approval
blocks. Playwright 1.56.1 and installed Chromium were used. The browser suite includes
83 existing checks; isolated qualification harness checks are test evidence, not
claims that those routes exist in Production. Full-editor tests use the packaged
entrypoint, including selection/visibility and toolbar startup/resize cases.

## Artifact evidence

Only public asset: `assets/index.html`, SHA256
`35fb0b1604007e342b294fc41dd8c1352312eba55bded4a9c252964b58a03da3`.
There is no public source, test, doc, preview page, manifest, config or qualification
file. The deployment package has 50 module files + config + manifest + one asset;
modules are bundling inputs outside the assets directory.

Manifest SHA256:
`fe41abd19887f8f4a99c8c70b6409942009da1aada82b28d32c791e6d8edfb06`.
Deterministic tar SHA256:
`59ac7f49f55ea16443c5a095b9ed5db294f67fb63d143c38a359ac739f8680e7`.
Local evidence directory: `/workspace/mancardo-release-evidence/` (test logs,
manifest, content-addressed read-only tar). Bundle SHA256:
`bf01aee0915c67c52a6b7e7b78c953b45deaa72bc99267927df04d2cefd932f8`.
The archive is a local content-addressed snapshot, not a deployed version or an
externally signed artifact. Verify its SHA256 against this record before extraction;
verify every extracted file against `manifest.json` before any future use.

## Remaining gates and controlled procedure — do not execute under this approval

1. Review the diff against current main and resolve ancestry deliberately. Repeat
   source/browser/package checks on the exact final integrated commit. Any config
   change requires explicit review and updating the pinned config digest. Pin the
   final source SHA and approved artifact digest for release.
2. The main workflow STILL auto-deploys on main push; manual dispatch is main-only.
   It still resolves `wrangler@4`, not an immutable tool version, and rebuilds the
   package from checkout. Before promotion, approve a protected release mechanism
   with a pinned tool version, exact approved commit/artifact digest verification,
   Production environment approval and target identity checks. Do not push this
   branch/main or dispatch any workflow under the present authorization. Development
   and legacy release workflows can also deploy or make live requests; do not run.
3. Obtain separate permission for Production read-only inventory and recovery work.
   `docs/d1-recovery-runbook.md` explicitly says backup/restore NOT verified;
   `docs/production-release-readiness-20261016.md` records an earlier local backup
   integrity check but no proven remote restore. Neither a bookmark response nor
   revision counters prove recoverability. Historical screenshots/reports are not
   current recovery evidence.
4. With that separate authorization, verify actual schema/history coverage, backup
   retention and a fresh recoverable snapshot. Keep exports/identifiers private.
   Restore only to a separately authorized disposable recovery target, never the
   live Production or Development DB. Compare snapshot-time counts, tombstones,
   owner partitions and representative full payload hashes. Demonstrate a single
   track extraction, record duration and evidence, and obtain cleanup approval.
   No such inventory, export, database creation or restore was performed here.
5. Separately verify and record the current Production Worker version and code-only
   rollback target. Prepare rollback to that version with the existing Production
   D1 binding intact. Rollback does not reverse user writes; never restore an old
   database over newer user data without a separately reviewed reconciliation plan.
6. Obtain explicit Production release approval after these gates. Future authorized
   rollout must verify exact Worker/D1/Access identity, deploy the approved bytes,
   then perform separately approved bounded acceptance and observe errors, sync
   status and user records. Pause/rollback code for data loss, failed saves,
   cross-account exposure or toolbar regressions. Local tests do not establish edge
   Access behavior, D1 replication, external map health or real-user concurrency.

User-supplied Oct20 visible/hidden exact-name acceptance preserved complete JSON
across the bounded waits/reloads; one explicitly approved Show change established
the hidden baseline. This is record-preservation evidence, not zero PUT attempts
or continuous telemetry. It was not repeated here. Maps-loading and favicon issues
remain separate; no map redesign was included. Production remains HOLD.
