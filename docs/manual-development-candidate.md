# Prepare the reviewed account-boundary correction for Development

The user approved this preparation on 2026-10-18 at 00:35:45 UTC. **This update does not deploy automatically.** PR #80 remains draft and unmerged. Production and existing main/dev branches are unchanged. Until the user starts a new run successfully, Development still runs 3d7a43b, version 18897d7e-ba1e-4d14-92dd-ca910817ac55.

## Exact runtime, destination and safeguards

- Runtime: immutable tested commit `91af34b8532609bbc5735aa9fd5718b7a23c50a2`, verified by 93 source/client/guard checks and 25 Chromium cases in [CI 39083071375](https://github.com/Jfrepo/GPXBuilder/actions/runs/39083071375).
- Runtime SHA256: `d578367b47fddb4902560eb89fa07f0309b40d5184dea279e3b4489d2613025f`.
- Workflow: **Deploy Mancardo Development Worker**, `.github/workflows/cloudflare-dev.yml`.
- Selected branch: `chatgpt/mancardo-delete-qualification`; exact manual-only job `deploy-reviewed-candidate`.
- Destination: only existing Worker `mancardo-dev-test`, configuration `wrangler.dev.toml`, Wrangler 4.151.1, existing D1 `mancardo-private-library-dev`.
- The unchanged identity guard rejects the Production UUID case-insensitively, verifies actual D1 UUID/name, verifies the existing Development Worker's exact single D1 binding, and checks immutable runtime/config hashes. It uses GET only, rejects redirects, and never logs credential values.
- Existing credentials and environment access are reused, not expanded. Failed protection, identity or source checks stop before deployment. No live D1 SQL queries, migrations, resets, reseeding or track writes occur; tests use disposable in-memory SQLite only.
- The pinned runtime checkout reruns 83 runtime checks. It deliberately excludes the historical deployment-guard suite within that checkout, which tests the older workflow stored at that commit. The newly selected workflow's 10 guard-fixture tests run separately in PR CI; the actual current inline identity guard executes during the user-dispatched deployment.
- This changes active Development code, not an isolated preview. The dedicated database and its existing records remain in place. Subsequent tests are limited to newly created disposable synthetic tracks.

## User steps after the prepared branch and CI are verified

1. Open [Deploy Mancardo Development Worker](https://github.com/Jfrepo/GPXBuilder/actions/workflows/cloudflare-dev.yml). Do not choose the separate Production workflow.
2. Start a **NEW Run workflow**. Select exactly `chatgpt/mancardo-delete-qualification` under **Use workflow from**, then click **Run workflow**. Do not use **Re-run jobs** on an earlier run: reruns keep that run's older workflow and runtime pin.
3. Open the new run. Original job `deploy` must be skipped; only `deploy-reviewed-candidate` may deploy. Checkout must be exactly 91af34b8532609bbc5735aa9fd5718b7a23c50a2.
4. If protection/identity checks block it, stop and report the result. Do not broaden access, change targets, bypass guards or substitute Production credentials.
5. On success, record the new run URL and Worker version. Green deployment alone does not prove live note or deletion persistence.
6. Before testing, fully refresh or close **every existing Development tab/browser/device**, including background clients, without clearing storage or losing unsaved work. Old clients without the new PUT owner binding fail closed, leaving edits local until refreshed. If a client cannot be refreshed safely, postpone testing. Continue using separate account profiles.

The user must start the workflow in their authenticated GitHub session; no automatic dispatch is performed. Existing branch allowlisting is unchanged. Any irreversible synthetic deletion needs separate confirmation for the exact named track. Never test on existing tracks or Production.
