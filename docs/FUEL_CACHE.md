# Fuel visited-area cache

Fuel uses OpenStreetMap data via Overpass, not Google Places data. The cache is local to this browser/device and origin. First visits to an uncached area still need a download; clearing site data removes persisted stations. This change does not provide a nationwide/offline download.

## Runtime

- Shared 2D/3D service in `index.html`; 3D consumes it in `worker-3d-overlays.js`.
- Australian extent unchanged: latitude -44 to -9, longitude 112 to 154. Only viewed 0.5-degree cells are requested; maximum 16 cells per view, otherwise ask the user to zoom in.
- IndexedDB `mancardo-fuel-cache-v1`, object store `cache`, key `visited`. Stores normalized OSM identity, coordinates, popup tags, schema version, fetched and last-use times. Successful empty cells count as coverage.
- Fresh for seven days; retain older records for up to 30 days while refreshing. Display last update and partial/unavailable status. Expired/invalid data is not presented as current coverage. Seven/30-day periods are product defaults, not provider mandates.
- Hot/persisted LRU: at most 96 cells and 1.5 MB conservative UTF-16 JSON budget. At most 500 elements and 500 KB normalized data per cell. Each active 2D/3D view retains up to 16 bounded cell records (at most 8 MB/view) until replacement/hide, preventing shared-cache eviction from causing a refetch loop.
- Two concurrent provider requests, at most 32 pending cell jobs, one shared promise per cell. New active views join existing work and enqueue missing cells as capacity frees. Each watch attempts a cell once; cache eviction never triggers automatic repeated downloading. Completed obsolete requests may warm the cache but cannot change a newer view or visibility intent.
- Each provider attempt has a ten-second browser deadline and eight-second Overpass execution limit. At most two endpoints per job, separated by 500 ms. A 429 stops fallback and starts a shared one-minute cooldown. Cell failures back off from one minute to 30 minutes; retries follow a subsequent view/toggle, not a continuous background polling loop.
- Partial Overpass/error payloads, invalid records/coordinates and oversized responses cannot replace successful cached data. Quota/blocked storage falls back to a clearly labelled session cache.
- Marker identity is OSM type/id. OFF detaches markers; ON reuses them; refreshed entries update coordinates/popups. 3D renders at most 180 markers with a visible truncation notice. Every asynchronous render checks current view/visibility and render revision.
- Always-visible OSM copyright/license links accompany Fuel; no Google-derived search results enter this cache.

## Validation and staging

`node --test tests/fuel-cache.test.cjs` exercises real Chromium and IndexedDB with every external request intercepted. Coverage includes desktop/mobile toggle identity, reload persistence, stale/offline and empty results, expiry, storage denial/quota, provider timeout/429, queue saturation, byte/count eviction, malformed/oversized results, pan/toggle and 3D library-await races. Existing source, packaged-server, browser, waypoint and map-performance suites remain applicable.

`Fuel Cache Qualification` runs on `chatgpt/fuel-cache-responsiveness`, verifies the exact commit, runs synthetic suites and prepares the existing isolated Development package. It contains no deployment step and uses no service credentials.

Only `index.html` and `worker-3d-overlays.js` change runtime behavior. No D1 schema, private-library data, bindings, service or production configuration changes. Do not merge or dispatch Development from this branch while the Cancel UI task is staging. The coordinating parent must compare the current `mancardo-dev` head, deliberately compose both reviewed changes on a separate candidate if needed, rerun their tests and the package checks, then serialize the approved Development deployment. Do not deploy this standalone package over a newer Cancel candidate. No main/Production promotion is authorized here.

## Source policies

- OSM reuse/attribution and ODbL: https://www.openstreetmap.org/copyright
- Public Overpass load shedding and usage guidance: https://dev.overpass-api.de/overpass-doc/en/preface/commons.html

Caching reduces demand; it does not turn public Overpass into a guaranteed production backend. Regional prepopulation or broader ingestion requires a separately reviewed source/hosting plan.
