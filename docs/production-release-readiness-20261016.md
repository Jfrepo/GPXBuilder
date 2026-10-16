# Mancardo production release readiness — 16 October 2026

## Candidate and verified checks
- Release candidate: `84859373e5f15e0175ef9a1864c35a6bde783ad4` (tested and deployed to Development).
- GitHub Development deployment #33: passed (user screenshot).
- Accelerated Release Acceptance #15: passed (user screenshot).
- User confirmed six manual Development checks: create/name, save, refresh, persisted My Library, autosaved additional point after refresh, GPX export.
- Production Worker: `mancardo`; Production D1: `mancardo-private-library` (UUID `6ada726b-aae6-441b-a698-69dc0789c7b7`).
- Development Worker: `mancardo-dev-test`; Development D1: `mancardo-private-library-dev`.
- Production preview URLs disabled in `wrangler.toml`.

## Release blockers / required human checks
1. **Fresh Production D1 backup:** Existing local SQL backup from ~11:59 AM Sydney, 16 October 2026 was locally integrity-checked, but remote restore has NOT been proven. Confirm a fresh backup and recovery route immediately before deployment. Never import into or overwrite the live Production D1 during preparation.
2. **PR integration:** The release branch diverges from `main` (47 commits ahead, 1 behind at preparation). Review the latest `main` change and resolve integration safely; do not force-push or replace `main`.
3. **Live Production credentials:** Confirm Cloudflare Production environment has necessary secrets and correct Production Access configuration. Do not copy Development secrets or D1 bindings.
4. **Data safety acceptance:** Multi-device concurrency, interrupted network/cloud acknowledgment, and end-to-end backup restore are not yet proven; explicitly accept residual risk or test them before release.
5. **Explicit release authorization:** Do not merge/deploy solely because this readiness document exists.

## Controlled rollout
1. Verify current production track count / database health read-only, preserve a timestamped snapshot, and document recovery method.
2. Review release PR diff and GitHub checks, resolve branch divergence, approve merge.
3. Deploy through the existing protected Production workflow, not the Development workflow. Confirm target `mancardo` and Production D1 binding before proceeding.
4. Smoke-test production map desktop/mobile, Access sign-in, existing tracks, save/refresh, GPX export; do not delete existing tracks for testing.
5. If serious issue: roll back Worker code while retaining Production D1; do not restore a stale backup over newer user data without a reconciliation plan.
