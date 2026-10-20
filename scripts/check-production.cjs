// Local synthetic qualification only; browser fixtures intercept every request.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const suites = {
  source: ['release-safety','generated-html','delete-client','deployment-guard','delete-cross-client-node','remote-tombstone-review','server-owner-isolation','note-account-boundary','request-volume-client','owner-qualification-server','owner-qualification-client','d1-mutation-ack','live-pull-review','shared-mutation-ack','workflow-boundaries','production-artifact','production-release-guard'],
  'packaged-server': ['server-owner-isolation','d1-mutation-ack','shared-mutation-ack'],
  browser: ['delete-behavior','delete-cross-client','request-volume-browser','owner-qualification-browser'],
};
const suite = process.argv[2];
if (!suites[suite]) throw Error('Specify source or browser');
// Source artifact test builds before comparing. Browser suite uses that exact output.
if (suite !== 'source') require('./build-production.cjs').build();
const result = spawnSync(process.execPath, ['--test', ...suites[suite].map(n => 'tests/' + n + '.test.cjs')], {
  cwd: root, stdio: 'inherit', env: {...process.env,
    ...(suite !== 'source' ? {MANCARDO_DELETE_TEST_ENTRY: path.join(root, 'dist/production/worker-delete-durable-fix.js')} : {})},
});
process.exit(result.status ?? 1);
