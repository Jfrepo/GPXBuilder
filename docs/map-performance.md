# Map responsiveness candidate

Based on deployed `225f2acf6607fc77fbb0d35977610bfbf5c7e0aa` only. No Select/Deselect, recovery, owner-filter, sync-protocol, schema, credentials or Production deployment changes.

## Changes

- Send Google the authoritative `zoomanim` target immediately; retain Leaflet's interaction animation and non-Google fallback. The old normal-zoom listener waited for Leaflet's roughly 250 ms transition.
- Keep track lines and Leaflet interaction layers stable at zoom 14. Add/remove only the existing sampled Google point features and update their hit targets. Actual edits still render new geometry.
- Replace the four-per-second Save fingerprint poll with the existing render/dock/load/save boundaries plus the local persistence boundary for non-rendering metadata edits. Dirty-state comparison and save semantics are unchanged; this is not a proxy/version-based rewrite.
- Google-positioned waypoint markers use Google's overlay draw as their view clock. Explicit marker coordinate/icon changes still update immediately. No coordinate rounding, culling, transform or pane changes.

## Validation and limits

`npm run test:map-performance` covers early animated handoff, threshold behavior/line identity, zero idle cloning, marker projection counts, save/note/rename/import/undo/redo/unnamed-route behavior and repeated viewport changes preserving selected-point styling and GPX export. The first four tests failed against the deployed baseline before implementation. `npm run test:waypoints` retains delayed-renderer desktop/mobile alignment and interaction coverage with a 2 px tolerance. Full source, packaged-server and browser safety gates remain required.

The prior synthetic investigation measured approximately 307–339 ms wheel-to-Google-command handoff, and 513–558 ms when a 10k-point track crossed zoom 14. Diagnostic suppression was not shipped. Use `scripts/benchmark-map-performance.cjs` to compare immutable source roots under the same real Chromium/Leaflet fixture; `MANCARDO_PERF_ROOT`, `PERFORMANCE_EVIDENCE`, `POINTS` and `WAYPOINTS` select source, unique output file and load. Network/provider responses are mocked and all account requests intercepted. Cloud wall-clock timings are noisy; structural call counts and command timing must be distinguished from displayed pixels.

`scripts/check-map-performance-development.cjs` is the post-staging actual Google desktop check. It obtains only the authenticated HTML shell, seeds a new browser context with synthetic data, blocks all application data endpoints, and never sends Access service headers to Google. It records command latency, marker projection error, unchanged GPX and explicit physical-touch/3D limitations. The narrow Development controller must pin the candidate SHA and manifest and retain existing identity/authentication guards. Parent coordinates the manual dispatch; the qualification workflow cannot deploy.

No Cloudflare/D1 runtime configuration, migration, API contract, or user data is changed. Production remains unchanged until a separately reviewed release.
