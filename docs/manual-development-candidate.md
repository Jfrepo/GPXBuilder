# Guarded Development preparation for responsive toolbar ownership

This six-file preparation pins immutable runtime
`492f222a7ffa8c1337786b8b699ef5c7f56d54d1`. Publication and preparation CI do not
authorize or start deployment, merge, migration, private configuration changes,
live tests, or a PR-description edit.

## Current versus proposed state

Development currently runs `583badd5be6c760c8824b4ebec1a92f515a35742`, Worker
version `ed770bc6-bc42-4f5b-abe3-8c9ae5957c10`, from the verified
[user-started deployment](https://github.com/Jfrepo/GPXBuilder/actions/runs/39212038703).
The existing ownership harness and private identifier bindings remain present.
Do not recreate baseline records, change sign-ins, or clear application storage.

The proposed runtime gives the existing toolbar one responsive placement owner,
keeps the mobile ribbon under the dock, and safely checks fallback anchors. It
corrects repeated-narrow-resize exceptions and cold-desktop mobile initialization
without changing saved track visibility or persistence. Its exact published tree
is `96d406cbca0e9c7bbcd3a8770d7931638d073655`.
[Runtime CI 39246193094](https://github.com/Jfrepo/GPXBuilder/actions/runs/39246193094)
independently passed **375 source checks and 83 Chromium test nodes**, zero
failures, cancellations or skips, on attempt 1. Both jobs checked out merge
`ef3ea103ffde12e49dbddeedad6ece4d7faf93bd`, whose tree equals the reviewed head.
Both new full-page toolbar cases executed. The 12 new emitted source cases
produce 10 failures and two passing controls against the prior runtime; they
are included in the 375 total, not additional tests. Eight separate independent
responsive-layout checks passed the correction and failed the old behavior;
base-only controls passed both versions and are not added to CI totals.

These checks use isolated fixtures. Native browser DOM, viewport events,
IndexedDB and WebCrypto execute, but remote APIs and map-provider behavior are
substituted. Physical-pointer targets, mobile swipe/overflow, real map-provider
performance and live toolbar/reload acceptance remain separate. The original
live user action sequence is not established. Both changed application files
are shared with the Production composition, but this preparation deploys neither
and does not establish Production readiness. No favicon or Maps-loader fix is
included.

## Exact six-file preparation

1. `.github/workflows/cloudflare-dev.yml`: update only the two fixed
   checkout/assertion values and add index/mobile dependencies' ninth and tenth
   hashes. The full pinned source command stays byte-identical.
2. `tests/deployment-guard.test.cjs`: select the new immutable pin and exact
   fixtures; prove changed/missing index/mobile bytes fail before any API call
   or runner-local configuration write.
3. `tests/workflow-boundaries.test.cjs`: update only the reviewed manual-job
   byte hash and its descriptive label. All other boundary assertions remain.
4. `tests/fixtures/reviewed-toolbar-index-492f222a.txt`: exact published
   `index.html` bytes, not a runtime import.
5. `tests/fixtures/reviewed-mobile-layout-492f222a.txt`: exact published
   `worker-mobile-layout.js` bytes, not a runtime import.
6. This document.

All eight prior hashes and all prior fixtures remain unchanged. No application
source, committed Wrangler configuration, Production workflow, permission,
event trigger, database schema, or private binding value changes here.

## Ten integrity attestations

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
| `index.html` | `35fb0b1604007e342b294fc41dd8c1352312eba55bded4a9c252964b58a03da3` |
| `worker-mobile-layout.js` | `5e76ccbe66d15f93c0dc3beea3d6d850fedbd1bebbd8a4eb9833bf9c5730acad` |

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

A later approved manual run checks out **492f222a** and reruns its **375** source
checks, followed by a clean diff assertion. Its historical guard tests exercise
the earlier 583badd5-pinned workflow stored in that commit, not the newly selected
workflow definition.

The selected preparation is tested separately. Local selected-guard and
workflow-boundary tests pass **55/55** (22 guard checks plus 33 boundary checks).
The full local preparation command passes **377/377**, zero failures,
cancellations or skips. The two additional tests cover the newly attested
responsive-toolbar dependencies. Exact-head preparation CI and independent
verification are required before any manual run instructions; local results do
not imply hosted browser completion.

## Separate Cloudflare build uncertainty

The separate `Workers Builds: mancardo` check **118038661203** on runtime 492f222a
failed with null diagnostic text and zero annotations. Successful Actions do not
erase it. The exact new build is `f759533d-1feb-420e-906a-bfb74cbeb824`.
Only its GitHub metadata has been inspected; its dashboard log, command, cause
and whether it reached upload or deployment remain unverified. Prior builds'
missing-preview-configuration diagnosis does not establish this new build's
cause. A `/production/` dashboard path alone proves neither a deployment attempt
nor a live change. No login, build retry or preview configuration change is
included. This separate uncertainty must be assessed before deployment clearance.

## Later user-started run, only after separate clearance and approval

After assessing the separate build uncertainty and verifying preparation CI:

1. Obtain explicit approval for Development deployment. Preparation approval is
   not deployment approval. Retain the existing private bindings without new
   authentication, policy, or permission changes.
2. Open [the Development workflow](https://github.com/Jfrepo/GPXBuilder/actions/workflows/cloudflare-dev.yml),
   select `chatgpt/mancardo-delete-qualification`, and start a **NEW Run workflow**.
   Do not use Re-run jobs, which retains the old selected workflow and pin.
3. Confirm ordinary `deploy` is skipped and only `deploy-reviewed-candidate`
   executes at exact checkout `492f222a7ffa8c1337786b8b699ef5c7f56d54d1`.
4. Verify 375 pinned checks, all ten hashes, the real Worker/D1 identity gate,
   redacted retained bindings and a successful version receipt. A passing
   preflight is not deployment success.
5. Preserve unsynced work before safely refreshing Development clients. Do not
   clear storage, switch a populated workspace, or touch main Production.

Live toolbar, selection, note, sharing, account-switch, multi-tab/durability,
hung-request and map/device checks remain separate from deployment. Previously
bounded live passes do not qualify all of these gates. No new record creation,
edit, delete, Shared publication or cleanup is authorized by this preparation.
Irreversible deletion requires named action-time confirmation. PR #80 stays draft
and unmerged; Production composition, narrow asset packaging, backup/restore and
release acceptance remain on hold.
