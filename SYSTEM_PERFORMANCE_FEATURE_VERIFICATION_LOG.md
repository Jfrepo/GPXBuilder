# ManCardo System, Performance & Feature Verification Test Log

Baseline production commit: `68af906471a5aa36a0657b60b4cdd7d2f01a3598`  
Audit started: **2026-10-15 09:16 AEDT (UTC+11)**  
Primary repository: `Jfrepo/GPXBuilder`  
Purpose: repeatable regression, release-readiness, security, data-integrity and performance verification.

## Status legend

- **PASS** — evidence supports expected behaviour.
- **PASS / OBSERVATION** — passes, but a follow-up or efficiency concern remains.
- **FAIL / RISK** — a material issue or architectural risk was found.
- **BLOCKED** — test cannot be completed with currently connected tooling/account access.
- **PENDING MANUAL** — requires a browser/device/account action by a human tester.

## Executed test log

| ID | Timestamp (AEDT) | Area | Test | Executor | Method | Result | Evidence / observation | Follow-up |
|---|---|---|---|---|---|---|---|---|
| SYS-001 | 2026-10-15 09:16 | GitHub | Confirm production repository/default branch | ChatGPT GPT-5.6 Sol | GitHub repository metadata | PASS | `Jfrepo/GPXBuilder`; default branch is `main`. | None |
| SYS-002 | 2026-10-15 09:16 | Deployment config | Confirm production Worker entrypoint and bindings | ChatGPT GPT-5.6 Sol | Inspect `wrangler.toml` on `main` | PASS / OBSERVATION | Entrypoint is `worker-shared-stale-link-recovery.js`; assets and D1 binding are configured. | Continue Worker-chain consolidation review. |
| SYS-003 | 2026-10-15 09:17 | Worker architecture | Verify active top-level Shared publish recovery only handles genuine missing records | ChatGPT GPT-5.6 Sol | Static inspection | PASS | Recovery runs only for POST `/api/tracks/:id/publish`, HTTP 404, `code=not_found`, then creates a new Shared track from the same GPX. | Add regression test for stale Shared ID after deletion. |
| SYS-004 | 2026-10-15 09:17 | Worker architecture | Inspect active Worker nesting | ChatGPT GPT-5.6 Sol | Follow imports from production entrypoint | FAIL / RISK | Production remains layered: stale-link recovery → note toggle UI → safe auth → stable notes → resource optimized → location accuracy → additional wrappers. Multiple HTML rewrite layers remain. | High priority: consolidate active Worker chain into fewer passes. |
| SYS-005 | 2026-10-15 09:18 | Resource efficiency | Confirm static assets bypass full Worker feature chain | ChatGPT GPT-5.6 Sol | Inspect `worker-resource-optimized.js` | PASS | GET/HEAD for common static extensions route directly to `env.ASSETS.fetch`. | Validate request counts in Cloudflare Analytics. |
| SYS-006 | 2026-10-15 09:18 | Resource efficiency | Confirm private sync idle polling reduction | ChatGPT GPT-5.6 Sol | Inspect resource optimization transforms | PASS | Known 5-second private sync loops are rewritten to 60 seconds; unrelated-click full-sync hooks are removed. | Measure real idle traffic for 5 and 60 minutes. |
| SYS-007 | 2026-10-15 09:18 | Browser CPU | Search repository for recurring timers | ChatGPT GPT-5.6 Sol | GitHub code search | PASS / OBSERVATION | 17 files contain `setInterval`; not all are active, but active Google loader includes a 250 ms Save-state refresh loop. | Profile active timers; replace 250 ms polling with event-driven updates if feasible. |
| SYS-008 | 2026-10-15 09:18 | Browser CPU / DOM | Search repository for MutationObservers | ChatGPT GPT-5.6 Sol | GitHub code search | PASS / OBSERVATION | 13 files contain `MutationObserver`; active note-toggle UI observes the full document subtree. | Check observer callback frequency and ensure no network/DOM feedback loop. |
| SYS-009 | 2026-10-15 09:19 | Authentication | Verify Cloudflare Access JWT validation | ChatGPT GPT-5.6 Sol | Inspect private sync auth code | PASS | RS256 signature verified against Access JWKS; issuer, audience, expiry, nbf and subject validated. | Add live expired-token/session-expiry test. |
| SYS-010 | 2026-10-15 09:19 | Private data isolation | Verify private track reads are owner scoped | ChatGPT GPT-5.6 Sol | Inspect SQL queries | PASS | Private list/get/update conflict queries use `owner_id` plus track ID where appropriate. | Run cross-account direct-ID test with two real users. |
| SYS-011 | 2026-10-15 09:19 | Private data validation | Validate input limits and coordinate checks | ChatGPT GPT-5.6 Sol | Inspect private API validation | PASS | Max payload enforced; max 250,000 points; coordinate and elevation validity checks; valid track ID and type enforcement. | Add boundary fixture tests at limits. |
| SYS-012 | 2026-10-15 09:19 | Data integrity | Verify revision history is database-enforced | ChatGPT GPT-5.6 Sol | Inspect migration `0001_private_library.sql` | PASS | Insert/update triggers write immutable private revision records; composite owner/track keys and indexes exist. | Test point-in-time recovery procedure. |
| SYS-013 | 2026-10-15 09:19 | Database migrations | Confirm schema migrations are committed | ChatGPT GPT-5.6 Sol | Inspect `migrations/` | PASS / OBSERVATION | Private tracks, Shared tracks, private waypoints and Shared waypoints migrations are present. Numbering jumps from 0002 to 0004. | Document whether 0003 was intentionally retired to avoid future confusion. |
| SYS-014 | 2026-10-15 09:20 | Secrets | Search repository for obvious Google browser keys | ChatGPT GPT-5.6 Sol | GitHub code search for `AIza` | PASS | No hard-coded `AIza...` key found. Google Maps key is loaded from `env.GOOGLE_MAPS_API_KEY`. | Verify Google Cloud referrer restrictions/quota in console. |
| SYS-015 | 2026-10-15 09:20 | Secrets | Search for obvious private-key/password/secret literals | ChatGPT GPT-5.6 Sol | GitHub code search | PASS | No matching obvious private key/password/API-key secret strings found by targeted scan. | Run GitHub secret scanning / history scan separately. |
| SYS-016 | 2026-10-15 09:20 | Google Maps loading | Verify Maps JS loader avoids duplicate insertion | ChatGPT GPT-5.6 Sol | Inspect `worker-google-loader.js` | PASS | Loader injects Google Maps JS only when HTML does not already contain the Maps API script. | Browser network test: confirm exactly one Maps JS load. |
| SYS-017 | 2026-10-15 09:20 | Map overlay integrity | Inspect geometry handling for Google 2D/3D overlays | ChatGPT GPT-5.6 Sol | Static code inspection | PASS / OBSERVATION | Google overlay code uses numeric lat/lng coordinates directly and 3D features are constructed from geographic coordinates without an intentional display offset. | Mandatory visual alignment test across pan/zoom/tilt/resize and GPX round-trip. |
| SYS-018 | 2026-10-15 09:20 | Security headers | Search code for CSP, X-Content-Type-Options, Referrer-Policy / frame protections | ChatGPT GPT-5.6 Sol | GitHub code search | FAIL / RISK | No application-level security-header implementation found by targeted search. Cloudflare may add some headers externally, but this is unverified. | Inspect live response headers; add explicit security headers where compatible with Google Maps. |
| SYS-019 | 2026-10-15 09:20 | CORS | Search code for permissive CORS configuration | ChatGPT GPT-5.6 Sol | GitHub code search | PASS / OBSERVATION | No explicit `Access-Control-Allow-Origin` code found; same-origin API design reduces CORS exposure. | Verify live OPTIONS/cross-origin behaviour. |
| SYS-020 | 2026-10-15 09:20 | Branch hygiene | Compare `dev` with `main` | ChatGPT GPT-5.6 Sol | GitHub commit comparison | FAIL / RISK | Branches are heavily diverged: `main` is 310 commits ahead of `dev`, while `dev` has 12 commits not in `main`; merge base remains old. | Freeze/retire/reset `dev` after preserving any required work; do not promote blindly. |
| SYS-021 | 2026-10-15 09:20 | PR hygiene | Inspect open pull requests | ChatGPT GPT-5.6 Sol | GitHub PR listing | FAIL / RISK | Multiple stale PRs remain open, including old `dev→main`, obsolete UI/icon work, and stale auth/status PRs based on old production commits. | Review then close/archive obsolete PRs to reduce accidental merge risk. |
| SYS-022 | 2026-10-15 09:21 | Cloudflare CI/CD | Verify recent PR #70 preview builds | ChatGPT GPT-5.6 Sol | Cloudflare GitHub App PR comments | PASS | Preview commits for #70 show successful Cloudflare build/deployment results, including the stale-link recovery commit. | Verify production deployment separately in Cloudflare dashboard. |
| SYS-023 | 2026-10-15 09:21 | Production CI status | Check GitHub combined status for production merge commit | ChatGPT GPT-5.6 Sol | GitHub commit-status API | PASS / OBSERVATION | No GitHub status contexts are attached to merge commit `68af906...`; preview deployment evidence exists on PR, but production status is not independently surfaced here. | Confirm production deployment ID/time in Cloudflare. |
| SYS-024 | 2026-10-15 09:21 | Live endpoint check | Attempt external fetch of `mancardo.com` and health APIs from available web tool | ChatGPT GPT-5.6 Sol | External web fetch | BLOCKED | Current web-access tool cannot access the ManCardo/Workers URLs, so live HTTP status/headers could not be independently measured. | Run browser/curl or Cloudflare dashboard tests manually. |
| FEAT-001 | Recorded 2026-10-15 09:21 | Shared Library | Share normal My Library track after PR #70 changes | Justin | Manual browser test in Cloudflare preview | PASS | User reported Sharing is working after safe-auth correction. | Repeat after production deployment as smoke test. |
| FEAT-002 | Recorded 2026-10-15 09:21 | Shared notes | Note icon at top-right, note hidden by default, click/tap toggles note open/closed | Justin | Manual browser test in preview | PASS | User reported UI “looks good”. | Regression on desktop + mobile touch. |
| FEAT-003 | Recorded 2026-10-15 09:21 | Shared Library stale link | Share `Oat test` where old `sharedId` pointed to missing Shared track | Justin | Manual browser test after stale-link recovery change | PASS | User reported `Oat test` works after recovery logic. | Add repeatable stale-ID fixture/test case. |

## Current findings / actions

### P0 — must verify before calling the build release-ready

1. **Cloudflare Worker CPU / request efficiency:** capture p50/p95/p99 CPU and duration, request count, subrequests, D1 reads/writes and 5xx/1101/1102 for idle, normal-use and large-track scenarios.
2. **Two-user data isolation:** using two real Access accounts, prove one account cannot fetch/update/delete another account's private `track_id` or waypoint ID.
3. **Backup / restore drill:** prove D1 data can be restored into a non-production target and document recovery steps/RPO/RTO.
4. **Map-overlay visual integrity:** verify 2D/3D track geometry stays aligned with Google map imagery through pan, zoom, tilt, map-type change, resize, orientation and GPX export/import round-trip.
5. **Worker-chain consolidation:** active production still has many nested Workers and repeated HTML parsing/rebuild opportunities. Consolidate before declaring architecture stable.

### P1 — high priority hardening

- Inspect live security headers and define CSP compatible with Google Maps/Cloudflare Access.
- Review/close stale PRs and formally retire or reset the divergent `dev` branch.
- Inspect active `setInterval` and `MutationObserver` paths for browser CPU and accidental network amplification.
- Verify Google Cloud Maps API key referrer restrictions, enabled APIs, quotas, billing alerts and anomalous usage.
- Confirm Cloudflare production deployment for merge `68af906...` and capture deployment ID/time in this log.

## Manual / account-level test queue

| ID | Area | Test procedure | Executor | Pass criteria | Status |
|---|---|---|---|---|---|
| CF-001 | Cloudflare performance | Open app and leave untouched 5 minutes; record Worker requests, CPU, D1 reads/writes | Justin / Cloudflare dashboard | Near-idle traffic; no high CPU spikes; no 1102 | PENDING MANUAL |
| CF-002 | Cloudflare performance | Leave app visible 60 minutes; record total requests by endpoint | Justin / Cloudflare dashboard | Polling remains bounded; no request amplification | PENDING MANUAL |
| CF-003 | Cloudflare performance | Import/render/share a large GPX; record p95 CPU/duration/subrequests | Justin + ChatGPT review | Within Worker limits; no 1102/5xx | PENDING MANUAL |
| CF-004 | Cloudflare logs | Inspect errors for last 24h: 5xx, 1101, 1102, D1 errors | Justin | No unexplained recurring errors | PENDING MANUAL |
| CF-005 | Cloudflare production | Confirm production deployment SHA/ID matches `68af906...` | Justin | Exact production source match | PENDING MANUAL |
| AUTH-001 | Identity isolation | User A creates private track; User B attempts direct GET using A track ID | Justin + Paul | 404/denied; no data disclosure | PENDING MANUAL |
| AUTH-002 | Identity isolation | User B attempts update/delete of A track ID | Justin + Paul | No mutation occurs | PENDING MANUAL |
| AUTH-003 | Session expiry | Leave app open through Access session expiry; then sync/share | Justin | Re-auth prompt; no lost edits | PENDING MANUAL |
| AUTH-004 | Multi-tab | Open two tabs; edit same private track; exercise sync/conflict | Justin | No silent overwrite/data loss | PENDING MANUAL |
| DATA-001 | Backup | Verify D1 Time Travel/backups/retention in account | Justin | Recovery window documented | PENDING MANUAL |
| DATA-002 | Restore | Restore/copy production data into non-prod test DB | Justin + ChatGPT review | Tracks/waypoints/revisions intact | PENDING MANUAL |
| MAP-001 | 2D integrity | Compare track against known landmarks at multiple zooms/pans | Justin | No visible relative shift | PENDING MANUAL |
| MAP-002 | 3D integrity | Enter 3D; tilt/rotate/zoom and compare track to terrain | Justin | Track remains geographically aligned | PENDING MANUAL |
| MAP-003 | Round-trip | Export GPX then re-import same file; compare geometry/point count | Justin | Equivalent geometry and segment structure | PENDING MANUAL |
| MAP-004 | Large track | Load 1k, 10k, 50k point fixtures and record responsiveness | Justin | No crash; acceptable interaction latency | PENDING MANUAL |
| GCP-001 | Google Cloud | Verify production key HTTP referrer restrictions | Justin | Only intended production/preview domains allowed | PENDING MANUAL |
| GCP-002 | Google Cloud | Review enabled Maps APIs | Justin | Only required APIs enabled | PENDING MANUAL |
| GCP-003 | Google Cloud | Review quotas, billing alerts and daily usage | Justin | Sensible caps/alerts; no unexplained usage | PENDING MANUAL |
| SEC-001 | HTTP security | Inspect live response headers | Justin / browser devtools or curl | HTTPS + appropriate cache/content/security headers | PENDING MANUAL |
| SEC-002 | XSS | Track/waypoint/note names containing HTML/script-like strings | Justin | Rendered as text, no execution | PENDING MANUAL |
| REG-001 | Production smoke | App/map load, My Library, edit/save, waypoint, sync, Shared publish/note/delete | Justin | All critical user paths pass | PENDING MANUAL |

## Regression smoke suite

Run after every production deployment:

1. Open production and verify Google base map renders.
2. Open My Library and confirm cloud sign-in/sync state.
3. Open an existing track and verify geometry alignment.
4. Edit one point and verify Save dirty → saved state.
5. Add/edit a track note; reload and verify persistence.
6. Publish a new private track to Shared Library.
7. Publish/update a track that already has a Shared linkage.
8. Exercise stale Shared linkage recovery using a controlled test record.
9. Toggle the Shared note icon open/closed; default must be closed.
10. Create/save/delete a waypoint.
11. Export a GPX and re-import it.
12. Check Cloudflare logs/analytics for new 5xx/1102/resource spikes.

## Test-log maintenance rules

- Do not overwrite historical results; append a new row for every regression run.
- Record the exact production Git commit and Cloudflare deployment ID when available.
- Record executor as a named human or `ChatGPT GPT-5.6 Sol`.
- Separate **code inspection**, **automated/API**, **browser manual**, and **dashboard/account-level** evidence.
- A feature is not considered verified from static inspection alone when visual, cross-device, authentication or performance behaviour is involved.
- Any data-loss, cross-user access, map-coordinate drift, recurrent Worker 1102, or restore failure is release-blocking.
