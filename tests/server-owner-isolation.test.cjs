// Execute the final Development wrapper and its complete import chain, including
// worker-private-library-sync.js, against two signed local identities and a
// fresh SQLite database per test. No browser, live Access/D1, deployment, or new
// dependency is used. Requires Node with node:sqlite (Node 22.13+ / 24).
// SQLite qualifies actual SQL predicates, constraints and history triggers; it
// is not an emulator of Cloudflare edge policy, D1 replication or browser state.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, track, contentHash } = require('./helpers/server-owner-harness.cjs');

function expect(result, status, code) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (code) assert.equal(result.body.code, code);
  return result.body;
}
async function seed(f, owner, value) {
  const created = expect(await f.put(owner, value), 201);
  assert.equal(created.revision, 1);
  assert.equal(created.sha256, contentHash(value));
}
async function allPages(f, owner, extraQuery = '') {
  const items = [];
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const data = expect(await f.request(owner, '/tracks?limit=1' + cursor + extraQuery), 200);
    assert.ok(Array.isArray(data.items));
    items.push(...data.items);
    if (!data.has_more) return items;
    const next = '&since=' + data.next.since + '&after=' + encodeURIComponent(data.next.after);
    assert.notEqual(next, cursor, 'The cursor must advance');
    cursor = next;
  }
  assert.fail('Owner-specific pagination did not terminate');
}

// Run serially because the synthetic JWKS fetch adapter is process-global.
test('actual server owner isolation', { concurrency: false }, async t => {
  await t.test('GET and paginated list expose only the authenticated owner, including colliding IDs', async t => {
    const f = await fixture(t);
    const values = {
      a: [track('same-id', 'A private same-ID content'), track('only-a', 'Only A may read this')],
      b: [track('same-id', 'B private same-ID content'), track('only-b', 'Only B may read this')],
    };
    for (const owner of ['a', 'b']) for (const value of values[owner]) await seed(f, owner, value);
    for (const [owner, foreign] of [['a', 'b'], ['b', 'a']]) {
      const own = expect(await f.request(owner, '/tracks/same-id'), 200);
      assert.deepEqual(own.track, values[owner][0]);
      assert.equal(own.sha256, contentHash(values[owner][0]));
      expect(await f.request(owner, '/tracks/only-' + foreign), 404, 'not_found');
      // Client-supplied owner hints cannot broaden the SQL owner's scope.
      const items = await allPages(f, owner, '&owner_id=local-test-owner-' + foreign);
      assert.deepEqual(items.map(item => item.track_id).sort(), ['only-' + owner, 'same-id']);
      assert.deepEqual(items.find(item => item.track_id === 'same-id').track, values[owner][0]);
      assert.ok(items.every(item => !JSON.stringify(item).includes('Only ' + foreign.toUpperCase())));
    }
    assert.equal(f.snapshot().rows.length, 4);
    assert.equal(f.snapshot().history.length, 4, 'Real insert triggers must preserve both owners');
  });

  await t.test('same-ID create/update conflicts and history remain owner-specific in both directions', async t => {
    const f = await fixture(t);
    await seed(f, 'a', track('collision', 'A original'));
    await seed(f, 'b', track('collision', 'B original'));
    for (const [owner, foreign] of [['a', 'b'], ['b', 'a']]) {
      const untouched = f.snapshot(foreign);
      const updated = track('collision', owner.toUpperCase() + ' revised');
      const saved = expect(await f.put(owner, updated, 1, { owner_id: 'local-test-owner-' + foreign }), 200);
      assert.equal(saved.revision, 2);
      assert.equal(saved.sha256, contentHash(updated));
      assert.deepEqual(f.snapshot(foreign), untouched, 'Updating a colliding ID must not alter the foreign row/history');
      const stable = f.snapshot();
      for (const revision of [0, 1]) {
        const conflict = expect(await f.put(owner, track('collision', 'Rejected overwrite'), revision), 409, 'revision_conflict');
        assert.equal(conflict.current.revision, 2);
        assert.equal(conflict.current.content_sha256, contentHash(updated), 'Conflict details must belong to the signed owner');
        assert.deepEqual(f.snapshot(), stable, 'Conflicts must not mutate rows or revision history');
      }
      assert.deepEqual(expect(await f.request(owner, '/tracks/collision'), 200).track, updated);
      assert.deepEqual(f.snapshot(owner).history.map(row => row.revision), [1, 2]);
    }
  });

  await t.test('foreign existing-ID PUT and DELETE cannot modify or disclose another owner’s row/history', async t => {
    const f = await fixture(t);
    for (const owner of ['a', 'b']) await seed(f, owner, track('only-' + owner, 'Private ' + owner));
    for (const [owner, foreign] of [['a', 'b'], ['b', 'a']]) {
      const baseline = f.snapshot();
      const id = 'only-' + foreign;
      const update = expect(await f.put(owner, track(id, 'Unauthorized replacement'), 1, {
        owner_id: 'local-test-owner-' + foreign,
      }), 409, 'revision_conflict');
      assert.equal(update.current, null, 'Foreign revision/hash must not leak through PUT conflicts');
      assert.deepEqual(f.snapshot(), baseline);
      const deletion = expect(await f.remove(owner, id, 1), 409, 'revision_conflict');
      assert.equal(deletion.current, null, 'Foreign revision/deletion status must not leak through DELETE conflicts');
      assert.deepEqual(f.snapshot(), baseline);
      expect(await f.request(owner, '/tracks/' + id), 404, 'not_found');
      assert.equal(expect(await f.request(foreign, '/tracks/' + id), 200).deleted, false);
    }
  });

  await t.test('same-ID DELETE creates only that owner’s tombstone and immutable revision history', async t => {
    const f = await fixture(t);
    for (const owner of ['a', 'b']) await seed(f, owner, track('collision', 'Private ' + owner));
    for (const [owner, foreign] of [['a', 'b'], ['b', 'a']]) {
      const untouched = f.snapshot(foreign);
      const deleted = expect(await f.remove(owner, 'collision', 1), 200);
      assert.equal(deleted.revision, 2);
      assert.equal(deleted.deleted, true);
      assert.deepEqual(f.snapshot(foreign), untouched, 'Deletion must preserve the other owner’s entire history');
      const own = expect(await f.request(owner, '/tracks/collision'), 200);
      assert.equal(own.deleted, true);
      assert.equal(own.track, null);
      assert.equal(own.revision, 2);
      const listed = await allPages(f, owner);
      assert.equal(listed.length, 1);
      assert.equal(listed[0].deleted, true);
      assert.equal(listed[0].track, null);
      if (owner === 'a') {
        assert.equal(expect(await f.request(foreign, '/tracks/collision'), 200).deleted, false);
        assert.equal((await allPages(f, foreign))[0].deleted, false);
      }
      const baseline = f.snapshot();
      const stalePut = expect(await f.put(owner, track('collision', 'Stale resurrection'), 1), 409, 'revision_conflict');
      assert.equal(stalePut.current.revision, 2);
      assert.equal(stalePut.current.deleted, 1);
      assert.deepEqual(f.snapshot(), baseline);
      const history = f.snapshot(owner).history;
      assert.deepEqual(history.map(row => [row.revision, row.deleted]), [[1, 0], [2, 1]]);
      assert.equal(history[0].payload_json, history[1].payload_json, 'Tombstone must retain the original revision payload');
    }
  });

  await t.test('a concurrent update wins once and stale or repeated DELETE never retargets a newer revision', async t => {
    const f = await fixture(t);
    await seed(f, 'a', track('revision-race', 'Original'));
    await seed(f, 'b', track('revision-race', 'Independent B'));
    const untouchedB = f.snapshot('b');
    const outcomes = await Promise.all([
      f.put('a', track('revision-race', 'Concurrent edit one'), 1),
      f.put('a', track('revision-race', 'Concurrent edit two'), 1),
    ]);
    assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
    assert.equal(outcomes.find(result => result.status === 409).body.code, 'revision_conflict');
    const afterUpdate = f.snapshot();
    const stale = expect(await f.remove('a', 'revision-race', 1), 409, 'revision_conflict');
    assert.equal(stale.current.revision, 2);
    assert.equal(stale.current.deleted, 0);
    assert.deepEqual(f.snapshot(), afterUpdate);
    assert.equal(expect(await f.remove('a', 'revision-race', 2), 200).revision, 3);
    const afterDelete = f.snapshot();
    // The old revision and the tombstone's own revision must both be rejected.
    for (const revision of [2, 3]) {
      const retry = expect(await f.remove('a', 'revision-race', revision), 409, 'revision_conflict');
      assert.equal(retry.current.revision, 3);
      assert.equal(retry.current.deleted, 1);
      assert.deepEqual(f.snapshot(), afterDelete);
    }
    assert.deepEqual(f.snapshot('a').history.map(row => [row.revision, row.deleted]), [[1, 0], [2, 0], [3, 1]]);
    assert.deepEqual(f.snapshot('b'), untouchedB);
  });

  await t.test('missing, wrong, or pre-switch DELETE account headers cannot authorize mutation', async t => {
    const f = await fixture(t);
    for (const owner of ['a', 'b']) await seed(f, owner, track('same-id', 'Private ' + owner));
    const baseline = f.snapshot();
    const deletionBody = { base_revision: 1, authorized_user_delete: true, delete_intent: 'explicit-ui-delete' };
    expect(await f.request('a', '/tracks/same-id', { method: 'DELETE', body: deletionBody }), 400, 'delete_account_required');
    assert.deepEqual(f.snapshot(), baseline);
    expect(await f.request('a', '/tracks/same-id', {
      method: 'DELETE', headers: { 'x-mancardo-delete-account': 'arbitrary-account-key' }, body: deletionBody,
    }), 409, 'delete_account_mismatch');
    assert.deepEqual(f.snapshot(), baseline);
    const oldHealth = expect(await f.request('a', '/health'), 200);
    // Simulate a browser switching from A to B after the previous health read.
    // Both rows exist at revision 1, so a missed header guard would delete B.
    expect(await f.request('b', '/tracks/same-id', {
      method: 'DELETE', headers: { 'x-mancardo-delete-account': oldHealth.accountKey }, body: deletionBody,
    }), 409, 'delete_account_mismatch');
    assert.deepEqual(f.snapshot(), baseline);
    expect(await f.request('a', '/tracks/same-id', {
      method: 'DELETE', headers: { 'x-mancardo-delete-account': f.accountKeys.b }, body: deletionBody,
    }), 409, 'delete_account_mismatch');
    assert.deepEqual(f.snapshot(), baseline);
    expect(await f.remove('a', 'same-id', 1), 200);
    expect(await f.remove('b', 'same-id', 1), 200);
  });

  for (const mode of ['missing', 'wrong', 'pre-switch']) {
    for (const target of ['new-to-b', 'collision']) {
      await t.test(mode + ' PUT account header cannot ' + (target === 'collision' ? 'overwrite a colliding row' : 'create a new-account copy'), async t => {
        const f = await fixture(t);
        for (const owner of ['a', 'b']) await seed(f, owner, track('collision', 'Private ' + owner));
        await seed(f, 'a', track('new-to-b', 'Only A owns this local content'));
        const oldHealth = expect(await f.request('a', '/health'), 200);
        const baseline = f.snapshot();
        const headers = mode === 'missing' ? {} : {
          'x-mancardo-private-account': mode === 'pre-switch' ? oldHealth.accountKey : 'arbitrary-account-key',
        };
        // An A-bound browser is now authenticated as B. A missing/incorrect
        // binding must not create A's local track in B or overwrite B's row.
        const result = await f.request('b', '/tracks/' + target, {
          method: 'PUT', headers,
          body: { base_revision: target === 'collision' ? 1 : 0, track: track(target, 'A-bound browser content') },
        });
        expect(result, mode === 'missing' ? 400 : 409,
          mode === 'missing' ? 'private_account_required' : 'private_account_mismatch');
        assert.equal(result.body.current, undefined, 'Guard rejection must not disclose current-account metadata');
        assert.deepEqual(f.snapshot(), baseline, 'Rejected binding must not change either owner or revision history');
        // Legitimate writes with an explicit matching binding still work.
        const allowed = expect(await f.put('b', track(target, 'Intentional B edit'), target === 'collision' ? 1 : 0),
          target === 'collision' ? 200 : 201);
        assert.equal(allowed.revision, target === 'collision' ? 2 : 1);
        assert.deepEqual(f.snapshot('a'), {
          rows: baseline.rows.filter(row => row.owner_id === 'local-test-owner-a'),
          history: baseline.history.filter(row => row.owner_id === 'local-test-owner-a'),
        });
      });
    }
  }

  for (const route of ['/tracks/same-id', '/tracks?limit=1']) {
    await t.test('mismatched explicit private-account binding blocks GET ' + route, async t => {
      const f = await fixture(t);
      for (const owner of ['a', 'b']) await seed(f, owner, track('same-id', 'Private ' + owner));
      const baseline = f.snapshot();
      for (const [owner, foreign] of [['a', 'b'], ['b', 'a']]) {
        for (const expectedAccount of [f.accountKeys[foreign], 'arbitrary-account-key']) {
          const rejected = expect(await f.request(owner, route, {
            headers: { 'x-mancardo-private-account': expectedAccount },
          }), 409, 'private_account_mismatch');
          assert.equal(rejected.items, undefined);
          assert.equal(rejected.track, undefined);
          assert.equal(rejected.current, undefined);
        }
        // Missing read headers intentionally permit direct authenticated API
        // reads; an explicit matching header has exactly the same scope.
        for (const headers of [{}, { 'x-mancardo-private-account': f.accountKeys[owner] }]) {
          const result = expect(await f.request(owner, route, { headers }), 200);
          const values = route.includes('?') ? result.items : [result];
          assert.equal(values.length, 1);
          assert.equal(values[0].track.name, 'Private ' + owner);
        }
      }
      assert.deepEqual(f.snapshot(), baseline, 'Read guards must never change rows or history');
    });
  }

  await t.test('invalid revision requests reject without changing either owner or history', async t => {
    const f = await fixture(t);
    for (const owner of ['a', 'b']) await seed(f, owner, track('same-id', 'Private ' + owner));
    const baseline = f.snapshot();
    for (const owner of ['a', 'b']) {
      for (const revision of [undefined, -1, 1.5]) {
        expect(await f.request(owner, '/tracks/same-id', {
          method: 'PUT', headers: { 'x-mancardo-private-account': f.accountKeys[owner] },
          body: { base_revision: revision, track: track('same-id', 'Invalid revision') },
        }), 400, 'invalid_revision');
        expect(await f.remove(owner, 'same-id', revision), 400, 'invalid_revision');
        assert.deepEqual(f.snapshot(), baseline);
      }
      expect(await f.remove(owner, 'same-id', 0), 400, 'invalid_revision');
      assert.deepEqual(f.snapshot(), baseline);
    }
  });

  await t.test('unverified JWTs cannot read, list, write or delete, even with forged owner hints', async t => {
    const f = await fixture(t);
    for (const owner of ['a', 'b']) await seed(f, owner, track('same-id', 'Private ' + owner));
    const baseline = f.snapshot();
    const now = Math.floor(Date.now() / 1000);
    const tampered = f.tokens.a.split('.');
    const forgedClaims = JSON.parse(Buffer.from(tampered[1], 'base64url').toString());
    forgedClaims.sub = 'local-test-owner-b';
    forgedClaims.email = 'owner-b@fixture.invalid';
    tampered[1] = Buffer.from(JSON.stringify(forgedClaims)).toString('base64url');
    const invalidTokens = [
      ['missing token', null],
      ['malformed token', 'not.a.jwt'],
      ['tampered identity with original signature', tampered.join('.')],
      ['unknown signing key', f.token('a', {}, { kid: 'unknown-local-key' })],
      ['wrong algorithm', f.token('a', {}, { alg: 'none' })],
      ['wrong issuer', f.token('a', { iss: 'https://other.fixture.invalid' })],
      ['wrong audience', f.token('a', { aud: ['another-audience'] })],
      ['expired token', f.token('a', { exp: now - 1 })],
      ['not-yet-active token', f.token('a', { nbf: now + 3600 })],
      ['missing owner subject', f.token('a', { sub: '' })],
    ];
    for (const [label, token] of invalidTokens) {
      const headers = {
        'Cf-Access-Authenticated-User-Email': 'owner-b@fixture.invalid',
        'x-mancardo-delete-account': f.accountKeys.b,
      };
      const health = expect(await f.request('b', '/health', { token, headers }), 200);
      assert.equal(health.authenticated, false, label);
      assert.equal(health.accountKey, undefined, label);
      for (const route of ['/tracks', '/tracks/same-id']) {
        expect(await f.request('b', route, { token, headers }), 401, 'authentication_required');
        expect(await f.request('b', route, {
          token, headers: { ...headers, 'x-mancardo-private-account': f.accountKeys.b },
        }), 401, 'authentication_required');
      }
      expect(await f.request('b', '/tracks/same-id', {
        method: 'PUT', token, headers: { ...headers, 'x-mancardo-private-account': f.accountKeys.b },
        body: { base_revision: 1, owner_id: 'local-test-owner-b', track: track('same-id', 'Forged write') },
      }), 401, 'authentication_required');
      // The outer wrapper rejects failed authentication at the same-request
      // account guard, before the inner DELETE handler is reached.
      expect(await f.request('b', '/tracks/same-id', {
        method: 'DELETE', token, headers,
        body: { base_revision: 1, authorized_user_delete: true, delete_intent: 'explicit-ui-delete' },
      }), 409, 'delete_account_mismatch');
      assert.deepEqual(f.snapshot(), baseline, label + ' must leave both owners and revision history unchanged');
    }
    // Recheck legitimate identities so fail-closed tests cannot pass simply
    // because the handler or authentication is broken for everybody.
    for (const owner of ['a', 'b']) {
      assert.equal(expect(await f.request(owner, '/tracks/same-id'), 200).track.name, 'Private ' + owner);
      expect(await f.put(owner, track('same-id', 'Verified ' + owner), 1), 200);
      expect(await f.remove(owner, 'same-id', 2), 200);
    }
  });
});
