// Offline, deterministic Production packaging. Never invokes Wrangler or a network API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist/production');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const assets = ['index.html'];
function guard(config) {
  const expected = {
    name: 'mancardo', main: 'worker-delete-durable-fix.js',
    database_name: 'mancardo-private-library',
    database_id: '6ada726b-aae6-441b-a698-69dc0789c7b7',
    binding: ['ASSETS', 'PRIVATE_LIBRARY_DB'],
  };
  for (const [key, value] of Object.entries(expected)) {
    const actual = [...config.matchAll(new RegExp('^' + key + ' = "([^"]+)"$', 'gm'))].map(m => m[1]);
    if (JSON.stringify(actual) !== JSON.stringify(Array.isArray(value) ? value : [value])) throw Error('Unexpected Production ' + key);
  }
  if (!/^preview_urls = false$/m.test(config) || /qualification|DEV_DATABASE|mancardo-dev/i.test(config)) throw Error('Unsafe Production configuration');
  if (digest(config) !== '855b18b83974dc7f6509b9a83fdce616fc6684548e6dd3c9c6aaecf592ee30eb') throw Error('Unreviewed Production configuration bytes');
  if (!/^directory = "dist\/production\/assets"$/m.test(config)) throw Error('Unexpected asset directory');
}
function graph(entry) {
  const files = new Set();
  function visit(file) {
    if (files.has(file)) return;
    if (!/^worker[-a-z0-9]*\.js$/.test(file) || /qualification/.test(file)) throw Error('Unexpected runtime module: ' + file);
    files.add(file);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const m of source.matchAll(/\b(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)) {
      if (!m[2].startsWith('./')) throw Error('Nonlocal runtime dependency');
      visit(m[2].slice(2));
    }
  }
  visit(entry);
  return [...files].sort();
}
function build() {
  const config = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
  guard(config);
  const runtime = graph('worker-delete-durable-fix.js');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  for (const file of runtime) fs.copyFileSync(path.join(root, file), path.join(out, file));
  for (const file of assets) fs.copyFileSync(path.join(root, file), path.join(out, 'assets', file));
  fs.writeFileSync(path.join(out, 'wrangler.toml'), config.replace('directory = "dist/production/assets"', 'directory = "assets"'));
  const files = [...runtime, ...assets.map(f => 'assets/' + f), 'wrangler.toml'].sort();
  const manifest = Object.fromEntries(files.map(file => [file, digest(fs.readFileSync(path.join(out, file)))]));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Production artifact: ' + runtime.length + ' modules; assets: ' + assets.join(', ') + '; manifest SHA256 ' + digest(fs.readFileSync(path.join(out, 'manifest.json'))));
  return manifest;
}
module.exports = { build, guard, graph, assets, out, digest };
if (require.main === module) build();
