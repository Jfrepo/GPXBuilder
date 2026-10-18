# Guarded manual Development preparation: note preservation

The user approved this public preparation on 2026-10-18 at 08:44:16 UTC.
**This update does not deploy automatically.** PR #80 remains draft and
unmerged. Production and existing main/dev branches are unchanged.
Development still runs `fde3864c5fb621b5c8c9a3ef28ad596b6202a3f6`, Worker
version `a9e7dba3-43ea-43a1-9bda-e8c601778ea3`, until a new user-started run
successfully deploys the reviewed correction.

## Fixed target and checks

- Runtime: immutable tested commit `bffa68b7624a504de03d335361d1467d80964ce5`.
  [Exact-head CI 39111794504](https://github.com/Jfrepo/GPXBuilder/actions/runs/39111794504)
  passed 159 source checks and 42 Chromium cases, zero failures, cancellations
  or skips. The tested merge tree equals this runtime's tree.
  Application bytes are identical to the previously reviewed note correction
  at `b292df32ec5e5306c6312a31390729f990a3e5df`. This successor changes only
  the test fixture to wait for a committed outbox transaction rather than a
  fixed number of event-loop turns. A held real digest regression retains the
  original content, owner, revision and server assertions.
- Development Worker: `mancardo-dev-test` only.
- Database: existing `mancardo-private-library-dev`, with its secret UUID
  checked against the read-only API response and the existing Worker's exact
  D1 binding. The Production UUID is rejected case-insensitively.
- Wrapper SHA256: `f3332f09cb228240273c7551f022dd355228b33c8dfec52d66abc2846345381d`.
- Unchanged helper SHA256: `66679a8340c33f53b85dfc27823c461cb720e900c5c5c2c08ac453346438f53e`.
- Unchanged Dev config SHA256: `e5237a94e142e693b8a3697b8259787adf35b7faba877a950ff21321aef78bea`.
- Both runtime files and configuration must match before API access or local
  config injection. Missing/changed helper or wrapper fails closed.
- The pinned checkout reruns all **159** checks, including the historical guard
  suite stored at bffa68b7. That suite tests the previous fde3864c pin, not the
  newly selected workflow. The selected workflow's **13** guard tests run
  separately in preparation PR CI, which also runs all 159 source checks and
  42 Chromium cases. The actual selected inline identity guard executes during
  the later user-dispatched deployment.
- Event, exact feature-branch, environment, credentials, permissions, targets,
  read-only identity checks and pinned Wrangler deploy command are unchanged.
  No live D1 SQL queries, migrations, resets, reseeding or track writes occur
  in this workflow. Source tests use disposable in-memory SQLite only.

## User action after independent preparation CI passes

1. Open [the Development workflow](https://github.com/Jfrepo/GPXBuilder/actions/workflows/cloudflare-dev.yml).
2. Choose **Run workflow**, then **Use workflow from**
   `chatgpt/mancardo-delete-qualification`. Start a **NEW** run, not Re-run jobs;
   a rerun keeps the old workflow/pin.
3. In the new run, original job `deploy` must be skipped. Only
   `deploy-reviewed-candidate` may deploy. Checkout must be exactly
   `bffa68b7624a504de03d335361d1467d80964ce5`.
4. Wait for successful integrity/identity gates and the exact Development
   version receipt. Do not treat preparation CI alone as a deployment.
5. Save unsynced work, then refresh or close all older Development clients
   before a new live test. Do not clear storage, alter identities or touch
   Production. A new login is not part of these instructions.

## Acceptance remains separate

The correction retains notes verbatim in conflict copies and leaves recovery
reasons in the existing session-local conflict indicator. It has passed
isolated fixtures, not live unsynced-note acceptance. After a separately
approved deployment and safe refresh, use one new disposable synthetic track
for a bounded offline-note test. Any irreversible online deletion needs exact
named action-time approval. Preserve the original tombstone and the recovered
copy; no cleanup or existing-track mutation is implied.

Live foreign-account writes, same-workspace account switching, broader device
coverage, backup/restore proof and pending/conflict UX remain separate release
gates. The unrelated Cloudflare Workers Builds failure has no exposed cause;
do not equate it with the no-deploy Actions results or deployment identity
checks.
