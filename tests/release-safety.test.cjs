const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html','utf8');
const cloud = fs.readFileSync('worker-private-library-cloud.js','utf8');
const guard = fs.readFileSync('worker-track-size-guard.js','utf8');
const stability = fs.readFileSync('worker-autosave-stability.js','utf8');
const durableDelete = fs.readFileSync('worker-delete-durable-fix.js','utf8');
const legacyTrack = fs.readFileSync('worker-private-delete-tombstone-fix.js','utf8');
const legacyWaypoint = fs.readFileSync('worker-private-waypoint-sync.js','utf8');
const dev = fs.readFileSync('wrangler.dev.toml','utf8');
const prod = fs.readFileSync('wrangler.toml','utf8');
const deploy = fs.readFileSync('.github/workflows/cloudflare-dev.yml','utf8');

test('route editor keeps autosave capability but removes autosave from the render loop', () => {
  assert.match(html, /function autosaveEditor\(\)/);
  assert.match(html, /localStorage\.setItem\(AUTO_DRAFT_KEY,JSON\.stringify\(item\)\)/);
  assert.match(html, /recoverUnnamedDraft\(\);/);
  assert.match(html, /upsertLocal\(deepClone\(item\)\);\s*scheduleCloudAutosave\(\)/);
  assert.match(stability, /const RENDER_AUTOSAVE = "function render\(\)\{\\n  autosaveEditor\(\);"/);
  assert.match(stability, /html = html\.replace\(RENDER_AUTOSAVE, RENDER_SAFE\)/);
});

test('legacy polling clients that can reload the page are stripped from delivered HTML', () => {
  assert.match(legacyTrack, /setInterval\(function\(\)\{if\(document\.visibilityState==='visible'&&navigator\.onLine\)run\(\);\},5000\)/);
  assert.match(legacyTrack, /location\.reload\(\)/);
  assert.match(legacyWaypoint, /setInterval\(function\(\)\{if\(document\.visibilityState==='visible'&&navigator\.onLine\)run\(\);\},5000\)/);
  assert.match(legacyWaypoint, /location\.reload\(\)/);
  assert.match(stability, /mancardo-private-delete-tombstone-fix/);
  assert.match(stability, /mancardo-private-waypoint-sync/);
  assert.match(stability, /html = html\.replace\(LEGACY_TRACK_SYNC, ''\)/);
  assert.match(stability, /html = html\.replace\(LEGACY_WAYPOINT_SYNC, ''\)/);
});

test('cloud sync never infers a deletion from missing local IDs', () => {
  const scan = cloud.slice(cloud.indexOf('function queueScan(){'),cloud.indexOf('function scheduleScan(){'));
  assert.ok(scan.length>100);
  assert.doesNotMatch(scan, /op:\s*['"]delete['"]/);
  assert.match(cloud, /if\(op\.op==='delete'&&!op\.explicitUserDelete\)/);
});

test('authorised My Library deletes pin workspace account and reconciled revision before removal', () => {
  assert.match(durableDelete, /mancardo_authorized_delete_pending_v4/);
  assert.match(durableDelete, /authorizedUserDelete:true/);
  assert.match(durableDelete, /authorized_user_delete:true/);
  assert.match(durableDelete, /base_revision:record\.baseRevision/);
  assert.match(durableDelete, /x-mancardo-delete-account/);
  assert.match(durableDelete, /boundAccountKey/);
  assert.match(durableDelete, /writePending\(pending\);\s*persistRemoval\(ids\)/);
  assert.match(durableDelete, /hashes\[x\.id\]\.indexOf\(x\.meta\.sha256\)<0/);
  assert.match(durableDelete, /method:'DELETE'/);
  assert.doesNotMatch(durableDelete, /status===409&&(?:attempt|n)</);
});

test('delete client is injected as plain JavaScript inside the editor IIFE', () => {
  assert.ok(durableDelete.includes("const boot=html.indexOf('// ---------- boot ----------')"));
  assert.ok(durableDelete.includes("html.slice(0,insertion)+DURABLE_DELETE_BRIDGE"));
  assert.doesNotMatch(durableDelete.match(/const DURABLE_DELETE_BRIDGE = String.raw`([\s\S]*?)`;/)[1], /<script\b/i);
  assert.ok(!durableDelete.includes("lastIndexOf('</body>')"));
});

test('shared attribution recognises Paul account labels', () => {
  assert.match(stability, /\\bpaul\\b\|\\btuffs\\b/);
  assert.match(stability, /return 'Paul'/);
  assert.match(stability, /UPDATE shared_library_tracks/);
  assert.match(stability, /modified_by='Shared user'/);
});

test('development and production workers have separate D1 bindings', () => {
  assert.match(dev, /name = "mancardo-dev-test"/);
  assert.match(dev, /database_name = "mancardo-private-library-dev"/);
  assert.match(dev, /database_id = "DEV_DATABASE_ID_REQUIRED"/);
  assert.match(prod, /database_name = "mancardo-private-library"/);
  assert.match(deploy, /test "\$\{DEV_DB,,\}" != "6ada726b-aae6-441b-a698-69dc0789c7b7"/);
});

test('development autosave triggers cloud reconciliation', () => {
  assert.match(html, /mancardo:track-autosaved/);
  assert.match(cloud, /addEventListener\('mancardo:track-autosaved'/);
});

test('production preview URLs remain disabled and no preview D1 binding is declared', () => {
  assert.match(prod, /preview_urls = false/);
  assert.doesNotMatch(prod, /\[\[previews\.d1_databases\]\]/);
});

test('autosave stability wrapper preserves the track-size safety guard', () => {
  assert.match(guard, /SAFE_TRACK_BYTES = Math\.floor\(1\.8 \* 1024 \* 1024\)/);
  assert.match(guard, /WARN_TRACK_BYTES = Math\.floor\(1\.6 \* 1024 \* 1024\)/);
  assert.match(guard, /code:'track_safety_limit'/);
  assert.match(guard, /x-mancardo-track-size-warning/);
  assert.match(stability, /import baseWorker from '\.\/worker-track-size-guard\.js'/);
  assert.match(durableDelete, /import baseWorker from '\.\/worker-autosave-stability\.js'/);
  assert.match(prod, /main = "worker-delete-durable-fix\.js"/);
  assert.match(dev, /main = "worker-delete-durable-fix\.js"/);
});
