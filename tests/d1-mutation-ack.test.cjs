// Actual final Worker, signed synthetic identities, and real in-memory SQLite
// with the committed history triggers. No live D1, credentials, or network.
// Fault injection changes only the D1 transport result, never SQL predicates.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, track, contentHash } = require('./helpers/server-owner-harness.cjs');

const isMutation = sql => /^\s*(?:INSERT\s+OR\s+IGNORE\s+INTO|UPDATE)\s+private_library_tracks\b/i.test(sql);
const mutations = f => f.statements.filter(statement => isMutation(statement.sql));
function expect(result, status, code) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (code) assert.equal(result.body.code, code);
  return result.body;
}
function adaptedEnvironment(f, adapt) {
  const db = f.env.PRIVATE_LIBRARY_DB;
  return { ...f.env, PRIVATE_LIBRARY_DB: {
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
function put(f, value, revision, env, owner = 'a') {
  return f.request(owner, '/tracks/' + value.id, { method: 'PUT', env,
    headers: { 'x-mancardo-private-account': f.accountKeys[owner] },
    body: { base_revision: revision, track: value, device_id: 'local-ack-fixture' } });
}
function remove(f, id, revision, env, owner = 'a') {
  return f.request(owner, '/tracks/' + id, { method: 'DELETE', env,
    headers: { 'x-mancardo-delete-account': f.accountKeys[owner] },
    body: { base_revision: revision, device_id: 'local-ack-fixture', authorized_user_delete: true, delete_intent: 'explicit-ui-delete' } });
}

test('D1 mutation acknowledgments use atomic affected rows, not trigger-inclusive counts', { concurrency: false }, async t => {
  await t.test('create, update and delete acknowledge one direct mutation plus its immutable history row', async t => {
    const f = await fixture(t), original = { ...track('ack-history', 'Synthetic original'), note: 'Exact first note' };
    expect(await f.request('a', '/tracks/' + original.id), 404, 'not_found');
    const created = expect(await f.put('a', original), 201);
    assert.equal(created.revision, 1); assert.equal(created.sha256, contentHash(original));
    assert.equal(f.snapshot().rows.length, 1); assert.equal(f.snapshot().history.length, 1);
    const newer = { ...original, note: 'Exact newer note' };
    const updated = expect(await f.put('a', newer, 1), 200);
    assert.equal(updated.revision, 2); assert.equal(updated.sha256, contentHash(newer));
    assert.deepEqual(expect(await f.request('a', '/tracks/' + original.id), 200).track, newer);
    const deleted = expect(await f.remove('a', original.id, 2), 200);
    assert.equal(deleted.revision, 3); assert.equal(deleted.deleted, true);
    const final = expect(await f.request('a', '/tracks/' + original.id), 200);
    assert.equal(final.revision, 3); assert.equal(final.deleted, true); assert.equal(final.track, null);
    assert.equal(final.sha256, contentHash(newer));
    const state = f.snapshot();
    assert.equal(state.rows.length, 1);
    assert.deepEqual(state.history.map(row => [row.revision, row.deleted]), [[1, 0], [2, 0], [3, 1]]);
    assert.deepEqual(JSON.parse(state.history[0].payload_json), original);
    assert.deepEqual(JSON.parse(state.history[1].payload_json), newer);
    assert.deepEqual(JSON.parse(state.history[2].payload_json), newer);
    const writes = mutations(f); assert.equal(writes.length, 3);
    for (const statement of writes) {
      assert.equal(statement.method, 'all'); assert.match(statement.sql, /\bRETURNING\b/i);
      assert.equal(statement.directChanges, 1); assert.equal(statement.totalChanges, 2);
      assert.equal(statement.results.length, 1);
    }
  });

  await t.test('missing or misleading aggregate counts cannot override valid atomic affected rows', async t => {
    const f = await fixture(t);
    for (const [index, changes] of [undefined, 0, 99].entries()) {
      const env = adaptedEnvironment(f, async ({ execute }) => {
        const actual = await execute();
        return { ...actual, meta: changes === undefined ? undefined : { ...actual.meta, changes } };
      });
      const value = { ...track('ack-meta-' + index, 'Synthetic metadata control'), note: 'Preserve this exact note' };
      expect(await put(f, value, 0, env), 201);
      expect(await put(f, { ...value, note: 'A newer exact note' }, 1, env), 200);
      expect(await remove(f, value.id, 2, env), 200);
    }
    assert.equal(f.snapshot().rows.length, 3); assert.equal(f.snapshot().history.length, 9);
    assert.equal(mutations(f).length, 9, 'No acknowledgment correction may retry a mutation');
  });

  await t.test('duplicate, stale, foreign and repeated-tombstone zero-match operations remain conflicts without any mutation', async t => {
    const f = await fixture(t), value = track('ack-conflicts', 'A synthetic baseline');
    expect(await f.put('a', value), 201);
    expect(await f.put('a', { ...value, note: 'Revision two' }, 1), 200);
    const env = adaptedEnvironment(f, async ({ execute }) => ({ ...await execute(), meta: { changes: 99 } }));
    const controls = [
      ['duplicate create', () => put(f, value, 0, env), false],
      ['stale update', () => put(f, { ...value, note: 'Rejected stale note' }, 1, env), false],
      ['stale delete', () => remove(f, value.id, 1, env), false],
      ['foreign update', () => put(f, { ...value, note: 'Rejected foreign note' }, 2, env, 'b'), true],
      ['foreign delete', () => remove(f, value.id, 2, env, 'b'), true],
    ];
    for (const [label, operation, foreign] of controls) {
      const before = f.snapshot(), count = mutations(f).length;
      const result = expect(await operation(), 409, 'revision_conflict');
      assert.deepEqual(f.snapshot(), before, label + ' must preserve both owners and all history');
      if (foreign) assert.equal(result.current, null); else assert.equal(result.current.revision, 2);
      const writes = mutations(f).slice(count); assert.equal(writes.length, 1);
      assert.equal(writes[0].directChanges, 0); assert.equal(writes[0].totalChanges, 0);
      assert.deepEqual(writes[0].results, []);
    }
    expect(await f.remove('a', value.id, 2), 200);
    const tombstone = f.snapshot();
    const repeated = expect(await remove(f, value.id, 3, env), 409, 'revision_conflict');
    assert.equal(repeated.current.revision, 3); assert.equal(repeated.current.deleted, 1);
    assert.deepEqual(f.snapshot(), tombstone, 'Matching tombstone revision still cannot authorize another DELETE');
  });

  await t.test('concurrent same-revision updates have exactly one winner and one history insertion', async t => {
    const f = await fixture(t), value = track('ack-update-race', 'Concurrent synthetic updates');
    expect(await f.put('a', value), 201);
    const candidates = [{ ...value, note: 'First competing note' }, { ...value, note: 'Second competing note' }];
    const responses = await Promise.all(candidates.map(candidate => f.put('a', candidate, 1)));
    assert.deepEqual(responses.map(result => result.status).sort(), [200, 409]);
    const winner = candidates[responses.findIndex(result => result.status === 200)];
    assert.deepEqual(expect(await f.request('a', '/tracks/' + value.id), 200).track, winner);
    assert.deepEqual(f.snapshot().history.map(row => row.revision), [1, 2]);
    assert.deepEqual(mutations(f).slice(1).map(row => row.totalChanges).sort(), [0, 2]);
  });

  await t.test('concurrent base-zero creates insert once without replacing the winner', async t => {
    const f = await fixture(t), value = track('ack-create-race', 'Concurrent synthetic creates');
    const candidates = [{ ...value, note: 'First create note' }, { ...value, note: 'Second create note' }];
    const responses = await Promise.all(candidates.map(candidate => f.put('a', candidate, 0)));
    assert.deepEqual(responses.map(result => result.status).sort(), [201, 409]);
    const winner = candidates[responses.findIndex(result => result.status === 201)];
    assert.deepEqual(expect(await f.request('a', '/tracks/' + value.id), 200).track, winner);
    assert.equal(f.snapshot().rows.length, 1); assert.equal(f.snapshot().history.length, 1);
    assert.deepEqual(mutations(f).map(row => row.totalChanges).sort(), [0, 2]);
  });

  for (const phase of ['before execution', 'after committed execution']) {
    await t.test('binding throws ' + phase + ': no success acknowledgment or automatic retry', async t => {
      const f = await fixture(t);
      const value = track('ack-throw-' + phase.split(' ')[0], 'Synthetic transport uncertainty');
      let calls = 0;
      const env = adaptedEnvironment(f, async ({ execute }) => {
        calls++; if (phase === 'after committed execution') await execute();
        throw new Error('Synthetic binding transport failure');
      });
      expect(await put(f, value, 0, env), 500, 'server_error');
      assert.equal(calls, 1);
      const committed = phase === 'after committed execution';
      assert.equal(f.snapshot().rows.length, committed ? 1 : 0);
      assert.equal(f.snapshot().history.length, committed ? 1 : 0);
      if (committed) assert.deepEqual(expect(await f.request('a', '/tracks/' + value.id), 200).track, value);
      else expect(await f.request('a', '/tracks/' + value.id), 404, 'not_found');
    });
  }

  for (const operation of ['update', 'delete']) for (const committed of [false, true]) {
    await t.test(operation + ' binding failure ' + (committed ? 'after commit' : 'before execution') + ' never replays or claims success', async t => {
      const f = await fixture(t), value = { ...track('ack-' + operation + '-' + committed, 'Synthetic transport boundary'), note: 'Original exact note' };
      expect(await f.put('a', value), 201);
      const before = f.snapshot(), newer = { ...value, note: 'New exact note at the transport boundary' };
      let calls = 0;
      const env = adaptedEnvironment(f, async ({ execute }) => {
        calls++; if (committed) await execute();
        throw new Error('Synthetic binding transport failure');
      });
      const response = operation === 'update' ? await put(f, newer, 1, env) : await remove(f, value.id, 1, env);
      expect(response, 500, 'server_error'); assert.equal(calls, 1);
      if (!committed) assert.deepEqual(f.snapshot(), before);
      else {
        const current = expect(await f.request('a', '/tracks/' + value.id), 200);
        assert.equal(current.revision, 2);
        assert.equal(current.deleted, operation === 'delete');
        assert.deepEqual(current.track, operation === 'delete' ? null : newer);
        assert.equal(current.sha256, contentHash(operation === 'delete' ? value : newer));
        assert.deepEqual(f.snapshot().history.map(row => row.revision), [1, 2]);
      }
      assert.equal(mutations(f).length, committed ? 2 : 1);
    });
  }

  await t.test('a newer write after RETURNING cannot retroactively change the first successful acknowledgment', async t => {
    const f = await fixture(t), original = track('ack-returning-race', 'Synthetic atomic acknowledgment');
    expect(await f.put('a', original), 201);
    const first = { ...original, note: 'First committed note' }, later = { ...original, note: 'Later committed note' };
    let calls = 0;
    const env = adaptedEnvironment(f, async ({ execute }) => {
      calls++; const result = await execute();
      expect(await f.put('a', later, 2), 200);
      return result;
    });
    const acknowledged = expect(await put(f, first, 1, env), 200);
    assert.equal(calls, 1); assert.equal(acknowledged.revision, 2); assert.equal(acknowledged.sha256, contentHash(first));
    const latest = expect(await f.request('a', '/tracks/' + original.id), 200);
    assert.equal(latest.revision, 3); assert.deepEqual(latest.track, later);
    assert.deepEqual(f.snapshot().history.map(row => JSON.parse(row.payload_json)), [original, first, later]);
  });

  const malformed = [
    ['missing result object', () => undefined],
    ['missing success flag', value => ({ results: value.results })],
    ['false success flag', value => ({ ...value, success: false })],
    ['missing results', value => ({ success: true, meta: value.meta })],
    ['nonarray results', value => ({ ...value, results: {} })],
    ['multiple returned rows', value => ({ ...value, results: [value.results[0], value.results[0]] })],
    ['null returned row', value => ({ ...value, results: [null] })],
    ...[
      ['owner_id', 'wrong-synthetic-owner'], ['track_id', 'wrong-synthetic-track'], ['revision', 123],
      ['deleted', 1], ['updated_at', -1], ['content_sha256', '0'.repeat(64)],
    ].map(([field, replacement]) => ['mismatched ' + field, value => ({ ...value, results: [{ ...value.results[0], [field]: replacement }] })]),
  ];
  for (const [index, [label, corrupt]] of malformed.entries()) {
    await t.test(label + ' fails closed after one committed create without guessing or retrying', async t => {
      const f = await fixture(t), value = { ...track('ack-malformed-' + index, 'Synthetic malformed result'), note: 'Exact retained note' };
      let calls = 0;
      const env = adaptedEnvironment(f, async ({ execute }) => { calls++; return corrupt(await execute()); });
      expect(await put(f, value, 0, env), 500, 'server_error');
      assert.equal(calls, 1);
      assert.equal(f.snapshot().rows.length, 1); assert.equal(f.snapshot().history.length, 1);
      assert.deepEqual(expect(await f.request('a', '/tracks/' + value.id), 200).track, value);
    });
  }
});
