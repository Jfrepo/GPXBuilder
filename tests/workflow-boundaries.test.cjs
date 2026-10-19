// Offline workflow-boundary regression checks. Only exact local workflow text,
// synthetic env values, a no-network shell block, and in-memory config are used.
// No deploy command, external API, browser, database, or real secret is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const productionWorkflow = read('.github/workflows/cloudflare-workers.yml');
const developmentWorkflow = read('.github/workflows/cloudflare-dev.yml');
const noDeployWorkflow = read('.github/workflows/delete-qualification.yml');
const ordinary = developmentWorkflow.split('  deploy-reviewed-candidate:')[0];
const template = read('wrangler.dev.toml');
const production = '6ada726b-aae6-441b-a698-69dc0789c7b7';
const development = '11111111-2222-3333-aaaa-555555555555';
const sha256 = value => createHash('sha256').update(value).digest('hex');

function stepScript(name, workflow = ordinary) {
  const prefix = '      - name: ' + name + '\n';
  const start = workflow.indexOf(prefix);
  assert.notEqual(start, -1, 'Expected workflow step: ' + name);
  const next = workflow.indexOf('      - name:', start + prefix.length);
  const step = workflow.slice(start, next === -1 ? workflow.length : next);
  const run = step.match(/        run: \|\n([\s\S]*)/);
  assert.ok(run, 'Expected literal run block');
  return run[1].trimEnd().split('\n').map(line => line.replace(/^          /, '')).join('\n');
}
const credentialsScript = stepScript('Validate isolated development credentials');
function nodeScript(name) {
  const script = stepScript(name).match(/^node -e '([^\n]+)'$/);
  assert.ok(script, 'Expected exact single Node expression');
  return script[1];
}
const injectScript = nodeScript('Inject dedicated development D1 binding');
const targetScript = nodeScript('Verify exact Development deployment target');
function runCredentials(databaseId) {
  return spawnSync('/bin/bash', ['-e', '-c', credentialsScript], {
    encoding: 'utf8', timeout: 2000,
    env: {PATH: '/usr/bin:/bin', CF_TOKEN: 'synthetic-not-a-credential', CF_ACCOUNT: 'synthetic-account', DEV_DB: databaseId}
  });
}
function runNodeScript(script, databaseId, initialConfig = template) {
  let config = initialConfig;
  const writes = [];
  const logs = [];
  let exitCode = 0;
  const stopped = {};
  try {
    vm.runInNewContext(script, {
      process: {env: {DEV_DB: databaseId}, exit(code) {exitCode = code; throw stopped;}},
      console: {log(message) {logs.push(message);}},
      require(name) {
        assert.equal(name, 'fs');
        return {
          readFileSync(file, encoding) {assert.equal(file, 'wrangler.dev.toml'); assert.equal(encoding, 'utf8'); return config;},
          writeFileSync(file, value) {assert.equal(file, 'wrangler.dev.toml'); config = value; writes.push({file, value});}
        };
      }
    }, {timeout: 1000});
  } catch (error) {if (error !== stopped) throw error;}
  return {exitCode, config, writes, logs};
}

// This intentionally supports only the reviewed one-expression job gate and
// existing trigger shape, not arbitrary GitHub Actions expressions. GitHub ==
// string comparisons ignore case; a case variant is intentionally admitted by
// the job expression and must then be rejected by the exact-case shell step.
function productionJobSelected(eventName, ref) {
  assert.match(productionWorkflow, /on:\n  push:\n    branches: \[main\]\n  workflow_dispatch:\n/);
  const gate = productionWorkflow.match(/^    if: github\.ref == '([^']+)'$/m);
  const triggered = eventName === 'workflow_dispatch' || (eventName === 'push' && ref === 'refs/heads/main');
  return triggered && (!gate || ref.toLowerCase() === gate[1].toLowerCase());
}

test('Production deploy job adds only the reviewed main-ref job gate and pre-checkout exact-case guard', () => {
  const condition = "    if: github.ref == 'refs/heads/main'\n";
  assert.equal(productionWorkflow.split(condition).length - 1, 1);
  assert.match(productionWorkflow, /  deploy:\n    name: Deploy \$\{\{ github.ref_name \}\}\n    if: github.ref == 'refs\/heads\/main'\n    runs-on:/);
  const preflight = '      - name: Verify exact Production branch\n' +
    '        run: |\n' +
    '          test "$GITHUB_REF" = "refs/heads/main" || { echo "::error::Refusing Production deployment outside exact main branch"; exit 1; }\n\n';
  assert.equal(productionWorkflow.split(preflight).length - 1, 1);
  assert.match(productionWorkflow, /    steps:\n      - name: Verify exact Production branch/);
  assert.ok(productionWorkflow.indexOf(preflight) < productionWorkflow.indexOf('      - name: Check out source'));
  assert.equal(sha256(productionWorkflow.replace(condition, '').replace(preflight, '')),
    '379b69b8fbb2b28f16f33a1848464593efa45b877f425baebe2aa07dd68f5aeb',
    'Production triggers, commands, permissions, environment, and all other bytes stay unchanged');
});

test('Production event/ref job selection skips ordinary non-main routes while case variants reach the exact-case preflight', async t => {
  const cases = [
    ['push main', 'push', 'refs/heads/main', true],
    ['dispatch main', 'workflow_dispatch', 'refs/heads/main', true],
    ['dispatch case-variant Main reaches preflight', 'workflow_dispatch', 'refs/heads/Main', true],
    ['dispatch candidate', 'workflow_dispatch', 'refs/heads/chatgpt/mancardo-delete-qualification', false],
    ['dispatch Development', 'workflow_dispatch', 'refs/heads/mancardo-dev', false],
    ['dispatch release', 'workflow_dispatch', 'refs/heads/release/accelerated-stability-20261016', false],
    ['dispatch tag called main', 'workflow_dispatch', 'refs/tags/main', false],
    ['push Development', 'push', 'refs/heads/mancardo-dev', false],
    ['pull request', 'pull_request', 'refs/pull/80/merge', false]
  ];
  for (const [name, event, ref, expected] of cases) await t.test(name, () => assert.equal(productionJobSelected(event, ref), expected));
});

test('exact Production pre-checkout shell allows only case-sensitive main and rejects case variants, tags and absent refs', async t => {
  const script = stepScript('Verify exact Production branch', productionWorkflow);
  for (const [name, ref, expected] of [
    ['canonical main', 'refs/heads/main', 0], ['Main variant', 'refs/heads/Main', 1],
    ['MAIN variant', 'refs/heads/MAIN', 1], ['prefix case variant', 'refs/Heads/main', 1],
    ['main tag', 'refs/tags/main', 1], ['feature branch', 'refs/heads/chatgpt/mancardo-delete-qualification', 1],
    ['absent ref', '', 1], ['newline suffix', 'refs/heads/main\n', 1]
  ]) {
    await t.test(name, () => {
      const result = spawnSync('/bin/bash', ['-e', '-c', script], {
        encoding: 'utf8', timeout: 2000, env: {PATH: '/usr/bin:/bin', GITHUB_REF: ref}
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, expected);
      assert.equal(result.stderr, '');
      if (expected === 0) assert.equal(result.stdout, '');
      else {
        assert.equal(result.stdout, '::error::Refusing Production deployment outside exact main branch\n');
        if (ref) assert.ok(!result.stdout.includes(ref), 'Do not log the supplied ref');
      }
    });
  }
});

test('exact ordinary credential shell rejects Production UUID in lower, upper, and mixed case', async t => {
  for (const [name, id] of [['lower', production], ['upper', production.toUpperCase()], ['mixed', '6Ada726B-aAe6-441b-A698-69Dc0789C7b7']]) {
    await t.test(name, () => {
      const result = runCredentials(id);
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /Refusing to bind production D1 database to development/);
      assert.equal(result.stderr, '');
      assert.ok(!result.stdout.includes(id), 'Do not print supplied IDs');
    });
  }
});

test('exact final target script independently rejects Production UUID case variants', async t => {
  for (const [name, id] of [['lower', production], ['upper', production.toUpperCase()], ['mixed', '6Ada726B-aAe6-441b-A698-69Dc0789C7b7']]) {
    await t.test(name, () => {
      const result = runNodeScript(targetScript, id, template.replace('DEV_DATABASE_ID_REQUIRED', id));
      assert.equal(result.exitCode, 1);
      assert.equal(result.writes.length, 0);
      assert.equal(result.logs.length, 0);
    });
  }
});

test('exact ordinary scripts preserve synthetic non-Production lowercase and uppercase target behavior', () => {
  for (const id of [development, development.toUpperCase()]) {
    const credentials = runCredentials(id);
    assert.equal(credentials.error, undefined);
    assert.equal(credentials.status, 0);
    const injected = runNodeScript(injectScript, id);
    assert.equal(injected.exitCode, 0);
    assert.deepEqual(injected.writes, [{file: 'wrangler.dev.toml', value: template.replace('DEV_DATABASE_ID_REQUIRED', id)}]);
    const target = runNodeScript(targetScript, id, injected.config);
    assert.equal(target.exitCode, 0);
    assert.equal(target.writes.length, 0);
  }
});

test('ordinary guard still rejects absent credentials, malformed IDs and wrong target templates', () => {
  assert.equal(runCredentials('').status, 1);
  assert.equal(runNodeScript(injectScript, 'not-a-uuid').exitCode, 1);
  for (const config of [template, template.replace('mancardo-dev-test', 'other-worker').replace('DEV_DATABASE_ID_REQUIRED', development),
    template.replace('mancardo-private-library-dev', 'other-database').replace('DEV_DATABASE_ID_REQUIRED', development)]) {
    assert.equal(runNodeScript(targetScript, development, config).exitCode, 1);
  }
});

test('ordinary Development change is limited to two case-normalized Production UUID comparisons', () => {
  assert.equal(ordinary.split('test "${DEV_DB,,}" !=').length - 1, 1);
  assert.equal(ordinary.split('t.toLowerCase().includes("' + production + '")').length - 1, 1);
  const restored = ordinary.replace('test "${DEV_DB,,}" !=', 'test "$DEV_DB" !=')
    .replace('t.toLowerCase().includes("' + production + '")', 't.includes("' + production + '")');
  assert.equal(sha256(restored), '5458931ca490d25b50e260c8a6e3e21e1b8592bd4ad5d48dad69de3c4243989a');
});

test('immutable manual Development route matches the separately reviewed 492f222a preparation', () => {
  assert.equal(sha256(developmentWorkflow.split('  deploy-reviewed-candidate:')[1]),
    '777a02f96c13b5e0271e79c056cd88131f8c64019b4e38e8b224150b8668776f');
});

test('combined no-deploy qualification adds only the three reviewed suites without changing triggers or jobs', () => {
  const additions = ['tests/live-pull-review.test.cjs', 'tests/shared-mutation-ack.test.cjs', 'tests/workflow-boundaries.test.cjs'];
  assert.ok(noDeployWorkflow.includes('tests/d1-mutation-ack.test.cjs ' + additions.join(' ') + '\n'));
  let normalized = noDeployWorkflow;
  for (const path of additions) {
    const addition = ' ' + path;
    assert.equal(noDeployWorkflow.split(addition).length - 1, 1);
    normalized = normalized.replace(addition, '');
  }
  assert.equal(sha256(normalized),
    '697011f3bd8888ad86a6d17e3083b8082eb2671c67ac4398808925644b568a1a');
});
