# Guarded manual Development preparation: two-record ownership page

This four-file public preparation was approved on 2026-10-18 at 11:09:29 UTC.
**It does not deploy, configure private identifiers, create records or run live
probes.** PR #80 stays draft and unmerged. Main, ordinary Development branches,
Production configuration and authentication permissions are unchanged.

Development currently runs `bffa68b7624a504de03d335361d1467d80964ce5`, version
`5829bdeb-0b77-4ddc-bb7c-d3383424f30b`. The ownership page is not deployed by
publishing this preparation. Do not start a workflow until the separate
configuration, Access-coverage and deployment approvals below are complete.

## Immutable candidate and guard

- Fixed checkout: `fe10024e79143d47fbaf86a3864f69db60fa7200`.
  [Exact-head CI 39121604464](https://github.com/Jfrepo/GPXBuilder/actions/runs/39121604464)
  independently passed 213 source checks and 62 Chromium nodes, with zero
  failures, cancellations or skips. This includes 42 existing browser nodes
  and 19 new ownership scenarios plus their parent. The actual merge checkout
  has exactly the candidate's tree. These are isolated fixtures, not live tests.
- Only Worker `mancardo-dev-test` and its existing database
  `mancardo-private-library-dev` are eligible. The real read-only API guard
  verifies the exact database UUID/name and existing Worker's single D1
  binding. Production's UUID is rejected case-insensitively.
- Attested entrypoint: `worker-owner-qualification.js`, SHA256
  `8c1f2f39458a71cc155b96c5a2ace2abf0b638e2c0b2ece5613d43410d89ebd5`.
- Unchanged application wrapper SHA256:
  `f3332f09cb228240273c7551f022dd355228b33c8dfec52d66abc2846345381d`.
- Unchanged cadence helper SHA256:
  `66679a8340c33f53b85dfc27823c461cb720e900c5c5c2c08ac453346438f53e`.
- Unchanged committed Dev config SHA256:
  `e5237a94e142e693b8a3697b8259787adf35b7faba877a950ff21321aef78bea`.
- Asset-exclusion file SHA256: `b5abc5b4c9dffc6819fd542711396a4734fe52ce295d75b032cef3edf4eacce6`. This unchanged file
  excludes the configured Wrangler file and private local environment files
  from static asset upload.
- Missing/changed source or configuration, missing/malformed/duplicate owner
  bindings, and invalid Development identity fail closed before configuration
  is written. Source/private-binding failures precede any Cloudflare API call.
- The pinned checkout reruns its full **213** source checks. Its historical
  guard tests still exercise the bffa68b7 workflow stored in that commit, not
  this new selected workflow. The selected workflow's **18** guard checks run
  separately in preparation PR CI, whose expected totals are **218** source
  checks and **62** Chromium nodes. Preparation results are pending until the
  exact published head completes and receives independent verification.

The original deploy job, event/branch restrictions, Development environment,
permissions and existing credentials are unchanged. The candidate job still
requires both a manual event and the exact feature branch. No live D1 queries,
migrations, resets, reseeding or track writes occur in the workflow; source
tests use disposable in-memory SQLite. The real deployment guard runs only
in a later user-started deployment.

## Private configuration: separate prerequisite, not performed here

The future manual job requires two distinct, verified lower-case 24-hex
account identifiers from Development environment secrets named
`MANCARDO_QUALIFICATION_ACCOUNT_A` and `MANCARDO_QUALIFICATION_ACCOUNT_B`.
These are consistency identifiers, not passwords, tokens or new credentials.
No real values are in these four files. Do not infer them from browser role
selection or a current session, and do not publish them in source or receipts.

Separately approve and verify each value against its intended already-signed-in
identity. Configuration creation is not authorized by this preparation. The
workflow does not create or update GitHub secrets or authentication settings.
Existing Cloudflare Access policy coverage of the exact page route must also
be verified without broadening a policy. An expired session or new login
prompt stops the process rather than authorizing sign-in.

After all integrity and identity checks succeed, the job changes only its
runner-local copy of `wrangler.dev.toml`: inject the verified Development D1
UUID, select `worker-owner-qualification.js`, and add the exact run identifier
`owner-isolation-20261018-1032` with the two owner identifiers. All other config
bytes must remain unchanged. A future deployment transmits those identifiers
to the existing Cloudflare account as Worker variable bindings, visible to
its authorized administrators. It does not create new security credentials.
The committed Wrangler file remains unchanged.

The pinned Wrangler command and target are unchanged. An inline subprocess
wrapper captures bounded stdout/stderr and redacts supplied private values
before printing either stream; it does not depend solely on GitHub's secret
masking. Values are not command-line arguments. No configured file or raw
subprocess output is uploaded as an artifact. Subprocess exit status is
preserved; uncertain completion requires inspecting the actual Worker version
before any retry. No automatic retry is added.

## Later manual deployment, only after separate approval

Once exact-head preparation CI is independently verified, the two private
bindings and existing Access coverage are verified, and deployment is approved:

1. Open [the Development workflow](https://github.com/Jfrepo/GPXBuilder/actions/workflows/cloudflare-dev.yml).
2. Choose **Run workflow**, then select
   `chatgpt/mancardo-delete-qualification`. Start a **NEW** run, never Re-run
   jobs, which would retain an earlier workflow and pin.
3. Original job `deploy` must be skipped. Only `deploy-reviewed-candidate`
   may run, with checkout exactly `fe10024e79143d47fbaf86a3864f69db60fa7200`.
4. Verify all 213 pinned checks, five integrity hashes, private-binding checks,
   real Development identity checks and the exact deployed version receipt.
   Do not confuse CI or a guard result with completed deployment.
5. Preserve unsynced work and safely refresh only relevant Development clients.
   Do not clear storage, switch populated workspaces or alter Production.

## Live operations remain a separate decision

The page performs no automatic requests or writes. It targets only the two
fixed synthetic IDs described in the [reviewed harness protocol](owner-isolation-harness-proposal-20261018.md),
without loading the editor, listing tracks or accessing app storage.
Both owners must first provide positive controls for their own new live
revision-1 fixture. Each later foreign PUT and DELETE requires the specified
approval, exact target and expected rejection; a protection defect could
alter or permanently delete the disposable target. Do not treat an absent
fixture or generic authentication failure as a successful ownership test.
No cleanup is implied.

Separate profiles do not qualify same-workspace account switching. That live
gate, broader device coverage and general release approval remain open. The
separate Cloudflare Workers Builds failure on the candidate has no exposed
cause; it is distinct from successful no-deploy Actions checks and the later
manual deployment guard.
