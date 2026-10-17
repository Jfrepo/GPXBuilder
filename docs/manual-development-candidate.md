# Manual Development-only candidate deployment

This is a prepared route, **not an executed deployment**. The PR remains draft and unmerged. No Production or existing Development branch is changed by preparing it.

## Exact target and safeguards

- Workflow: **Deploy Mancardo Development Worker**, `.github/workflows/cloudflare-dev.yml`.
- Select branch: `chatgpt/mancardo-delete-qualification`.
- Manual-only job: `deploy-reviewed-candidate`; it cannot run on a push or PR event.
- Runtime checkout is pinned to tested commit `63dc68e2eb4703a24a9bf607869ea3770baa3164`, regardless of the branch's later workflow-only commits.
- Destination is only Worker `mancardo-dev-test`, using `wrangler.dev.toml` and Wrangler `4.151.1`.
- The guard verifies exact runtime/config hashes, rejects the Production D1 UUID in either case, verifies actual Cloudflare D1 UUID/name (`mancardo-private-library-dev`), and verifies the existing Development Worker already uses that same database. Verification makes only GET requests, with redirects rejected.
- Existing Development credentials are reused without revealing values or expanding permissions. Any missing access, identity mismatch or API failure stops before deployment. No migrations, SQL queries, reset/reseed, or track mutation is performed by this workflow.
- This updates the active Development app, not an isolated preview. The dedicated database and all existing records are retained. Subsequent mutating acceptance tests must use only newly created, clearly tagged synthetic tracks.

## User Run workflow steps

1. In `Jfrepo/GPXBuilder`, open **Actions**, then **Deploy Mancardo Development Worker**. Do not choose the separate Production workflow named **Deploy Mancardo to Cloudflare Workers**.
2. Click **Run workflow**. Under **Use workflow from**, select exactly `chatgpt/mancardo-delete-qualification`, then click **Run workflow**. There are no input fields to fill.
3. Open the new run. The original `deploy` job should be skipped for this branch. The job that may proceed is `deploy-reviewed-candidate`.
4. If a Development environment review is required, review the exact branch/job/target before approving. If branch policy, missing credentials or identity verification blocks the run, stop and report it; do not broaden permissions, change the target, or substitute Production credentials.
5. A successful run must show the fixed runtime SHA, successful identity verification, and a successful deployment of `mancardo-dev-test`. Record the run URL and emitted Worker version before any browser acceptance tests.

The available GitHub connector cannot start a new manual workflow run. These steps therefore require the user's authenticated GitHub session, or separately authorized browser access. The workflow already exists on default `main`, allowing GitHub to dispatch its selected-branch copy without a merge: [GitHub manual workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## After a successful deployment

First verify map/library loading and the exact deployed version. Then use only new synthetic tracks to test confirmed deletion, manual refresh, automatic reconciliation, offline/reconnect, two-device conflicts and account isolation. Do not delete or edit AAAAAA or other existing tracks as a test. Do not enable Preview URLs, change Production, run migrations or reseed data.

The candidate's fail-closed limitation remains: unsynced/local-only tracks without a known reconciled revision are preserved and cannot yet be deleted. Successful isolated CI is not a claim of authenticated Development/D1 acceptance.
