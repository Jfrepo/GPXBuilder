# Prepare the reviewed cross-client correction for Development

The user approved this preparation on 2026-10-17 at 22:19:45 UTC. **Not deployed by this update.** The PR remains draft and unmerged. Production and existing main/dev branches are unchanged.

## Exact runtime, destination and safeguards

- Runtime: immutable tested commit `3d7a43b23b6ddc12a96074425c0e87c2c4c76685` (70 source/client/guard checks and 19 Chromium cases passed in CI 39074459056).
- Workflow: **Deploy Mancardo Development Worker**, `.github/workflows/cloudflare-dev.yml`.
- Selected branch: `chatgpt/mancardo-delete-qualification`; exact manual-only job `deploy-reviewed-candidate`.
- Destination: only Worker `mancardo-dev-test`, configuration `wrangler.dev.toml`, Wrangler 4.151.1, existing D1 `mancardo-private-library-dev`.
- The unchanged identity guard rejects the Production UUID, verifies actual D1 UUID/name, verifies that the existing Development Worker has exactly the same D1 binding, and checks immutable runtime/config hashes before deployment. Its verification uses GET only, rejects redirects, and never logs credential values.
- Existing credentials and environment access are reused, not expanded. Missing permissions/identity stop before deployment. No migrations, SQL queries, resets, reseeding or track writes are part of the workflow.
- The runtime checkout reruns its 61 runtime checks (35 original, 13 full-sync, 13 independent safety). The newly selected workflow's 9 guard-fixture tests run separately in PR CI; the real inline identity guard executes during the user-dispatched deployment.
- This changes active Development code, not an isolated preview. The dedicated database and existing records remain in place. Subsequent tests are limited to newly created tagged synthetic tracks.

## User steps after the prepared branch and CI are verified

1. Open [Deploy Mancardo Development Worker](https://github.com/Jfrepo/GPXBuilder/actions/workflows/cloudflare-dev.yml). Do not choose the separate Production workflow.
2. Start a **NEW Run workflow**. Select exactly `chatgpt/mancardo-delete-qualification` under **Use workflow from**, then click **Run workflow**. Do **not** use **Re-run jobs** on the earlier run 39069567577: that retains the old workflow and old 63dc68e pin.
3. Open the new run. The original `deploy` job must be skipped; only `deploy-reviewed-candidate` may deploy. The runtime checkout must be exactly 3d7a43b23b6ddc12a96074425c0e87c2c4c76685.
4. If protection/identity checks block it, stop and report the result. Do not broaden access, change the target, bypass a guard or substitute Production credentials.
5. On success, record the new run URL and Worker version. A green deployment alone is not a live persistence pass.
6. Before the disposable-track test, fully refresh or close **every existing Development tab/browser/device** that could sync this account, including background clients. An old already-open client still carries the unconditional recovery-copy bug even after the server deployment. Do not clear storage, unsaved work or user tracks. If an old client cannot be refreshed safely, postpone the test.

The connector cannot dispatch the workflow; the user's authenticated GitHub session must start it. Existing explicit branch allowlisting is unchanged. Any new irreversible synthetic test deletion will be confirmed separately at the named-track step. Never test on existing tracks or Production.
