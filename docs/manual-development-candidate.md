# Prepare the reviewed request-cadence correction for Development

The user approved this preparation on 2026-10-18 at 06:43:52 UTC. **This update does not deploy automatically.** PR #80 remains draft and unmerged. Production and existing main/dev branches are unchanged. Until the user starts a new run successfully, Development still runs `91af34b8532609bbc5735aa9fd5718b7a23c50a2`, Worker version `bc2a6e2b-6c5d-492b-8dea-a44c15ba6c54`.

## Exact runtime, destination and safeguards

- Runtime: immutable tested commit `fde3864c5fb621b5c8c9a3ef28ad596b6202a3f6`, verified by 147 source/client/guard checks and 40 Chromium cases in [CI 39103649930](https://github.com/Jfrepo/GPXBuilder/actions/runs/39103649930).
- Wrapper SHA256: `0872bd1b56c9cb279e1bd9d29706624d2c2428727a8784cecdfda98e9103ef2a`.
- New helper SHA256: `66679a8340c33f53b85dfc27823c461cb720e900c5c5c2c08ac453346438f53e`.
- Unchanged Dev config SHA256: `e5237a94e142e693b8a3697b8259787adf35b7faba877a950ff21321aef78bea`.
- Workflow: **Deploy Mancardo Development Worker**, `.github/workflows/cloudflare-dev.yml`.
- Selected branch: `chatgpt/mancardo-delete-qualification`; exact manual-only job `deploy-reviewed-candidate`.
- Destination: only existing Worker `mancardo-dev-test`, configuration `wrangler.dev.toml`, Wrangler 4.151.1, existing D1 `mancardo-private-library-dev`.
- The identity guard still rejects the Production UUID case-insensitively, verifies actual D1 UUID/name, verifies the existing Development Worker's exact single D1 binding, and now attests both immutable runtime files plus config before any API access or configuration injection. It uses GET only, rejects redirects, and never logs credential values. Missing or changed helper bytes fail closed.
- Existing credentials, permissions and environment access are reused, not expanded. Failed protection, identity or source checks stop before deployment. No live D1 SQL queries, migrations, resets, reseeding or track writes occur; tests use disposable in-memory SQLite only.
- The pinned runtime checkout reruns all 147 checks, including the historical guard suite stored at fde3864c. That historical suite tests the older 91af34b deployment pin, not the newly selected workflow. The newly selected workflow's 12 guard tests run independently in preparation PR CI, bringing that source suite to 149 checks; all 40 Chromium cases also rerun. The actual selected inline identity guard executes during the user-dispatched deployment.
- This changes active Development code, not an isolated preview. The dedicated database and its existing records remain in place. Subsequent tests are limited to newly created disposable synthetic tracks. A green deployment is not live traffic or data-preservation acceptance.

## User steps only after preparation review and CI pass

1. Open [Deploy Mancardo Development Worker](https://github.com/Jfrepo/GPXBuilder/actions/workflows/cloudflare-dev.yml). Do not choose the separate Production workflow.
2. Start a **NEW Run workflow**. Select exactly `chatgpt/mancardo-delete-qualification` under **Use workflow from**, then click **Run workflow**. Do not use **Re-run jobs** on an earlier run: reruns keep that run's older workflow and runtime pin.
3. Open the new run. Original job `deploy` must be skipped; only `deploy-reviewed-candidate` may deploy. Checkout must be exactly `fde3864c5fb621b5c8c9a3ef28ad596b6202a3f6`.
4. If protection/identity checks block it, stop and report the result. Do not broaden access, change targets, bypass guards or substitute Production credentials.
5. On success, record the new run URL and Worker version. Green deployment alone does not prove live note/deletion persistence or bounded request traffic.
6. Before testing, fully refresh or close **every existing Development tab/browser/device**, including background clients, without clearing storage or losing unsaved work. Old clients can retain the prior request-feedback behavior. If a client cannot be refreshed safely, postpone testing. Continue using separate account profiles.

The user must start the workflow in their authenticated GitHub session; no automatic dispatch is performed. Existing branch allowlisting is unchanged. Any irreversible synthetic deletion needs separate confirmation for the exact named track. Never test on existing tracks or Production. Unresolved-request recovery, intermediate status clarity, the Sync-now capture/reload shim, and broader live account-switch/write-isolation remain separate release limits.
