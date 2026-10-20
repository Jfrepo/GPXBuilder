// Actual outer Worker, signed synthetic Access JWTs, and real in-memory SQLite.
// Uses the committed schema/history triggers and trigger-inclusive D1 metadata.
// Fault injection changes only the D1 transport, never the authorization or SQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(process.env.MANCARDO_SHARED_TEST_ROOT || path.join(__dirname, '..'));
const { fixture } = require(path.join(root, 'tests/helpers/server-owner-harness.cjs'));
const NAME = 'Synthetic Shared acknowledgement';
const gpx = (note, name = NAME) => '<?xml version="1.0"?><gpx version="1.1" creator="Synthetic test"><trk><name>' + name + '</name><desc>' + note + '</desc><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0.001" lon="0.001"/></trkseg></trk></gpx>';
const isMutation = sql => /^\s*(?:UPDATE\s+shared_library_tracks|DELETE\s+FROM\s+shared_library_tracks)\b/i.test(sql);
const mutations = x => x.f.statements.filter(statement => isMutation(statement.sql));
function expect(response, status, code) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  if (code) assert.equal(response.body.code, code);
  return response.body;
}
function adaptedEnvironment(x, adapt) {
  const db = x.f.env.PRIVATE_LIBRARY_DB;
  return { ...x.f.env, PRIVATE_LIBRARY_DB: {
    prepare(sql) {
      function wrap(statement, values = []) {
        return {
          bind(...args) { return wrap(statement.bind(...args), args); },
          first(...args) { return statement.first(...args); },
          all(...args) { return isMutation(sql) ? adapt({ sql, values, method: 'all', execute: () => statement.all(...args) }) : statement.all(...args); },
          run(...args) { return isMutation(sql) ? adapt({ sql, values, method: 'run', execute: () => statement.run(...args) }) : statement.run(...args); },
        };
      }
      return wrap(db.prepare(sql));
    },
  } };
}
async function setup(t) {
  const f = await fixture(t);
  const schema = fs.readFileSync(path.join(root, 'migrations/0002_shared_library.sql'), 'utf8');
  const statements = schema.match(/CREATE (?:TABLE|INDEX)[\s\S]*?;|CREATE TRIGGER[\s\S]*?END;/g);
  assert.equal(statements.length, 6);
  for (const sql of statements) await f.env.PRIVATE_LIBRARY_DB.prepare(sql).run();
  assert.equal((await f.env.PRIVATE_LIBRARY_DB.prepare('PRAGMA foreign_keys').first()).foreign_keys, 1);
  const worker = (await import(pathToFileURL(process.env.MANCARDO_DELETE_TEST_ENTRY || path.join(root, 'worker-delete-durable-fix.js')).href)).default;
  async function request(route, method = 'GET', body, env = f.env, owner = 'a', token = f.tokens[owner]) {
    const headers = { 'content-type': 'application/json' };
    if (token != null) headers['Cf-Access-Jwt-Assertion'] = token;
    // Convert a rejected Worker fetch to a distinctive test value, never to 500.
    // The baseline fails the JSON error assertion rather than hiding the defect.
    try {
      const response = await worker.fetch(new Request('https://mancardo-owner-fixture.invalid/api/tracks' + route, {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }), env, { waitUntil() { throw Error('No background work allowed'); } });
      const text = await response.text();
      return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
    } catch (error) { return { status: 'rejected', body: { error: String(error.message) } }; }
  }
  const created = expect(await request('', 'POST', { name: NAME, gpx: gpx('Original exact note') }), 201);
  assert.equal(created.version, 1);
  return {
    f, request, id: created.id,
    publish(note, base = 1, env = f.env, owner = 'a', name = NAME) {
      return request('/' + created.id + '/publish', 'POST', { basedOnVersion: base, gpx: gpx(note, name) }, env, owner);
    },
    remove(env = f.env, owner = 'a') { return request('/' + created.id, 'DELETE', undefined, env, owner); },
    async snapshot() {
      return {
        tracks: (await f.env.PRIVATE_LIBRARY_DB.prepare('SELECT * FROM shared_library_tracks ORDER BY track_id').all()).results,
        history: (await f.env.PRIVATE_LIBRARY_DB.prepare('SELECT * FROM shared_library_versions ORDER BY track_id,version').all()).results,
      };
    },
  };
}

test('Shared mutation acknowledgements use atomic rows without changing existing API predicates', { concurrency: false }, async t => {
  await t.test('publish succeeds with exact GPX and immutable history despite trigger-inclusive count two', async t => {
    const x = await setup(t), before = await x.snapshot();
    const response = expect(await x.publish('Exact newer note'), 200);
    const after = await x.snapshot();
    assert.equal(response.id, x.id); assert.equal(response.version, 2);
    assert.equal(response.modifiedAt, new Date(after.tracks[0].modified_at).toISOString());
    assert.equal(response.modifiedBy, after.tracks[0].modified_by);
    assert.equal(after.tracks[0].gpx, gpx('Exact newer note'));
    assert.equal(after.tracks[0].current_version, 2); assert.equal(after.tracks[0].deleted, 0);
    assert.deepEqual(after.history[0], before.history[0]);
    assert.deepEqual(after.history.map(row => row.version), [1, 2]);
    assert.equal(after.history[1].gpx, gpx('Exact newer note'));
    const [write] = mutations(x); assert.equal(mutations(x).length, 1);
    assert.equal(write.method, 'all'); assert.match(write.sql, /\bRETURNING\b/i);
    assert.equal(write.directChanges, 1); assert.equal(write.totalChanges, 2);
    assert.equal(write.results.length, 1); assert.equal(write.results[0].track_id, x.id);
  });

  await t.test('physical delete acknowledges one track plus its cascading history rows; repeat is a genuine no-op', async t => {
    const x = await setup(t);
    expect(await x.publish('Version two'), 200); expect(await x.publish('Version three', 2), 200);
    expect(await x.request('', 'POST', { name: 'Other', gpx: gpx('Unrelated', 'Other') }), 201);
    const before = await x.snapshot(), unrelated = before.tracks.find(row => row.track_id !== x.id);
    assert.deepEqual(expect(await x.remove(), 200), { ok: true, id: x.id, deleted: true, alreadyDeleted: false });
    const after = await x.snapshot(); assert.deepEqual(after.tracks, [unrelated]);
    assert.deepEqual(after.history, before.history.filter(row => row.track_id !== x.id));
    expect(await x.request('/' + x.id + '/gpx'), 404, 'not_found');
    const write = mutations(x).at(-1);
    assert.equal(write.method, 'all'); assert.match(write.sql, /\bRETURNING\s+track_id/i);
    assert.equal(write.directChanges, 1); assert.equal(write.totalChanges, 4);
    assert.deepEqual(write.results, [{ track_id: x.id }]);
    assert.deepEqual(expect(await x.remove(), 200), { ok: true, id: x.id, deleted: false, alreadyDeleted: true });
    assert.deepEqual(await x.snapshot(), after);
    assert.equal(mutations(x).at(-1).totalChanges, 0); assert.deepEqual(mutations(x).at(-1).results, []);
  });

  await t.test('missing and misleading counts cannot override valid exact returned rows', async t => {
    const x = await setup(t);
    for (const [index, changes] of [undefined, 0, 99].entries()) {
      const env = adaptedEnvironment(x, async ({ execute }) => {
        const result = await execute();
        return { ...result, meta: changes === undefined ? undefined : { ...result.meta, changes } };
      });
      expect(await x.publish('Exact count control ' + index, index + 1, env), 200);
    }
    const env = adaptedEnvironment(x, async ({ execute }) => ({ ...await execute(), meta: { changes: 99 } }));
    assert.equal(expect(await x.remove(env), 200).deleted, true);
    assert.equal(expect(await x.remove(env), 200).alreadyDeleted, true);
    assert.equal(mutations(x).length, 5, 'Acknowledgement handling must never replay a mutation');
  });

  await t.test('stale pre-read preserves state; absent delete remains idempotent', async t => {
    const x = await setup(t); expect(await x.publish('Current note'), 200);
    const before = await x.snapshot(), count = mutations(x).length;
    assert.equal(expect(await x.publish('Rejected stale note'), 409, 'revision_conflict').currentVersion, 2);
    assert.equal(mutations(x).length, count);
    assert.deepEqual(expect(await x.request('/missing', 'DELETE'), 200), { ok: true, id: 'missing', deleted: false, alreadyDeleted: true });
    assert.deepEqual(await x.snapshot(), before);
    assert.equal(mutations(x).at(-1).totalChanges, 0);
  });

  await t.test('CAS losing after pre-read remains a 409 even with a misleading positive aggregate count', async t => {
    const x = await setup(t); let calls = 0;
    const env = adaptedEnvironment(x, async ({ execute }) => {
      calls++; expect(await x.publish('Concurrent winner'), 200);
      return { ...await execute(), meta: { changes: 99 } };
    });
    assert.equal(expect(await x.publish('Rejected loser', 1, env), 409, 'revision_conflict').currentVersion, 2);
    assert.equal(calls, 1);
    assert.equal((await x.snapshot()).tracks[0].gpx, gpx('Concurrent winner'));
    assert.deepEqual((await x.snapshot()).history.map(row => row.version), [1, 2]);
    const loser = mutations(x).at(-1); assert.equal(loser.directChanges, 0); assert.deepEqual(loser.results, []);
  });

  await t.test('two same-version publishes have exactly one winner and one history insertion', async t => {
    const x = await setup(t), notes = ['First competing note', 'Second competing note'];
    const responses = await Promise.all(notes.map(note => x.publish(note)));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const after = await x.snapshot();
    assert.equal(after.tracks[0].gpx, gpx(notes[responses.findIndex(response => response.status === 200)]));
    assert.deepEqual(after.history.map(row => row.version), [1, 2]);
    assert.equal(mutations(x).filter(write => write.directChanges === 1).length, 1);
  });

  await t.test('two concurrent deletes distinguish the physical winner from the already-missing row', async t => {
    const x = await setup(t), responses = await Promise.all([x.remove(), x.remove()]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.deepEqual(responses.map(response => response.body.deleted).sort(), [false, true]);
    assert.deepEqual(responses.map(response => response.body.alreadyDeleted).sort(), [false, true]);
    assert.deepEqual(await x.snapshot(), { tracks: [], history: [] });
    assert.deepEqual(mutations(x).map(write => write.totalChanges).sort(), [0, 2]);
  });

  await t.test('delete between publish pre-read and atomic update cannot resurrect or claim success', async t => {
    const x = await setup(t); let calls = 0;
    const env = adaptedEnvironment(x, async ({ execute }) => {
      calls++; assert.equal(expect(await x.remove(), 200).deleted, true); return execute();
    });
    expect(await x.publish('Rejected resurrection', 1, env), 409, 'revision_conflict');
    assert.equal(calls, 1); assert.deepEqual(await x.snapshot(), { tracks: [], history: [] });
    assert.equal(mutations(x).at(-1).directChanges, 0);
  });

  await t.test('a later write cannot retroactively change this atomic publish acknowledgement', async t => {
    const x = await setup(t); let calls = 0;
    const env = adaptedEnvironment(x, async ({ execute }) => {
      calls++; const result = await execute(); expect(await x.publish('Later version', 2), 200); return result;
    });
    const first = expect(await x.publish('First version', 1, env), 200);
    assert.equal(first.version, 2); assert.equal(calls, 1);
    assert.equal((await x.snapshot()).tracks[0].current_version, 3);
    assert.equal((await x.snapshot()).tracks[0].gpx, gpx('Later version'));
    assert.deepEqual((await x.snapshot()).history.map(row => row.gpx), [gpx('Original exact note'), gpx('First version'), gpx('Later version')]);
  });

  await t.test('unauthenticated and invalid signed identities cannot publish or delete', async t => {
    const x = await setup(t), before = await x.snapshot(), count = mutations(x).length;
    for (const jwt of [null, 'invalid', x.f.token('a', { exp: 1 })]) {
      expect(await x.request('/' + x.id + '/publish', 'POST', { basedOnVersion: 1, gpx: gpx('Rejected') }, x.f.env, 'a', jwt), 401, 'authentication_required');
      expect(await x.request('/' + x.id, 'DELETE', undefined, x.f.env, 'a', jwt), 401, 'authentication_required');
    }
    assert.deepEqual(await x.snapshot(), before); assert.equal(mutations(x).length, count);
  });

  await t.test('existing authenticated collaborative access and renamed-track fork behavior remain unchanged', async t => {
    const x = await setup(t);
    // Shared Library intentionally has no private owner-id predicate or delete CAS.
    expect(await x.publish('Another authenticated collaborator', 1, x.f.env, 'b'), 200);
    const before = await x.snapshot();
    const fork = expect(await x.publish('Renamed fork', 1, x.f.env, 'b', 'Renamed synthetic track'), 201);
    assert.notEqual(fork.id, x.id); assert.equal(fork.version, 1); assert.equal(fork.forkedFrom, x.id);
    const after = await x.snapshot(); assert.equal(after.tracks.length, 2);
    assert.deepEqual(after.tracks.find(row => row.track_id === x.id), before.tracks[0]);
    assert.equal(after.tracks.find(row => row.track_id === fork.id).gpx, gpx('Renamed fork', 'Renamed synthetic track'));
    assert.equal(expect(await x.remove(x.f.env, 'b'), 200).deleted, true);
    assert.equal((await x.snapshot()).tracks[0].track_id, fork.id);
  });

  await t.test('outer stale-link recovery still creates a new Shared track for a missing publish target', async t => {
    const x = await setup(t), before = await x.snapshot();
    const recovered = expect(await x.request('/missing/publish', 'POST', { basedOnVersion: 1, gpx: gpx('Recovered stale link') }), 201);
    assert.notEqual(recovered.id, 'missing'); assert.notEqual(recovered.id, x.id); assert.equal(recovered.version, 1);
    const after = await x.snapshot(); assert.equal(after.tracks.length, 2);
    assert.deepEqual(after.tracks.find(row => row.track_id === x.id), before.tracks[0]);
    assert.equal(after.tracks.find(row => row.track_id === recovered.id).gpx, gpx('Recovered stale link'));
    assert.equal(mutations(x).length, 0);
  });

  for (const operation of ['publish', 'delete']) for (const committed of [false, true]) {
    await t.test(operation + ' transport throws ' + (committed ? 'after commit' : 'before execution') + ': error, exact state, no retry', async t => {
      const x = await setup(t), before = await x.snapshot(); let calls = 0;
      const env = adaptedEnvironment(x, async ({ execute }) => {
        calls++; if (committed) await execute(); throw new Error('Synthetic D1 transport failure');
      });
      const response = operation === 'publish' ? await x.publish('Possibly committed note', 1, env) : await x.remove(env);
      expect(response, 500, 'shared_error'); assert.equal(calls, 1);
      const after = await x.snapshot();
      if (!committed) assert.deepEqual(after, before);
      else if (operation === 'delete') assert.deepEqual(after, { tracks: [], history: [] });
      else {
        assert.equal(after.tracks[0].current_version, 2); assert.equal(after.tracks[0].gpx, gpx('Possibly committed note'));
        assert.deepEqual(after.history[0], before.history[0]); assert.equal(after.history.length, 2);
        // A later exact read establishes committed state; the error did not imply rollback.
        assert.equal(expect(await x.request('/' + x.id + '/gpx'), 200), gpx('Possibly committed note'));
      }
      assert.equal(mutations(x).length, committed ? 1 : 0);
    });
  }

  const malformed = [
    ['missing result object', () => undefined],
    ['missing success flag', value => ({ results: value.results })],
    ['false success flag', value => ({ ...value, success: false })],
    ['missing results', value => ({ success: true, meta: value.meta })],
    ['nonarray results', value => ({ ...value, results: {} })],
    ['multiple returned rows', value => ({ ...value, results: [value.results[0], value.results[0]] })],
    ['null row', value => ({ ...value, results: [null] })],
    ['wrong track identity', value => ({ ...value, results: [{ ...value.results[0], track_id: 'wrong-track' }] })],
  ];
  for (const operation of ['publish', 'delete']) for (const [label, corrupt] of malformed) {
    await t.test(operation + ' ' + label + ' after commit fails closed without replay or false conflict', async t => {
      const x = await setup(t); let calls = 0;
      const env = adaptedEnvironment(x, async ({ execute }) => { calls++; return corrupt(await execute()); });
      const response = operation === 'publish' ? await x.publish('Committed but unacknowledged', 1, env) : await x.remove(env);
      const error = expect(response, 500, 'shared_error'); assert.match(error.error, /acknowledgement is uncertain/);
      assert.equal(calls, 1); assert.equal(mutations(x).length, 1);
      const after = await x.snapshot();
      if (operation === 'delete') assert.deepEqual(after, { tracks: [], history: [] });
      else {
        assert.equal(after.tracks[0].current_version, 2); assert.equal(after.tracks[0].gpx, gpx('Committed but unacknowledged'));
        assert.deepEqual(after.history.map(row => row.version), [1, 2]);
      }
    });
  }
  for (const [field, wrong] of [['current_version', 99], ['gpx', 'wrong GPX'], ['modified_at', -1], ['modified_by', 'Wrong user'], ['deleted', 1]]) {
    await t.test('publish mismatched returned ' + field + ' is not a success acknowledgement', async t => {
      const x = await setup(t); let calls = 0;
      const env = adaptedEnvironment(x, async ({ execute }) => {
        calls++; const value = await execute(); return { ...value, results: [{ ...value.results[0], [field]: wrong }] };
      });
      expect(await x.publish('Exact committed content', 1, env), 500, 'shared_error');
      assert.equal(calls, 1); assert.equal((await x.snapshot()).tracks[0].gpx, gpx('Exact committed content'));
      assert.equal((await x.snapshot()).history.length, 2);
    });
  }
});
