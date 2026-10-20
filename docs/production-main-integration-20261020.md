# Local main integration — Production HOLD

## Authorization and checkpoints

This is the bounded cloud-only local integration approved on Oct20. No push, PR,
remote merge, workflow dispatch, deployment, live-app/data access, credential change,
persistent database creation/restore/migration or Mac access occurred.

Preserved original candidate branch `chatgpt/mancardo-production-candidate` at
`69c95f82f99f99f962d9114aa2ba83d1aad321d9`, and created explicit local recovery branch
`checkpoint/mancardo-production-69c95f82` at the same commit. Original checkout
`/workspace/GPXBuilder` remains untouched. Integration uses branch
`chatgpt/mancardo-production-integrated` in `/workspace/mancardo-production-candidate`.

Read-only `git ls-remote origin refs/heads/main` confirmed main remains
`bd9d7d9be0308ba294335fe2af3b3e9be2099122`. No additional/unrelated commits appeared.
The reviewed merge base was `aa9246f073a734e3f77aa71f73f7a23fe9358ce4`; there were four
main-only commits. The resulting local merge has parents `69c95f82...` and
`bd9d7d9...`; its full commit ID is in the final handoff, avoiding a self-referential
commit hash in this file. Main is now an ancestor locally; remote main is unchanged.

## Individual main-only commit dispositions

| Commit | Inspected intent and exact tree evidence | Disposition |
| --- | --- | --- |
| `b0b3e440cd7a97c0ac61147832910d1da58a760d` | Merge accelerated stability release. Its complete tree equals second parent/merge-base `aa9246f`; first-parent diff contains autosave/draft recovery, rename synchronization, shared GPX colour/cache, map-view persistence, reduced competing sync loops, size guards, isolated Development configuration, tests and recovery documents. | Already present through the candidate's ancestry. Preserve those features and subsequent tested protection/UI refinements. No distinct merge-only content was lost. |
| `1f28a23f961578b9a8bd0544661d5abc70f00268` | Emergency rollback for continuous-refresh regression. Complete tree equals pre-release `74c21fe15ccb7681facddef1d510ea918445c31b`. It reverses the release rather than adding a separate fix. | Superseded by main's own subsequent reapplication/hotfix. Preserve the rollback's safety intent via removal of render autosave and legacy reload clients, not by deleting tested release functionality. Historical rollback remains in ancestry; no live rollback is performed. |
| `e05366d3ff2f97095ffd657e32746fc37958bb5e` | Reapplies the release with reload-loop hotfix. Compared to `b0b3e44`, only four files differ: new `worker-autosave-stability.js`, updated `tests/release-safety.test.cjs`, and the two Wrangler entrypoint selections. | Hotfix behavior already present and retained: no render-triggered autosave, both legacy polling/reload scripts removed, track-size guard retained, cache/entity headers corrected. Main's direct stability entrypoint is superseded by the tested durable wrapper, which imports that same stability layer. Restore two main source assertions and assert hotfix behavior in delivered packaged HTML. |
| `bd9d7d9be0308ba294335fe2af3b3e9be2099122` | Redeploy merge with rollback parent and reapplication parent. Its entire tree equals `e05366d`; no new file content. | Retained as local merge ancestry. Its redeploy intent is historical only; no deployment is authorized or executed. |

Tree equality was checked with exact Git tree IDs, not merely diff summaries.
Net main change from the shared merge base affects only the four hotfix files above.
No unresolved main-only code change remains.

## Deliberate conflict resolution

A normal `git merge --no-commit --no-ff origin/main` produced exactly four conflicts:

- `worker-autosave-stability.js` (add/add): retain reviewed candidate implementation,
  which includes all main hotfix transforms plus existing tested attribution behavior.
  Its old intermediate delete bridge remains stripped/replaced by the outer durable
  wrapper; emitted-HTML tests ensure it cannot coexist with the durable client.
- `wrangler.toml`: retain durable wrapper selection, narrow assets and existing
  Production binding/Access identity. The dependency chain still includes main's
  stability wrapper and size guard. Do not regress to the shorter entrypoint.
- `wrangler.dev.toml`: retain the reviewed Development durable entrypoint/template.
- `tests/release-safety.test.cjs`: retain stronger candidate tests and both main
  legacy-script identifier assertions; replace old direct-entry expectations with
  the tested wrapper-chain expectation rather than discarding the hotfix tests.

No `ours` merge strategy or wholesale tree replacement was used. Each conflict was
reviewed; the only changed executable test text relative to the checkpoint is two
restored assertions plus packaged-HTML hotfix/size-chain assertions in
`tests/production-artifact.test.cjs`. Runtime, config, workflow, lockfile and package
bytes are unchanged. No automatic Production deployment path was restored.

## Exact integrated qualification

Run from the integration branch with locked local dependencies and synthetic data:

| Command/check | Result |
| --- | --- |
| `node scripts/check-production.cjs source` | PASS: 378, zero fail/skip |
| `node scripts/check-production.cjs packaged-server` | PASS: 81, all exact packaged-entry server checks |
| `node scripts/check-production.cjs browser` | PASS: 83, zero fail/skip: 48 packaged full-editor + 15 source deletion-client + 20 source qualification checks, including its parent |
| Packaged main-hotfix assertions | PASS: no render-start autosave, no legacy track/waypoint polling script tags, size guard retained |
| Offline manifest/file verifier, reviewed-runtime equality, bundle compilation, module syntax, workflow YAML parse, `git diff --check` | PASS |
| Dedicated lint | UNRUN: none configured |
| GitHub workflow execution, actual edge/Access/D1 replication, live smoke, recovery operations | UNRUN: unauthorized |

All 50 modules and HTML remain byte-identical to reviewed runtime
`492f222a7ffa8c1337786b8b699ef5c7f56d54d1`. Only public asset is `index.html`.
Qualification wrapper, source modules, docs, tests, config and manifest remain outside
public assets; qualification wrapper is absent from the runtime package entirely.
The authenticated synthetic qualification-route request still returns 404.

Manifest SHA256 (52 entries: 50 modules, config, HTML):
`fe41abd19887f8f4a99c8c70b6409942009da1aada82b28d32c791e6d8edfb06`.
Deterministic package tar SHA256:
`59ac7f49f55ea16443c5a095b9ed5db294f67fb63d143c38a359ac739f8680e7`.
Public HTML SHA256:
`35fb0b1604007e342b294fc41dd8c1352312eba55bded4a9c252964b58a03da3`.
Bundled Worker SHA256:
`bf01aee0915c67c52a6b7e7b78c953b45deaa72bc99267927df04d2cefd932f8`.

Logs and artifact are consumer-local in `/workspace/mancardo-release-evidence/`;
these are not parent/user download links. Fresh independent read-only review of the
final commit and evidence is reported in the handoff. No remote protections are
claimed configured by these local changes.

## Remaining gates

Local ancestry reconciliation is complete for verified main `bd9d7d9`. If main moves,
review its new diff and requalify before any promotion. A future merge/squash may
produce a different SHA: independently approve and verify the exact final source
SHA and manifest, never substitute this preparation's approval for release approval.

The LOCAL workflow remains manual-only, with source/manifest identity checks,
required regression gates, artifact transfer without rebuild, and fail-closed
independent approval values. Wrangler 4.151.3 remains locked. GitHub Actions use
version tags. External environment required reviewers, prevention of self-review,
branch restrictions and approval-variable governance remain unconfigured/unverified
here. Current REMOTE main workflow remains unchanged and auto-deploys on main push.
No push, publication, remote merge or dispatch is authorized.

Fresh backup/retention/schema verification, isolated restore completeness and
single-track extraction evidence, and a verified current Worker code-rollback target
remain separately authorized release blockers. Existing runbooks do not prove a
restore. Do not overwrite newer user writes with an old database snapshot. No live
inventory, export, restore, database creation or credential action occurred here.

Production remains HOLD pending explicit release authorization and those external
recovery/approval gates. Bounded prior visible/hidden live acceptance is historical
record-preservation evidence, not zero PUT attempts or continuous telemetry; it was
not repeated. Map-loading/favicon issues remain outside this change.
