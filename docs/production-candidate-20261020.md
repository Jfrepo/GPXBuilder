# Production candidate — corrected local preparation, Production HOLD

Historical pre-integration preparation record. The subsequent authorized local
main integration and current ancestry are documented in
`docs/production-main-integration-20261020.md`; its findings supersede the
unresolved-integration statements below. Runtime/artifact identities remain unchanged.

## Scope, provenance and integration

All preparation and review took place in this cloud workspace. No push, PR
publication, merge, workflow dispatch, deployment, live-app/data access, credential
change, or persistent database creation/restore/migration was performed. Synthetic
server tests use process-local `:memory:` SQLite; browser requests are intercepted.
No Mac or personal folders were used. Original checkout remains clean and unchanged.

Branch: `chatgpt/mancardo-production-candidate`.
Worktree: `/workspace/mancardo-production-candidate`.
Base: `56588cee1e1c41ed07392bfaaab97c9bb6f587b2`.
First preparation commit: `4c680755fa165b15b2c46d97a12baca05f14911a`.
The correction commit is reported in the final handoff (a commit cannot contain its
own hash). Runtime: `492f222a7ffa8c1337786b8b699ef5c7f56d54d1`.
All 50 runtime modules and HTML remain byte-identical to that reviewed runtime.

Read AGENTS.md, CHATGPT_WORKFLOW.md, VALIDATION_PLAN.md, relevant qualification and
recovery instructions. No repository/workspace `.agents/skills` files were present.
The explicitly approved task composes tested Development protections for Production.
No new functional work was started on main.

Read-only remote checks found:

| Ref | SHA |
| --- | --- |
| main | bd9d7d9be0308ba294335fe2af3b3e9be2099122 |
| dev | b0b7913147d94c453dbb0686ef00784fcce81515 |
| mancardo-dev | 85d7868c29b5b1b1a4626ddf295b332ecae71021 |
| qualification branch / pull/80/head | 56588cee1e1c41ed07392bfaaab97c9bb6f587b2 |

Candidate branch remains local. Runtime and mancardo-dev are ancestors of the base.
Main is NOT an ancestor. Merge base: `aa9246f073a734e3f77aa71f73f7a23fe9358ce4`.
Before the correction commit there were 4 main-only / 44 candidate-only commits.
Main-only commits: b0b3e44 (merge), 1f28a23 (rollback), e05366d (reapplication/hotfix),
bd9d7d9 (redeploy). Main integration is unresolved; no merge or conflict resolution
was attempted. The full candidate/main diff includes inherited Development tests,
workflows and docs, not just the local release preparation files. PR80 base/draft
status is supplied history, not independently API-verified here.

## Composition and corrections

Production config selects `worker-delete-durable-fix.js`, preserving the existing
track-size guard/base chain and Production identity/Access/D1 settings; previews
remain disabled. No schema change. Durable deletion, account scoping, late-edit
reconciliation, atomic mutation acknowledgement, selection/visibility separation
and toolbar ownership come unchanged from the tested runtime.

The offline builder copies only reachable Worker modules, config and `index.html`.
Only HTML enters the public assets directory. Tests, documentation, manifests,
config, source modules, old preview page and the qualification wrapper are excluded
from public assets. The qualification wrapper also stays out of the runtime graph.
Acorn now parses imports/re-exports, including side-effect imports; computed imports,
nonlocal imports and qualification modules fail closed. Focused tests cover these.

Independent review found that the old 81-server total mixed 43 packaged-entry and
38 source-wrapper checks. Corrected Shared mutation tests now honor the packaged
entrypoint; all 81 server checks run against that entry. Full-editor browser suites
now read packaged HTML and, where applicable, packaged config as well as modules.
The 83-browser aggregate remains mixed: 48 full-editor checks test the package,
15 isolated deletion-client checks and 20 qualification-page checks test source
fixtures (including the qualification parent test). Do not
label all 83 as Production artifact tests. The source suite remains source evidence.

## Proposed workflow — local only

Production workflow has ONLY `workflow_dispatch`; main pushes/merges no longer
trigger deployment in this proposed file. This has NOT changed the remote workflow,
which still auto-deploys on main push. Publishing the candidate alone would not
deploy under inspected workflows, but publication is not authorized.

Manual qualification requires an exact lowercase full source SHA matching dispatch
GITHUB_SHA and checked-out HEAD, exact main ref, and expected SHA256 manifest digest.
It runs source, packaged-server and isolated-browser suites, re-verifies tested bytes,
and uploads that package. Deployment needs successful qualification and downloads
that same run's artifact; it does not rebuild. Before deployment it verifies complete
file inventory/hashes, rejects symlinks/unlisted files, checks exact Production
configuration and independently supplied approval identities. Missing approval
values fail closed. Tests cover wrong events/refs/source, absent/mismatched approvals,
tampered/missing/extra files, symlinks and altered manifest.

Wrangler is pinned to `4.151.3` in package.json and package-lock.json with integrity
metadata; npm ci and `npx --no-install` consume that lock. Playwright 1.56.1 and Acorn
8.15.0 are also pinned. GitHub Actions still use version tags; runner/edge environments
are not immutable. No Wrangler deployment or dry-run deployment was invoked here.

EXTERNAL gate, not configured or verified here: Production environment required
reviewers, prevention of self-review, appropriate branch/secret restrictions, and
independently controlled `PRODUCTION_APPROVED_SOURCE_SHA` and
`PRODUCTION_APPROVED_MANIFEST_SHA256` values for the final integrated candidate.
Naming `environment: production` does not configure approval protection. These must
be established and inspected separately before any authorized dispatch. The script
checks matching values; it cannot prove who approved or how settings are protected.

## Validation and evidence

| Command/check | Result |
| --- | --- |
| `node scripts/check-production.cjs source` | PASS: 378, zero fail/skip |
| `node scripts/check-production.cjs packaged-server` | PASS: 81 exact packaged-entry server checks, zero fail/skip |
| `node scripts/check-production.cjs browser` | PASS: 83 mixed packaged full-editor/source-fixture Chromium checks, zero fail/skip |
| `node scripts/build-production.cjs` | PASS: deterministic 50-module/one-asset package |
| locked esbuild bundle; `node --check` packaged modules; workflow YAML parse; `git diff --check` | PASS |
| Dedicated lint | UNRUN: no configured linter |
| Production workflow, edge/Access/D1 replication, live smoke, backup/export/restore | UNRUN: outside authorization |

Source count changed because obsolete main-push-allowed workflow assertions were
replaced by manual-only dispatch/approval/artifact guard tests. Runtime regression
suites were retained. Tests use installed local Chromium; workflow proposes installing
Playwright's pinned Chromium. Synthetic results do not establish real edge behavior.

Initial preparation's legacy entrypoint assertion failure was corrected before its
final pass. npm default cache was unavailable; dependency installation uses
`/tmp/mancardo-npm-cache`. No unresolved approval block occurred.

Public asset `assets/index.html` SHA256:
`35fb0b1604007e342b294fc41dd8c1352312eba55bded4a9c252964b58a03da3`.
Manifest (52 entries: 50 modules, config, HTML) SHA256:
`fe41abd19887f8f4a99c8c70b6409942009da1aada82b28d32c791e6d8edfb06`.
Deterministic deployment-package tar SHA256:
`59ac7f49f55ea16443c5a095b9ed5db294f67fb63d143c38a359ac739f8680e7`.
Bundled Worker SHA256:
`bf01aee0915c67c52a6b7e7b78c953b45deaa72bc99267927df04d2cefd932f8`.
Runtime package bytes are unchanged by release-test/workflow corrections. The archive
is a local content-addressed snapshot, not a deployed version or signed release.
Logs/archive remain in `/workspace/mancardo-release-evidence/`; these paths are local
to the cloud consumer and are not delivery links accessible to the parent/user.

## Remaining recovery and release gates — do not execute under current approval

1. Deliberately integrate with current main and review the whole resulting diff;
   requalify the exact integrated SHA and artifact. No silent conflict resolution.
2. Establish/verify the external approval protections above. Recheck every workflow
   on the eventual integration commit: current remote main remains auto-deploying,
   and Development/legacy release workflows can deploy or access live services.
   Do not push, merge or dispatch as part of this preparation.
3. Obtain separate authorization for Production inventory and recovery work. Existing
   `docs/d1-recovery-runbook.md` says backup/restore NOT verified; the Oct16 readiness
   document records local backup integrity but not proven remote restore. Bookmark
   availability and revision counters alone do not prove recoverability.
4. With separate authorization, verify schema/history coverage, retention and a fresh
   recoverable snapshot; keep exports/identifiers private. Restore only to a separately
   approved disposable target. Compare snapshot-time counts, tombstones, owner
   partitions and full payload hashes; demonstrate single-track extraction and record
   duration/results. No inventory, export, database creation or restore occurred here.
5. Independently verify current Production Worker version and code-only rollback
   target. Retain the Production D1 binding on rollback. Never overwrite newer user
   writes with an old database snapshot without approved reconciliation. Recovery
   verification and rollback evidence remain blockers, not completed claims.
6. Obtain explicit release approval. Any future authorized rollout must deploy the
   approved bytes and perform separately approved bounded acceptance/observation.
   Pause or roll back code for data loss, failed saves, cross-account exposure or
   toolbar regressions. Synthetic tests do not establish real-user concurrency,
   external map health, Cloudflare Access policy or D1 replication behavior.

Supplied Oct20 acceptance preserved complete visible/hidden JSON over bounded waits
and reloads; one approved Show change established the hidden baseline. This is record
preservation evidence, not zero PUT attempts or continuous telemetry. Not repeated.
Maps-loading/favicon issues remain separate. Production remains HOLD.
