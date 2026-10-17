const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html','utf8');
const cloud = fs.readFileSync('worker-private-library-cloud.js','utf8');
const guard = fs.readFileSync('worker-track-size-guard.js','utf8');
const dev = fs.readFileSync('wrangler.dev.toml','utf8');
const prod = fs.readFileSync('wrangler.toml','utf8');
const deploy = fs.readFileSync('.github/workflows/cloudflare-dev.yml','utf8');
test('route editor saves modified geometry and supports unnamed recovery', () => {
  assert.match(html, /function autosaveEditor\(\)/);
  assert.match(html, /function render\(\)\{\s*autosaveEditor\(\)/);
  assert.match(html, /localStorage\.setItem\(AUTO_DRAFT_KEY,JSON\.stringify\(item\)\)/);
  assert.match(html, /recoverUnnamedDraft\(\);/);
  assert.match(html, /upsertLocal\(deepClone\(item\)\);\s*scheduleCloudAutosave\(\)/);
});
test('cloud sync never infers a deletion from missing local IDs', () => {
  const scan = cloud.slice(cloud.indexOf('function queueScan(){'),cloud.indexOf('function scheduleScan(){'));
  assert.ok(scan.length>100);
  assert.doesNotMatch(scan, /op:\s*['"]delete['"]/);
  assert.match(cloud, /if\(op\.op==='delete'&&!op\.explicitUserDelete\)/);
});
test('development and production workers have separate D1 bindings', () => {
  assert.match(dev, /name = "mancardo-dev-test"/);
  assert.match(dev, /database_name = "mancardo-private-library-dev"/);
  assert.match(dev, /database_id = "DEV_DATABASE_ID_REQUIRED"/);
  assert.match(prod, /database_name = "mancardo-private-library"/);
  assert.match(deploy, /test "\$DEV_DB" != "6ada726b-aae6-441b-a698-69dc0789c7b7"/);
});
test('development autosave triggers cloud reconciliation', () => {
  assert.match(html, /mancardo:track-autosaved/);
  assert.match(cloud, /addEventListener\('mancardo:track-autosaved'/);
});

test('production preview URLs cannot access production D1', () => {
  assert.match(prod, /preview_urls = false/);
  assert.doesNotMatch(prod, /\[\[previews\.d1_databases\]\]/);
});

test('track cloud sync has a safety margin below the D1 hard limit', () => {
  assert.match(guard, /SAFE_TRACK_BYTES = Math\.floor\(1\.8 \* 1024 \* 1024\)/);
  assert.match(guard, /WARN_TRACK_BYTES = Math\.floor\(1\.6 \* 1024 \* 1024\)/);
  assert.match(guard, /code:'track_safety_limit'/);
  assert.match(guard, /x-mancardo-track-size-warning/);
  assert.match(prod, /main = "worker-track-size-guard\.js"/);
  assert.match(dev, /main = "worker-track-size-guard\.js"/);
});
