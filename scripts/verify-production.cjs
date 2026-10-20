// Fail-closed offline identity and package validation. Never deploys or calls an API.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { guard, digest, out } = require('./build-production.cjs');
function identity(env, head, requireApproval = false) {
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main') throw Error('Manual exact-main dispatch required');
  if (!/^[a-f0-9]{40}$/.test(env.RELEASE_SHA || '') || env.RELEASE_SHA !== env.GITHUB_SHA || env.RELEASE_SHA !== head) throw Error('Exact dispatched source SHA required');
  if (!/^[a-f0-9]{64}$/.test(env.RELEASE_MANIFEST || '')) throw Error('Exact manifest SHA256 required');
  if (requireApproval && (env.PRODUCTION_APPROVED_SOURCE_SHA !== head || env.PRODUCTION_APPROVED_MANIFEST_SHA256 !== env.RELEASE_MANIFEST)) throw Error('Independent Production approval identity missing or mismatched');
}
function verify(directory, expected) {
  if (!/^[a-f0-9]{64}$/.test(expected || '')) throw Error('Invalid manifest digest');
  const files = [];
  function walk(dir, prefix = '') {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name), relative = prefix + name;
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw Error('Symlinks forbidden');
      if (stat.isDirectory()) walk(file, relative + '/');
      else if (stat.isFile()) files.push(relative);
      else throw Error('Nonregular artifact file');
    }
  }
  walk(directory);
  const bytes = fs.readFileSync(path.join(directory, 'manifest.json'));
  if (digest(bytes) !== expected) throw Error('Artifact manifest is not the approved digest');
  const manifest = JSON.parse(bytes);
  if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') throw Error('Invalid manifest');
  const keys = Object.keys(manifest);
  if (JSON.stringify(files.sort()) !== JSON.stringify([...keys, 'manifest.json'].sort())) throw Error('Unexpected or missing artifact files');
  for (const file of keys) {
    if (!/^(?:worker[-a-z0-9]*\.js|assets\/index\.html|wrangler\.toml)$/.test(file) || file.includes('qualification')) throw Error('Forbidden artifact path');
    if (!/^[a-f0-9]{64}$/.test(manifest[file]) || digest(fs.readFileSync(path.join(directory, file))) !== manifest[file]) throw Error('Artifact bytes changed');
  }
  for (const file of ['worker-delete-durable-fix.js', 'assets/index.html', 'wrangler.toml']) if (!keys.includes(file)) throw Error('Required artifact file missing');
  const config = fs.readFileSync(path.join(directory, 'wrangler.toml'), 'utf8');
  if (!/^directory = "assets"$/m.test(config)) throw Error('Unexpected packaged assets');
  guard(config.replace('directory = "assets"', 'directory = "dist/production/assets"'));
}
module.exports = { identity, verify };
if (require.main === module) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: path.resolve(__dirname, '..'), encoding:'utf8'}).trim();
  identity(process.env, head, process.argv.includes('--approved'));
  verify(out, process.env.RELEASE_MANIFEST);
  console.log('Verified exact source, manifest, artifact bytes and Production target');
}
