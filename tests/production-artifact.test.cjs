const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { build, guard, graph, assets, out, digest } = require('../scripts/build-production.cjs');
const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
test('Production target guard rejects wrong Worker, D1, entrypoint, preview and root asset targets', () => {
  guard(config);
  for (const [before, after] of [
    ['name = "mancardo"', 'name = "other"'],
    ['database_name = "mancardo-private-library"', 'database_name = "other"'],
    [/database_id = "[^"]+"/, 'database_id = "synthetic-wrong-target"'],
    ['worker-delete-durable-fix.js', 'worker-owner-qualification.js'],
    ['preview_urls = false', 'preview_urls = true'],
    ['dist/production/assets', '.'],
  ]) assert.throws(() => guard(config.replace(before, after)));
});
test('allowlisted artifact is deterministic, complete, and serves the reviewed runtime without qualification', async () => {
  const first = build();
  assert.deepEqual(build(), first);
  assert.deepEqual(assets, ['index.html']);
  assert.deepEqual(fs.readdirSync(path.join(out, 'assets')), ['index.html']);
  assert.deepEqual(fs.readdirSync(out).sort(), [...Object.keys(first).filter(f => !f.startsWith('assets/')), 'assets', 'manifest.json'].sort());
  assert.ok(!graph('worker-delete-durable-fix.js').includes('worker-owner-qualification.js'));
  for (const [file, hash] of Object.entries(first)) assert.equal(digest(fs.readFileSync(path.join(out, file))), hash);
  const artifact = (await import(pathToFileURL(path.join(out, 'worker-delete-durable-fix.js')))).default;
  const reviewed = (await import('../worker-delete-durable-fix.js')).default;
  const env = { ASSETS: { fetch: async () => new Response(fs.readFileSync(path.join(out, 'assets/index.html')), {headers:{'content-type':'text/html'}}) },
    PRIVATE_LIBRARY_DB: {prepare() {throw Error('No database access allowed for HTML');}} };
  const html = await (await artifact.fetch(new Request('https://synthetic.invalid/'), env, {})).text();
  assert.equal(html, await (await reviewed.fetch(new Request('https://synthetic.invalid/'), env, {})).text());
  assert.match(html, /mancardoAuthorizedDelete/);
  assert.doesNotMatch(html, /owner-isolation-20261018|x-mancardo-qualification/);
  assert.match(fs.readFileSync(path.join(out, 'wrangler.toml'), 'utf8'), /^directory = "assets"$/m);
});
test('Production workflow builds the guarded artifact before deploying only that artifact', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/cloudflare-workers.yml'), 'utf8');
  assert.ok(workflow.indexOf('node scripts/build-production.cjs') < workflow.indexOf('npx --yes wrangler@4 deploy'));
  assert.match(workflow, /deploy --config dist\/production\/wrangler.toml/);
});
test('packaged Production has no Development qualification API even for an authenticated synthetic owner', async t => {
  const { fixture } = require('./helpers/server-owner-harness.cjs');
  const f = await fixture(t);
  const worker = (await import(pathToFileURL(path.join(out, 'worker-delete-durable-fix.js')))).default;
  const before = f.snapshot();
  const response = await worker.fetch(new Request('https://synthetic.invalid/api/private-library/qualification/owner-isolation', {
    headers: {'cf-access-jwt-assertion': f.tokens.a, 'x-mancardo-qualification-run': 'owner-isolation-20261018-1032'},
  }), f.env, {});
  assert.equal(response.status, 404);
  assert.deepEqual(f.snapshot(), before);
});
