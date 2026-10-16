# Accelerated stability release — acceptance record

Release branch: `release/accelerated-stability-20261016`. Production is **not** the test target. Use a disposable test account and test tracks only.

## Automated checks
- [ ] GitHub Actions **Accelerated Release Acceptance**: source-safety job green, attach run URL.
- [ ] Chromium desktop map smoke green, record renderMs and console errors.
- [ ] Chromium mobile map smoke green, record renderMs and console errors.
- [ ] Verify the test URL is actually serving the candidate commit (current smoke URL targets the deployed development worker, not this branch).

## Authenticated track tests (test account; do not delete real tracks)
- [ ] Create uniquely named 20-point track; save; refresh; reopen; verify point count and geometry; export GPX; reimport GPX.
- [ ] Edit existing test track; disconnect network; make further edits; refresh while offline; verify local recovery; reconnect; verify cloud revision and reload from a second browser.
- [ ] Force one cloud PUT to fail (browser network interception); verify last confirmed cloud revision remains available; retry; verify the new version persists after refresh.
- [ ] Open same test track in two browsers; save in A, then save stale edits in B; confirm no silent overwrite or deletion and clear conflict resolution.
- [ ] Verify manual deletion requires explicit user action and cannot be inferred by a stale/empty local library.

## Backup and rollout
- [ ] Verify recent Production D1 backup timestamp, integrity and retained file; never import into Production.
- [ ] Restore into an isolated D1 database and compare counts/integrity before approving deployment.
- [ ] Verify production/development D1 IDs, Access audience IDs, secrets and Worker names in deployed environments.
- [ ] Resolve branch divergence and PR mergeability; review production artifact composition.
- [ ] Release sign-off; merge; deploy; run production smoke on a disposable test track; rollback Worker code only if necessary.

## Decision rules
- Block release for reproducible silent deletion, lost saved revisions, cross-account data access, wrong D1 binding, or broken map loading.
- Accepted residual risk: historical one-off track-loss incident root cause remains unproven, subject to the data protection and backup checks above.
- Report measured browser load/render timings; do not claim performance targets passed without a run log.
