const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {identity, verify} = require('../scripts/verify-production.cjs');
const {dependencies, graph, digest} = require('../scripts/build-production.cjs');
const root = path.resolve(__dirname, '..');
const sha = 'a'.repeat(40), hash = 'b'.repeat(64);
const good = {GITHUB_EVENT_NAME:'workflow_dispatch', GITHUB_REF:'refs/heads/main', GITHUB_SHA:sha, RELEASE_SHA:sha, RELEASE_MANIFEST:hash,
  PRODUCTION_APPROVED_SOURCE_SHA:sha, PRODUCTION_APPROVED_MANIFEST_SHA256:hash};
test('release identity rejects push, wrong refs, source drift and absent or mismatched independent approval', async t => {
  identity(good, sha, true);
  for (const [key, value] of [
    ['GITHUB_EVENT_NAME','push'], ['GITHUB_REF','refs/heads/Main'], ['GITHUB_REF','refs/tags/main'],
    ['RELEASE_SHA','c'.repeat(40)], ['RELEASE_SHA',sha+'\n'], ['GITHUB_SHA','c'.repeat(40)],
    ['RELEASE_MANIFEST',''], ['RELEASE_MANIFEST','b'.repeat(63)],
    ['PRODUCTION_APPROVED_SOURCE_SHA',''], ['PRODUCTION_APPROVED_SOURCE_SHA','c'.repeat(40)],
    ['PRODUCTION_APPROVED_MANIFEST_SHA256',''], ['PRODUCTION_APPROVED_MANIFEST_SHA256','c'.repeat(64)],
  ]) await t.test(key + ' rejects ' + (value || 'absent'), () => assert.throws(() => identity({...good,[key]:value},sha,true)));
  assert.throws(() => identity(good,'c'.repeat(40),true));
});
test('module graph includes side-effect imports and exports, ignores strings/comments, and rejects unsupported dependencies', () => {
  assert.deepEqual(dependencies(`import './worker-side.js'; export * from './worker-export.js'; const p=import('./worker-lazy.js'); const text="import 'fake'"; // import 'nope'`), ['./worker-side.js','./worker-export.js','./worker-lazy.js']);
  const sources = {'worker-root.js':"import './worker-side.js';", 'worker-side.js':'export default {}'};
  assert.deepEqual(graph('worker-root.js', f => sources[f]), ['worker-root.js','worker-side.js']);
  for (const source of ["import './worker-owner-qualification.js';", "import 'external';", "import '../worker-other.js';", 'import(target);']) {
    assert.throws(() => graph('worker-root.js', () => source));
  }
});
test('artifact verification rejects tampered bytes, extra files, missing files, symlinks and wrong approved manifest', async t => {
  // Synthetic minimal package uses the exact config; no production build mutation.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'mancardo-artifact-guard-'));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  fs.mkdirSync(path.join(directory,'assets'));
  const contents = {'worker-delete-durable-fix.js':'export default {};', 'assets/index.html':'<p>Synthetic only</p>',
    'wrangler.toml':fs.readFileSync(path.join(root,'wrangler.toml'),'utf8').replace('directory = "dist/production/assets"','directory = "assets"')};
  function reset() {
    for (const [file,content] of Object.entries(contents)) fs.writeFileSync(path.join(directory,file),content);
    const manifest=JSON.stringify(Object.fromEntries(Object.entries(contents).map(([f,c])=>[f,digest(c)])));
    fs.writeFileSync(path.join(directory,'manifest.json'),manifest);
    return digest(manifest);
  }
  const approved=reset(); verify(directory,approved);
  fs.appendFileSync(path.join(directory,'assets/index.html'),'tampered'); assert.throws(()=>verify(directory,approved)); reset();
  fs.writeFileSync(path.join(directory,'secret.txt'),'synthetic'); assert.throws(()=>verify(directory,approved)); fs.unlinkSync(path.join(directory,'secret.txt'));
  fs.unlinkSync(path.join(directory,'worker-delete-durable-fix.js')); assert.throws(()=>verify(directory,approved)); reset();
  fs.symlinkSync('index.html',path.join(directory,'assets/link')); assert.throws(()=>verify(directory,approved)); fs.unlinkSync(path.join(directory,'assets/link'));
  assert.throws(()=>verify(directory,'c'.repeat(64)));
  fs.appendFileSync(path.join(directory,'manifest.json'),' '); assert.throws(()=>verify(directory,approved));
});
test('deployment tooling is pinned exactly and workflow consumes the tested uploaded artifact without rebuilding', () => {
  const pkg=require('../package.json'),lock=require('../package-lock.json');
  assert.equal(pkg.devDependencies.wrangler,'4.151.3');
  assert.equal(lock.packages['node_modules/wrangler'].version,pkg.devDependencies.wrangler);
  assert.ok(lock.packages['node_modules/wrangler'].integrity);
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/cloudflare-workers.yml'),'utf8');
  const deploy=workflow.split('\n  deploy:\n')[1];
  assert.ok(deploy);
  assert.match(deploy,/actions\/download-artifact@v4/);
  assert.doesNotMatch(deploy,/build-production|check-production/);
  assert.ok(deploy.indexOf('verify-production.cjs --approved') < deploy.indexOf('wrangler deploy'));
  assert.match(deploy,/PRODUCTION_APPROVED_SOURCE_SHA: \$\{\{ vars.PRODUCTION_APPROVED_SOURCE_SHA \}\}/);
  assert.match(deploy,/PRODUCTION_APPROVED_MANIFEST_SHA256: \$\{\{ vars.PRODUCTION_APPROVED_MANIFEST_SHA256 \}\}/);
});
