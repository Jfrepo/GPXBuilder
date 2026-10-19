# Guarded Development preparation for selection-highlight isolation

This five-file preparation pins immutable runtime
`583badd5be6c760c8824b4ebec1a92f515a35742`. Publication and preparation CI do not
authorize or start deployment, merge, migration, private configuration changes,
live tests, or a PR-description edit.

## Current versus proposed state

Development currently runs `ecc776998a6ae1cbca92b92714e42a74cff6c9f1`, Worker
version `060d5646-144f-4e5f-842c-a718ec0eab78`, from the verified
[user-started deployment](https://github.com/Jfrepo/GPXBuilder/actions/runs/39166337889).
The existing ownership harness and private identifier bindings remain present.
Do not recreate baseline records, change sign-ins, or clear application storage.

The proposed runtime separates temporary selection highlighting from saved
track visibility. Explicit Show and Show-all changes still persist. Its exact
published tree is `64db35e113811ddf11ee75226d0e2faf9981af6f`.
[Runtime CI 39190188595](https://github.com/Jfrepo/GPXBuilder/actions/runs/39190188595)
independently passed **362 source checks and 81 Chromium test nodes**, zero
failures, cancellations or skips, on attempt 1. Both jobs checked out merge
`a6f6bd13fab32cd1c56db1c483b4baf397450651`, whose tree equals the reviewed head.
All 17 new browser cases executed. Fourteen separate independent emitted-client
regressions passed against the correction and failed their preservation
assertions against the older code; these are not added to the CI totals.

These checks use isolated fixtures. They do not establish physical-pointer
behavior, real map-provider performance, live selection acceptance, or the
cause of the previously observed visibility-only live write. The rendering
module is shared by Development and Production import chains, but this
preparation deploys neither and does not establish Production readiness.

## Exact five-file preparation

1. `.github/workflows/cloudflare-dev.yml`: update only the two fixed
   checkout/assertion values and add the rendering dependency's eighth hash.
   The full pinned source command stays byte-identical.
2. `tests/deployment-guard.test.cjs`: select the new immutable pin and exact
   rendering fixture; prove changed/missing rendering bytes fail before any
   API call or runner-local configuration write.
3. `tests/workflow-boundaries.test.cjs`: update only the reviewed manual-job
   byte hash and its descriptive label. All other boundary assertions remain.
4. `tests/fixtures/reviewed-selection-highlight-583badd5.txt`: the exact already
   published `worker-waypoint-zoom.js` bytes, not a runtime import.
5. This document.

All seven prior hashes and all prior fixtures remain unchanged. No application
source, committed Wrangler configuration, Production workflow, permission,
event trigger, database schema, or private binding value changes here.

## Eight integrity attestations

| File | SHA-256 |
|---|---|
| `.assetsignore` | `b5abc5b4c9dffc6819fd542711396a4734fe52ce295d75b032cef3edf4eacce6` |
| `wrangler.dev.toml` | `e5237a94e142e693b8a3697b8259787adf35b7faba877a950ff21321aef78bea` |
| `worker-delete-durable-fix.js` | `f4f308b02da20ecad956b6d8e588f21fdf2aa128af25e9a978b2eb6570bd42bd` |
| `worker-private-library-sync.js` | `e56eba2c67972294678442f8822d7818e5d907d67668b47c92a3c9f4cec95191` |
| `worker-shared-library-cloud.js` | `8239c8d8b9bff0298c7195747c1fc4aaedf8a60996ab8ac7023c971e4d6ee449` |
| `worker-request-cadence.js` | `66679a8340c33f53b85dfc27823c461cb720e900c5c5c2c08ac453346438f53e` |
| `worker-owner-qualification.js` | `8c1f2f39458a71cc155b96c5a2ace2abf0b638e2c0b2ece5613d43410d89ebd5` |
| `worker-waypoint-zoom.js` | `5edbb603b7454d521a55b26a55b5bf39e6c78a9111625d93b80fa9dd4805d40d` |

The immutable checkout fixes all imported dependency bytes. These hashes
additionally attest named safety-critical files. Missing or changed attested
files fail before Cloudflare API access or runner-local configuration writes.

## Preserved deployment boundaries

Only a manual event from `chatgpt/mancardo-delete-qualification` can select the
reviewed candidate job. Existing event/ref restrictions, `development`
environment, credentials, permissions, target serialization and private-output
redaction are unchanged. The ordinary deploy job must be skipped for this branch.

The same read-only API guard verifies the exact existing database UUID/name
`mancardo-private-library-dev` and single D1 binding of `mancardo-dev-test`;
Production's UUID is rejected in either case. Existing private identity values
must be distinct, exact lower-case 24-hex strings. Neither values nor credentials
are added to source, command-line arguments, logs or artifacts. No secret or
Access-policy configuration is created or changed. Existing runner-only config
injection and ownership run identifier remain unchanged.

Wrangler `4.151.1` still targets only `mancardo-dev-test`. Captured output is
redacted; uncertain/truncated output is discarded. Uncertain deployment completion
requires checking the actual version before any retry; no automatic retry is added.

No live D1 SQL query, migration, reset, reseed or track write occurs in this
workflow. Tests use disposable in-memory SQLite. Production and ordinary
Development safeguards remain byte-identical.

## Pinned runtime checks versus selected preparation checks

A later approved manual run checks out **583badd5** and reruns its **362** source
checks, followed by a clean diff assertion. Its historical guard tests exercise
the earlier ecc-pinned workflow stored in that commit, not the newly selected
workflow definition.

The selected preparation is tested separately. Local selected-guard and
workflow-boundary tests pass **53/53** (20 guard checks plus 33 boundary checks).
The full local preparation command passes **363/363**, zero failures,
cancellations or skips. The additional test is the selected rendering-dependency
guard. Exact-head preparation CI and independent verification are required before
any manual run instructions; local results do not imply hosted browser completion.

## Separate Cloudflare build uncertainty

The separate `Workers Builds: mancardo` check **117861137681** on the runtime
commit failed with null diagnostic text and zero annotations. Successful Actions
do not erase it. A read-only attempt to inspect its exact dashboard build reached
a Cloudflare sign-in page; no new login or build retry was performed. Its cause
and whether it reached a deployment phase remain unverified. A `/production/`
dashboard path alone proves neither a deployment attempt nor a live change.
This uncertainty remains a deployment hold until separately resolved; this
preparation and its CI are not clearance to proceed.

## Later user-started run, only after separate clearance and approval

After resolving the separate build uncertainty and verifying preparation CI:

1. Obtain explicit approval for Development deployment. Preparation approval is
   not deployment approval. Retain the existing private bindings without new
   authentication, policy, or permission changes.
2. Open [the Development workflow](https://github.com/Jfrepo/GPXBuilder/actions/workflows/cloudflare-dev.yml),
   select `chatgpt/mancardo-delete-qualification`, and start a **NEW Run workflow**.
   Do not use Re-run jobs, which retains the old selected workflow and pin.
3. Confirm ordinary `deploy` is skipped and only `deploy-reviewed-candidate`
   executes at exact checkout `583badd5be6c760c8824b4ebec1a92f515a35742`.
4. Verify 362 pinned checks, all eight hashes, the real Worker/D1 identity gate,
   redacted retained bindings and a successful version receipt. A passing
   preflight is not deployment success.
5. Preserve unsynced work before safely refreshing Development clients. Do not
   clear storage, switch a populated workspace, or touch main Production.

Live selection, note, sharing, account-switch, multi-tab/durability, hung-request
and map/device checks remain separate from deployment. Previously bounded live
passes do not qualify all of these gates. No new record creation, edit, delete,
Shared publication or cleanup is authorized by this preparation. Irreversible
deletion requires named action-time confirmation. PR #80 stays draft and unmerged;
Production composition, backup/restore and release acceptance remain on hold.
