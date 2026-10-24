# ManCardo System, Performance & Feature Verification Log

**Purpose:** Living regression-test record for production-readiness, performance, security, map integrity, sync, authentication, Cloudflare, GitHub and Google Maps Platform.

**Baseline production commit:** `68af906471a5aa36a0657b60b4cdd7d2f01a3598`  
**Audit branch:** `qa/regression-baseline-2026-10-15`  
**Initial audit timestamp:** 2026-10-15 09:22 AEDT (UTC+11)  
**Primary environments:** Production (`main`), Cloudflare Worker `mancardo`, D1 `mancardo-private-library`, Google Maps Platform.

## Status legend

- **PASS** — requirement verified by available evidence.
- **PASS-WITH-RISK** — core requirement verified, but a residual risk or optimisation item remains.
- **FAIL / OPTIMISE** — defect or material inefficiency identified.
- **MANUAL REQUIRED** — requires Cloudflare/Google console access, browser/device interaction, or authenticated multi-user testing.
- **NOT RUN** — defined but not yet executed.

## Execution log

| ID | Timestamp (AEDT) | Area | Test | Executor | Method / Evidence | Result | Follow-up |
|---|---|---|---|---|---|---|---|
| CFG-001 | 2026-10-15 09:22 | Production config | Confirm production Wrangler entrypoint and bindings | ChatGPT | Static inspection of `wrangler.toml` on `main` | PASS | Entrypoint is `worker-shared-stale-link-recovery.js`; D1 and Access vars configured. |
| DEP-001 | 2026-10-15 09:22 | Deployment | Confirm validated PR #70 preview deployments built successfully before production merge | ChatGPT | GitHub/Cloudflare bot deployment evidence on PR #70 | PASS | Preview commits used for user validation show successful build/deploy. Production deployment still requires dashboard/HTTP confirmation. |
| GIT-001 | 2026-10-15 09:22 | GitHub | Compare `dev` and `main` branch state | ChatGPT | GitHub compare API | FAIL / OPTIMISE | `dev` is materially diverged: `main` is 310 commits ahead while `dev` is 12 commits ahead of merge base. Do not promote `dev`; establish a replacement branch strategy. |
| CODE-001 | 2026-10-15 09:22 | Worker architecture | Inspect top-level Worker wrapper chain | ChatGPT | Static import-chain inspection | FAIL / OPTIMISE | Production path contains multiple nested Worker wrappers before reaching lower application layers. Consolidation remains a priority to reduce CPU, response rewrites and regression risk. |
| PERF-001 | 2026-10-15 09:22 | Static asset efficiency | Confirm obvious static files bypass the nested Worker chain | ChatGPT | `worker-resource-optimized.js` review | PASS | GET/HEAD static extensions are sent directly to `env.ASSETS.fetch`. |
| PERF-002 | 2026-10-15 09:22 | Idle sync efficiency | Check private sync polling and click-driven full sync behaviour | ChatGPT | `worker-resource-optimized.js` review | PASS-WITH-RISK | Historical 5-second polling is rewritten to 60 seconds and unrelated clicks no longer force sync. Other intervals/observers still require consolidation. |
| PERF-003 | 2026-10-15 09:22 | Browser CPU | Search for high-frequency timers | ChatGPT | Repository search for `setInterval` | FAIL / OPTIMISE | Multiple DOM/UI timers remain, including 250 ms Save-state checks, 750 ms mobile-library checks, 1 s map-status checks and other retry/watch intervals. Individually small, but cumulative cost should be profiled and converted to event-driven updates where possible. |
| PERF-004 | 2026-10-15 09:22 | Shared Library traffic | Inspect Shared-note UI observer for network amplification | ChatGPT | `worker-shared-notes-stable.js` review | FAIL / OPTIMISE | A document-wide `MutationObserver` can call `decorateShared()`, which fetches `/api/tracks`. Any unrelated child-list mutation can therefore trigger Shared API/D1 traffic. Debounce/scope observer or refresh only on actual Shared Library state changes. |
| PERF-005 | 2026-10-15 09:22 | D1 efficiency | Inspect Shared Library list note augmentation | ChatGPT | `worker-shared-notes-stable.js` review | FAIL / OPTIMISE | Each successful Shared list response is followed by `SELECT track_id,gpx FROM shared_library_tracks WHERE deleted=0` to derive notes. This duplicates Shared-list D1 work and reads every GPX payload. Store/return note metadata directly or merge into one query. |
| AUTH-001 | 2026-10-15 09:22 | Authentication | Verify Cloudflare Access JWT validation | ChatGPT | `worker-private-library-sync.js` review | PASS | RS256 signature, issuer, audience, expiry, nbf and signing key are verified; owner identity derives from token `sub`. |
| AUTH-002 | 2026-10-15 09:22 | Authorization | Verify private track queries are owner scoped | ChatGPT | D1 query review | PASS | List/get/put/delete queries bind `owner_id` from verified Access identity, preventing client-selected owner access in reviewed code. |
| AUTH-003 | 2026-10-15 09:22 | Identity handling | Confirm Shared user selector is not authorization | ChatGPT | `worker-resource-optimized.js` + Shared API architecture review | PASS-WITH-RISK | UI selector is disabled/derived from authenticated account when health check succeeds; server-side Shared attribution uses authenticated context. Multi-user runtime test still required. |
| SEC-001 | 2026-10-15 09:22 | Private data caching | Check private API cache headers | ChatGPT | `jsonResponse()` review | PASS | Private API responses use `cache-control: no-store`. |
| SEC-002 | 2026-10-15 09:22 | Input validation | Validate private track API payload controls | ChatGPT | `worker-private-library-sync.js` review | PASS | 2 MiB track limit, 250k-point limit, type/name/id validation, valid lat/lon ranges and JSON-size checks are present. |
| SEC-003 | 2026-10-15 09:22 | Concurrency / data loss | Confirm private optimistic concurrency | ChatGPT | PUT/DELETE D1 update review | PASS | `base_revision` is required; stale updates return 409 and do not silently overwrite cloud state. |
| SEC-004 | 2026-10-15 09:22 | Google key handling | Search repository for hard-coded Google Maps API key patterns | ChatGPT | Repository searches for `GOOGLE_MAPS_API_KEY` and `AIza` | PASS | Google Maps code reads key from Worker environment; no `AIza` key string found in repository search. Console referrer/API restrictions still require manual verification. |
| MAP-001 | 2026-10-15 09:22 | Google loading | Verify Google Maps script is not deliberately injected twice | ChatGPT | `worker-google-loader.js` and `worker-google-preview.js` review | PASS-WITH-RISK | Both injectors check existing loader/feature markers. Architecture contains two Google-loading layers, so consolidation is recommended even though duplicate injection is guarded. |
| MAP-002 | 2026-10-15 09:22 | Overlay geometry | Verify Leaflet track lat/lon are copied directly into Google geometry | ChatGPT | `worker-google-preview.js` review | PASS | Google `LineString`/Point features are created directly from Leaflet `ll.lat`/`ll.lng`; no additional reprojection or intentional coordinate offset is applied. |
| MAP-003 | 2026-10-15 09:22 | Overlay synchronisation | Inspect Google/Leaflet viewport sync | ChatGPT | `worker-google-preview.js` review | PASS-WITH-RISK | Google centre/zoom are synchronised on Leaflet move/zoom/resize via `requestAnimationFrame`. Runtime pixel-alignment under pan/zoom/resize/3D remains manual/device test. |
| MAP-004 | 2026-10-15 09:22 | Rendering integrity | Check track overlay uses one visual renderer over Google basemap | ChatGPT | `worker-google-preview.js` review | PASS | Visible Leaflet polylines/markers are copied to Google Data and Leaflet visual opacity is set to zero, reducing two-renderer visual lag while retaining Leaflet interaction engine. |
| MAP-005 | 2026-10-15 09:22 | GPX precision | Inspect GPX coordinate handling / geometry preservation | ChatGPT | `index.html` code search | PASS-WITH-RISK | Core model retains numeric lat/lon and avoids an extra map reprojection step. Full export→re-import coordinate-delta test remains manual/automated-fixture work. |
| MAP-006 | 2026-10-15 09:22 | Google failure handling | Verify failed Maps API load produces visible diagnostic | ChatGPT | `worker-google-preview.js` review | PASS | Loader retries and reports a visible “Google Maps failed to load” diagnostic after timeout. |
| DATA-001 | 2026-10-15 09:22 | D1 schema discipline | Check waypoint schema DDL is not rerun on every request | ChatGPT | `worker-resource-optimized.js` review | PASS | Migration-backed waypoint DDL is intercepted/skipped while normal D1 CRUD continues. |
| DATA-002 | 2026-10-15 09:22 | Shared stale link recovery | Verify deleted/missing Shared target recovers by creating a new Shared record | ChatGPT + User | Static review plus user preview test of “Oat test” | PASS | User confirmed the previously failing stale-link case now publishes successfully. |
| FEAT-001 | 2026-10-15 09:22 | Shared notes | Verify note icon default-hidden toggle behaviour | ChatGPT + User | Preview implementation plus user acceptance test | PASS | User confirmed note icon/toggle behaviour looks good before deployment. |
| FEAT-002 | 2026-10-15 09:22 | Shared publishing | Verify standard My Library → Shared Library publishing after architectural repair | ChatGPT + User | Preview build plus user functional test | PASS | User reported publishing working before production merge. |
| LOGIN-001 | 2026-10-15 09:22 | Preview auth | Verify Share action no longer closes preview page | ChatGPT + User | Safe-auth implementation plus user preview test | PASS | User confirmed Share now works after removal of popup-close auth flow. |
| BACKUP-001 | 2026-10-15 09:22 | Backup / restore | Verify D1 backup retention and tested restore procedure | User / Cloudflare console | Console access required | MANUAL REQUIRED | Confirm automated retention, export procedure, restore to non-production and recovery-time target. |
| CF-CPU-001 | 2026-10-15 09:22 | Cloudflare CPU | Record Worker CPU p50/p95/p99 and 1101/1102 errors | User + ChatGPT review | Cloudflare Analytics/Logs required | MANUAL REQUIRED | Capture idle, map load, My Library open, Shared Library open, note edit, publish and large GPX journeys. |
| CF-REQ-001 | 2026-10-15 09:22 | Cloudflare traffic | Count Worker requests and D1 reads/writes during 5-minute idle | User + ChatGPT review | Cloudflare Analytics/Logs required | MANUAL REQUIRED | Expected result: near-silent network activity; current observer/timer findings make this a priority. |
| GCP-001 | 2026-10-15 09:22 | Google Cloud | Verify Maps key HTTP referrer restrictions | User / Google Cloud console | Console access required | MANUAL REQUIRED | Restrict to production and explicitly controlled preview hosts; review enabled APIs. |
| GCP-002 | 2026-10-15 09:22 | Google Cloud | Verify Maps quotas, billing alerts and anomalous usage | User / Google Cloud console | Console access required | MANUAL REQUIRED | Record current daily map loads, quotas and alert thresholds. |
| MAP-RUN-001 | 2026-10-15 09:22 | Map runtime | Pan/zoom/resize/satellite/hybrid overlay pixel alignment | User | Browser/device test | MANUAL REQUIRED | Test desktop Chrome/Safari and iPhone Safari; compare track against known geometry. |
| MAP-RUN-002 | 2026-10-15 09:22 | Map runtime | GPX export→re-import coordinate-delta test | User + ChatGPT fixture analysis | Runtime export/import required | MANUAL REQUIRED | Target: no meaningful geometry drift; quantify max lat/lon delta. |
| SYNC-001 | 2026-10-15 09:22 | Multi-device sync | Same track on two devices with concurrent edits | User + second device/account | Authenticated multi-device test | MANUAL REQUIRED | Verify 409/conflict behaviour and no silent overwrite. |
| SYNC-002 | 2026-10-15 09:22 | Multi-user isolation | User A attempts direct read/update/delete of User B track ID | User + ChatGPT review | Two authenticated accounts required | MANUAL REQUIRED | Must return not-found/unauthorised semantics with no data leakage. |
| BROWSER-001 | 2026-10-15 09:22 | Compatibility | iPhone Safari regression suite | User | Device test | NOT RUN | Include login, map, long-press waypoint, edit/save, Shared publish, note toggle, orientation change. |
| BROWSER-002 | 2026-10-15 09:22 | Compatibility | Desktop Chrome regression suite | User | Browser test | NOT RUN | Include map modes, keyboard shortcuts, track edit, private sync and Shared operations. |
| PERF-RUN-001 | 2026-10-15 09:22 | Large track performance | 1k/10k/50k point render/import/save/publish timings | User + ChatGPT analysis | Test fixtures and browser timing required | NOT RUN | Record parse, render, save, GPX build, sync and memory behaviour. |

## Priority findings from the initial audit

### P0 — Resource amplification risk in Shared-note UI
The current Shared-note client installs a document-wide `MutationObserver` that schedules both local and Shared decoration. Shared decoration performs `GET /api/tracks`. Because general UI child-list changes occur throughout the application, this can generate unnecessary Worker and D1 traffic. This is the most important code-level performance finding from this audit.

**Recommended correction:** Scope the observer to `#sharedTrackList`, debounce it, and never fetch simply because unrelated DOM changed. Prefer calling a Shared-note refresh only after `loadSharedLibrary()` or a known Shared mutation.

### P0 — Duplicate D1 work on Shared list
Shared note augmentation reads all undeleted GPX blobs after the underlying Shared list has already queried Shared metadata.

**Recommended correction:** Return note metadata from the same Shared-list query, or store note in a dedicated field if a later schema migration is acceptable. Avoid reading full GPX payloads just to obtain a 40-character note.

### P1 — Worker wrapper-chain consolidation
The production entrypoint currently routes through several new top-level wrappers before reaching `worker-resource-optimized.js`, which itself routes through the older feature chain. Static files bypass much of this, but HTML/API execution still has a high architectural layering cost and regression surface.

**Recommended correction:** Build a single production Worker entrypoint that owns routing and performs one HTML transformation pass. Retire superseded wrappers after regression tests cover their behaviour.

### P1 — Git branch strategy
`dev` is not a safe integration branch in its current state. The audit found `main` 310 commits ahead while `dev` retains 12 commits not in `main` from the old history.

**Recommended correction:** Preserve the old `dev` branch as an archive if needed, then create a fresh integration branch from current `main` and update workflow documentation.

### P2 — High-frequency client timers
Several UI features still use periodic polling/timers. These are mostly client CPU rather than Worker CPU, but they add up on mobile and long-running sessions.

**Recommended correction:** Replace Save-state polling, mobile-library polling and status polling with event-driven updates where practical; keep short timers only for bounded startup retries.

## Manual Cloudflare performance capture template

For each journey below, capture **requests**, **Worker CPU**, **wall time**, **D1 reads**, **D1 writes**, **5xx/1101/1102**, and **notes**:

| Journey | Duration / action | Requests | CPU p50 | CPU p95 | CPU p99 | D1 reads | D1 writes | Errors | Notes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Idle | 5 minutes, tab visible | | | | | | | | |
| Idle background | 5 minutes, tab hidden | | | | | | | | |
| Initial load | Cold load | | | | | | | | |
| My Library | Open once | | | | | | | | |
| Shared Library | Open once | | | | | | | | |
| Note edit | Type/change one note | | | | | | | | |
| Share track | Publish one existing track | | | | | | | | |
| Large GPX | Import/render 50k points | | | | | | | | |
| 1-hour session | Normal mixed use | | | | | | | | |

## Runtime map-integrity template

| Test | Browser/device | Basemap | Zoom range | Expected | Actual | Status | Executor | Timestamp |
|---|---|---|---|---|---|---|---|---|
| Pan alignment | | Roads | | Track remains locked to same geographic features | | | | |
| Zoom alignment | | Satellite | | No track jump/lag after zoom settles | | | | |
| Resize | | Hybrid | | No horizontal/vertical offset | | | | |
| Orientation change | iPhone Safari | Satellite | | Overlay remains aligned after rotation | | | | |
| Export/re-import | | Any | | Same geometry; quantify max coordinate delta | | | | |
| 3D transition | | 3D | | Track/point state remains coherent on entry/exit | | | | |

## Multi-user / multi-device security & sync template

| Test | Account/device A | Account/device B | Expected | Actual | Status | Executor | Timestamp |
|---|---|---|---|---|---|---|---|
| Cross-user GET by known track ID | | | B cannot read A private track | | | | |
| Cross-user PUT by known track ID | | | B cannot modify A private track | | | | |
| Cross-user DELETE by known track ID | | | B cannot delete A private track | | | | |
| Concurrent same-track edit | | | Conflict detected; no silent overwrite | | | | |
| Delete vs edit race | | | Explicit conflict/recovery path | | | | |
| Offline edit then reconnect | | | Predictable reconcile; no silent loss | | | | |
| Note replication | | | Note appears on other signed-in device | | | | |
| Shared publish attribution | | | Authenticated identity is recorded correctly | | | | |

## Release smoke test

Run after every production deployment:

- [ ] Production page loads without Worker error.
- [ ] Google basemap loads.
- [ ] Roads / Terrain / Satellite / Hybrid switch correctly.
- [ ] Known track remains geographically aligned while pan/zooming.
- [ ] My Library loads private tracks.
- [ ] Existing track opens and edits.
- [ ] Save state changes dirty → saved correctly.
- [ ] Private sync completes.
- [ ] Waypoint create/save/delete works.
- [ ] Shared Library loads.
- [ ] My Library track publishes to Shared Library.
- [ ] Stale Shared link recovers rather than failing `not_found`.
- [ ] Track note publishes and note icon is hidden by default.
- [ ] Note icon toggles note open/closed.
- [ ] Shared delete works without false error.
- [ ] No unexpected 5xx / 1101 / 1102 in Cloudflare after smoke test.

## Regression cadence

- **Every production deploy:** Release smoke test.
- **Weekly during active development:** Cloudflare request/CPU/D1 idle sample + authentication/sync spot check.
- **Before a major release:** Full map matrix, browser/device matrix, two-user isolation tests, two-device conflict tests, backup restore drill, large-track performance suite.
- **After changing sync/auth/Worker entrypoint:** Repeat AUTH, SEC, SYNC, CF-CPU, CF-REQ and Shared publish tests.
- **After changing map renderer/Google integration:** Repeat MAP-001 through MAP-RUN-002 and large-track rendering tests.
