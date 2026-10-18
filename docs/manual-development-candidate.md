# Guarded Development preparation for the combined integrity fixes

This seven-file preparation is for immutable runtime
`ecc776998a6ae1cbca92b92714e42a74cff6c9f1`. It is preparation only: publishing
these files does not authorize or start a deployment, merge, migration,
configuration change, live test, or PR-description edit.

## Current versus proposed state

Development currently runs `fe10024e79143d47fbaf86a3864f69db60fa7200`, Worker
version `1a5d81ff-619a-4d87-96d4-5c5eb993f599`, from the previously verified
[user-started deployment](https://github.com/Jfrepo/GPXBuilder/actions/runs/39125901328).
The existing two-record ownership harness and private identifier bindings are
already present. Do not recreate its stopped baseline records or change sign-ins.

The proposed runtime is the combined late-edit, private/Shared acknowledgement
and workflow-safety correction. Its exact published tree is
`5cf57fb863ca825b689b06363e8b4ffd7f76fdee`.
[Runtime CI 39164499872](https://github.com/Jfrepo/GPXBuilder/actions/runs/39164499872)
independently passed **334 source checks and 64 Chromium nodes**, zero failures,
cancellations or skips, on attempt 1. Both jobs checked out merge commit
`274bc66039f95c59acc7a20d0aa7a06747960018`, whose tree exactly equals the head.
These are isolated fixtures, not live D1 or Production acceptance. The selected
editor regression includes an explicit normal reselect after persisted-note
proof; it is not automatic recovery of arbitrary unsaved editor work.

## Exact seven-file preparation

1. `.github/workflows/cloudflare-dev.yml`: two fixed checkout/assertion values,
   the full pinned source command, the updated wrapper hash, and two added
   dependency attestations only.
2. `tests/deployment-guard.test.cjs`: execute the selected inline guard with
   exact frozen source bytes; cover changed/missing handler dependencies and
   rejection of the older deployed wrapper before any API call or config write.
3. `tests/workflow-boundaries.test.cjs`: independently keep the ordinary
   Development prefix unchanged while attesting the newly reviewed manual job.
   Production and no-deploy workflow assertions remain unchanged.
4. `tests/fixtures/reviewed-live-reconciliation-ecc77699.txt`.
5. `tests/fixtures/reviewed-private-ack-ecc77699.txt`.
6. `tests/fixtures/reviewed-shared-ack-ecc77699.txt`.
7. This document.

The three fixtures are byte-for-byte copies of already public runtime files,
not runtime imports. No application source, committed Wrangler configuration,
Production workflow, permissions, event trigger, database schema or private
binding value changes in this preparation.

## Seven integrity attestations

| File | SHA-256 |
|---|---|
| `.assetsignore` | `b5abc5b4c9dffc6819fd542711396a4734fe52ce295d75b032cef3edf4eacce6` |
| `wrangler.dev.toml` | `e5237a94e142e693b8a3697b8259787adf35b7faba877a950ff21321aef78bea` |
| `worker-delete-durable-fix.js` | `f4f308b02da20ecad956b6d8e588f21fdf2aa128af25e9a978b2eb6570bd42bd` |
| `worker-private-library-sync.js` | `e56eba2c67972294678442f8822d7818e5d907d67668b47c92a3c9f4cec95191` |
| `worker-shared-library-cloud.js` | `8239c8d8b9bff0298c7195747c1fc4aaedf8a60996ab8ac7023c971e4d6ee449` |
| `worker-request-cadence.js` | `66679a8340c33f53b85dfc27823c461cb720e900c5c5c2c08ac453346438f53e` |
| `worker-owner-qualification.js` | `8c1f2f39458a71cc155b96c5a2ace2abf0b638e2c0b2ece5613d43410d89ebd5` |

The immutable checkout fixes all imported dependency bytes; these explicit
hashes additionally attest the two corrected database handlers instead of
checking only their outer importer. Missing or changed attested files fail
before Cloudflare API access or runner-local configuration writes.

## Preserved deployment boundaries

Only a manual event from `chatgpt/mancardo-delete-qualification` can select the
reviewed candidate job. Existing event/ref restrictions, `development`
environment, credentials, permissions, target serialization and private-output
redaction are unchanged. The ordinary deploy job must be skipped for this branch.

The same read-only API guard verifies the exact existing database UUID/name
`mancardo-private-library-dev` and the single D1 binding of Worker
`mancardo-dev-test`; Production's UUID is rejected in either case. Existing
private identity values must be distinct, exact lower-case 24-hex strings.
Neither values nor credentials are added to source, command-line arguments,
logs or artifacts. The workflow does not create/update secrets or Access policies.
It retains the existing runner-only config injection and ownership run identifier.

The exact command remains Wrangler `4.151.1` deploying only `mancardo-dev-test`.
Captured output is redacted; uncertain/truncated output is discarded. An
uncertain deployment outcome requires reading the actual version before any
retry. No automatic deployment retry is introduced.

No live D1 SQL query, migration, reset, reseed or track write occurs in this
workflow. Its tests use disposable in-memory SQLite only. The existing
Production and ordinary Development safety improvements stay intact.

## Distinguish pinned runtime checks from selected preparation checks

A future manual run checks out **ecc77699** and reruns all **334** source checks
stored in that immutable commit, followed by a clean diff assertion. Its
historical guard tests exercise that commit's earlier fe100 workflow, not the
new selected workflow definition.

The selected preparation is qualified separately in PR CI. Locally, its
**19 deployment-guard checks plus 33 workflow-boundary checks** pass. Full
preparation source and browser results must come from the exact published
preparation head and independent review before giving run instructions.
The expected preparation totals are **335 source checks and 64 Chromium nodes**;
expected counts are not evidence that hosted CI has completed.

## Later user-started Development run, only after separate approval

After exact-head preparation CI and independent verification:

1. Obtain explicit approval for the Development deployment. Preparation approval
   is not deployment approval. Retain the existing approved private bindings;
   no new authentication or permission change is needed or implied.
2. Open [the Development workflow](https://github.com/Jfrepo/GPXBuilder/actions/workflows/cloudflare-dev.yml),
   select `chatgpt/mancardo-delete-qualification`, and start a **NEW Run workflow**.
   Do not use Re-run jobs: it retains the older workflow and pin.
3. Confirm ordinary `deploy` is skipped and only `deploy-reviewed-candidate`
   executes, at exact checkout `ecc776998a6ae1cbca92b92714e42a74cff6c9f1`.
4. Verify 334 pinned checks, all seven hashes, the real existing Worker/D1
   identity gate, and a successful exact version receipt. CI or a successful
   preflight alone is not deployment success.
5. Preserve unsynced work before safely refreshing relevant Development clients.
   Do not clear storage, switch a populated workspace or touch Production.

## Live acceptance and release hold

Live operations remain separate. First read the two existing ownership
baselines without repeating Create. A fresh create-acknowledgement test needs a
new disposable normal-UI record and its approved scope. Foreign writes and
Shared publication require their specific approvals; irreversible deletions
require named action-time confirmation. No cleanup is implied.

Same-workspace switching, real D1 acknowledgement behavior, multi-tab/durability,
hung requests, device/map behavior and Production composition/backup/restore
remain distinct release gates. PR #80 stays draft and unmerged. The separate
Cloudflare Workers Builds check on ecc77699 failed with no diagnostic text or
annotations; its cause is unknown and is not erased by successful Actions.
