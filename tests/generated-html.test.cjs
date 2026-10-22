// Executes the real Worker transformation chain against an in-memory ASSETS
// binding, then compiles the HTML scripts actually returned. No browser, D1,
// Cloudflare deployment, or external network is used by these tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const durableEntry = 'worker-delete-durable-fix.js';
const legacyBaseEntry = 'worker-autosave-stability.js';

function configuredEntry(config) {
  const text = fs.readFileSync(path.join(root, config), 'utf8');
  const match = text.match(/^main\s*=\s*"([^"]+)"\s*$/m);
  assert.ok(match, config + ' must specify a Worker entrypoint');
  return match[1];
}

async function render(entry, options = {}) {
  const worker = (await import(pathToFileURL(path.join(root, entry)).href)).default;
  const response = await worker.fetch(new Request('https://mancardo.test/'), {
    ASSETS: {
      async fetch() {
        return new Response(options.body ?? sourceHtml, {
          status: options.status ?? 200,
          headers: {
            'content-type': options.type ?? 'text/html; charset=utf-8',
            'x-test-sentinel': 'preserved',
            ...options.headers,
          },
        });
      },
    },
    PRIVATE_LIBRARY_DB: {
      prepare() { throw new Error('HTML qualification must not read or write D1'); },
    },
  }, {
    waitUntil() { throw new Error('HTML qualification must not start background work'); },
  });
  return response;
}

function compileInlineScripts(html, label) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  assert.ok(scripts.length > 0, label + ': no script elements were emitted');
  let compiled = 0;
  for (const [index, match] of scripts.entries()) {
    const [, attrs, source] = match;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i)?.[1] || '';
    if (/^(?:application\/ld\+json|application\/json|importmap)$/i.test(type)) continue;
    assert.notEqual(type, 'module', label + ': add a module parser before adding module scripts');
    assert.ok(!/<script\b/i.test(source),
      label + ': nested script tag in inline script ' + index);
    assert.doesNotThrow(() => new vm.Script(source, {
      filename: label + ':inline-script-' + index,
    }), label + ': emitted inline script ' + index + ' must compile');
    compiled++;
  }
  assert.ok(compiled > 0, label + ': no executable inline scripts compiled');
  return scripts.filter(([, attrs]) => !/\bsrc\s*=/i.test(attrs)).map(([, , source]) => source);
}

for (const config of ['wrangler.dev.toml', 'wrangler.toml']) {
  test(config + ' emits syntactically valid inline JavaScript through its real entrypoint', async () => {
    const entry = configuredEntry(config);
    const response = await render(entry);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /id=["']mapDiv["']/);
    compileInlineScripts(html, config + ' -> ' + entry);
  });
}

test('Development and Production select the reviewed durable runtime', () => {
  assert.equal(configuredEntry('wrangler.dev.toml'), durableEntry);
  assert.equal(configuredEntry('wrangler.toml'), durableEntry);
});

test('durable deletion client is plain JavaScript inside the editor script before boot', async () => {
  const response = await render(durableEntry);
  const html = await response.text();
  const scripts = compileInlineScripts(html, durableEntry);
  const containing = scripts.filter(source => source.includes('window.mancardoAuthorizedDelete'));
  assert.equal(containing.length, 1, 'exactly one delivered script must install durable deletion');
  const editor = containing[0];
  assert.match(editor, /\bvar state\s*=\s*\{/,
    'the deletion client must share the real editor script containing state');
  const install = editor.indexOf('window.mancardoAuthorizedDelete');
  const boot = editor.indexOf('// ---------- boot ----------');
  assert.ok(install > 0 && boot > install, 'install durable deletion before the editor boot sequence');
  assert.doesNotMatch(html, /<script\b[^>]*id=["']mancardo-explicit-delete-bridge["']/i,
    'remove the superseded out-of-scope body-script bridge');
  assert.doesNotMatch(html, /function syncRemoved\(before\)/,
    'the old non-durable delete bridge must not coexist with the replacement');
  assert.doesNotMatch(html, /<script\b[^>]*id=["']mancardo-private-(?:delete-tombstone-fix|waypoint-sync)["']/i,
    'do not reintroduce legacy reload polling clients');
});

test('missing editor boot marker leaves a readable, unchanged base response', async () => {
  const body = '<!doctype html><html><body><p>Maintenance fixture without an editor.</p></body></html>';
  const expected = await render(legacyBaseEntry, { body });
  const actual = await render(durableEntry, { body });
  assert.equal(actual.bodyUsed, false, 'fallback response body must not already be consumed');
  assert.equal(await actual.text(), await expected.text(), 'unsupported markup must retain base output');
  assert.equal(actual.headers.get('x-test-sentinel'), 'preserved');
});

test('emitted cloud mutation functions recheck pending deletion after asynchronous work', async () => {
  const html = await (await render(durableEntry)).text();
  // Execute the exact functions emitted by the Worker, not copies of their
  // implementation. The sandbox isolates the final mutation step reached after
  // an IndexedDB/hash await; real browser scheduling is tested separately.
  function emittedFunction(name) {
    const line = html.split('\n').find(value => value.trimStart().startsWith('function ' + name + '('));
    assert.ok(line, 'expected emitted cloud function: ' + name);
    return line;
  }
  let pending = true;
  const state = { library: [], currentId: null };
  const context = vm.createContext({
    state,
    accountKey: 'account-a',
    window: {
      mancardoHasPendingDelete(account, id) {
        return pending && account === 'account-a' && id === 'deleted-id';
      },
    },
    clone: value => JSON.parse(JSON.stringify(value)),
    uid: () => 'conflict-fixture-id',
    stripSharedLink() {},
    conflictCount: 0,
  });
  vm.runInContext(emittedFunction('replaceLocal') + '\n' + emittedFunction('preserveConflictCopy'), context);
  const staleTrack = { id: 'deleted-id', name: 'Stale cloud copy' };
  context.replaceLocal('deleted-id', staleTrack);
  assert.equal(state.library.length, 0, 'late cloud result must not reinsert a pending-deleted track');
  assert.equal(context.preserveConflictCopy(staleTrack, 'late result'), null);
  assert.equal(state.library.length, 0, 'late cloud result must not create an unintended conflict copy');
  pending = false;
  context.replaceLocal('deleted-id', staleTrack);
  assert.equal(state.library.length, 1, 'a cancelled intent must allow the cloud copy to reconcile');
  pending = true;
  context.replaceLocal('deleted-id', null);
  assert.equal(state.library.length, 0, 'a pending intent must not prevent applying a cloud tombstone');
});

async function emittedRecoveryContext() {
  const html = await (await render(durableEntry)).text();
  const functions = ['stripSharedLink', 'preserveConflictCopy'].map(name => {
    const line = html.split('\n').find(value => value.trimStart().startsWith('function ' + name + '('));
    assert.ok(line, 'expected actual emitted recovery function: ' + name);
    return line;
  });
  const context = vm.createContext({
    state: { library: [] }, accountKey: 'fixture-owner',
    window: { mancardoHasPendingDelete: () => false },
    clone: value => JSON.parse(JSON.stringify(value)),
    uid: () => 'fixture-recovered-id', conflictCount: 0, conflictEl: { title: '' },
  });
  vm.runInContext(functions.join('\n'), context);
  return context;
}

test('emitted recovery copy retains every serialized note representation verbatim', async () => {
  const context = await emittedRecoveryContext();
  const values = [undefined, '', null, false, 0, 7, ['legacy', { text: 'value' }],
    { text: 'legacy object', recoveryReason: 'user metadata' },
    '  Café 🧭\nKeep outer spaces  ', 'A legacy note longer than the current forty-character editor limit must not be truncated.'];
  for (const note of values) {
    const original = { id: 'fixture-original', name: 'Synthetic route', segments: [[{ lat: 1, lon: 2 }]] };
    if (note !== undefined) original.note = note;
    const before = JSON.stringify(original);
    const copy = context.preserveConflictCopy(original, 'Recovery snapshot before cloud delete');
    assert.equal(Object.hasOwn(copy, 'note'), Object.hasOwn(original, 'note'), 'Do not manufacture an absent note');
    assert.deepEqual(copy.note, original.note, 'Do not trim, truncate, coerce or replace serialized note content');
    assert.equal(JSON.stringify(original), before, 'Never mutate the original object while making its copy');
    assert.deepEqual(copy.segments, original.segments);
    assert.equal(copy.id, 'fixture-recovered-id');
    assert.equal(copy.name, original.name + ' (conflict copy)');
    assert.equal(copy.draft, true);
    assert.equal(context.state.library[0], copy);
  }
  assert.equal(context.conflictCount, values.length);
});

test('emitted recovery diagnostics are session-local and cannot overwrite user metadata keys', async () => {
  const context = await emittedRecoveryContext();
  const original = JSON.parse('{"id":"fixture-original","name":"Synthetic route","note":"User note","segments":[[{"lat":1,"lon":2}]],"recovery":{"reason":"user value"},"recoveryReason":"already used","recoveredFrom":{"id":"user-owned"},"conflictEl":{"title":"payload, not UI"},"__proto__":{"note":"own JSON key"},"constructor":{"note":"another own key"},"sharedId":"fixture-shared","sharedBaseVersion":4,"sharedBaseModifiedAt":1,"sharedBaseModifiedBy":"fixture-owner"}');
  const before = JSON.stringify(original), reason = '<recovery> & diagnostic\n' + 'x'.repeat(60);
  const copy = context.preserveConflictCopy(original, reason);
  assert.equal(context.conflictEl.title, reason, 'Keep the complete diagnostic on the existing UI element');
  assert.equal(JSON.stringify(original), before);
  const preserved = JSON.parse(JSON.stringify(copy));
  for (const key of ['id', 'name', 'draft', 'createdAt', 'updatedAt']) delete preserved[key];
  const expected = JSON.parse(before);
  for (const key of ['id', 'name', 'sharedId', 'sharedBaseVersion', 'sharedBaseModifiedAt', 'sharedBaseModifiedBy']) delete expected[key];
  assert.deepEqual(preserved, expected, 'Only established copy identity/status/shared-link changes may affect payload fields');
  assert.equal(Object.hasOwn(copy, '__proto__'), true);
  assert.equal(Object.hasOwn(copy, 'constructor'), true);
  const snapshot = JSON.stringify(copy);
  context.conflictEl.title = '';
  assert.equal(JSON.stringify(copy), snapshot, 'Resetting the transient UI reason must not alter persisted track content');
  context.preserveConflictCopy(original);
  assert.equal(context.conflictEl.title, 'Recovered sync conflict');
});

async function actualRecoveryTransform() {
  const source = fs.readFileSync(path.join(root, durableEntry), 'utf8');
  const { repairRequestCadence } = await import(pathToFileURL(path.join(root, 'worker-request-cadence.js')).href);
  // Remove only module-loading/export syntax. All constants and the complete
  // private HTML transformer execute unchanged with the real cadence helper.
  const { EDITOR_RECOVERY } = await import(pathToFileURL(path.join(root, 'worker-editor-recovery.js')).href);
  const context = vm.createContext({ repairRequestCadence, EDITOR_RECOVERY });
  vm.runInContext(source.replace(/^import[^\n]*\n/gm, '').replace('export default {', 'const exportedWorker = {'), context);
  const base = await (await render(legacyBaseEntry)).text();
  return { transform: context.injectDurableDeletion, base };
}

test('actual recovery transformer accepts the complete baseline and matches delivered HTML', async () => {
  const { transform, base } = await actualRecoveryTransform();
  const transformed = transform(base);
  assert.equal(transformed, await (await render(durableEntry)).text());
  compileInlineScripts(transformed, 'complete recovery transformer');
});

for (const mutation of ['missing', 'duplicate']) {
  test('actual recovery transformer fails closed for a ' + mutation + ' note-assignment anchor', async () => {
    const { transform, base } = await actualRecoveryTransform();
    const anchor = "c.note=String(reason||'Recovered sync conflict').slice(0,40);";
    assert.equal(base.split(anchor).length, 2, 'The real upstream response must contain exactly one expected anchor');
    const altered = base.replace(anchor, mutation === 'missing' ? '' : anchor + anchor);
    assert.throws(() => transform(altered), /Conflict-note preservation anchor missing or ambiguous/,
      'Never silently deliver the old lossy path when its source changes');
  });
}

async function emittedRevisionHashes() {
  const html = await (await render(durableEntry)).text();
  const start = html.indexOf('function revisionHashes(snapshot){');
  const end = html.indexOf('function authorisedDelete(', start);
  assert.ok(start >= 0 && end > start, 'expected the real emitted revision-hash helper');
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, Uint8Array });
  vm.runInContext(html.slice(start, end), context);
  return context.revisionHashes;
}

function serializedHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

test('emitted revision matching permits only visibility serialization variants without reordering other fields', async () => {
  const hashes = await emittedRevisionHashes();
  const entries = [['id', 'one'], ['name', 'Caf\u00e9 "route"'], ['segments', [[{ lat: -33.1, lon: 151.2, ele: null }]]], ['note', 'Line one\nLine two']];
  for (const position of [0, 2, entries.length]) {
    for (const prior of [true, false, null]) {
      const ordered = entries.slice(); ordered.splice(position, 0, ['visible', prior]);
      const synced = Object.fromEntries(ordered);
      for (const current of [true, false, null]) {
        const local = JSON.parse(JSON.stringify(synced)); local.visible = current;
        assert.ok((await hashes(JSON.stringify(local))).includes(serializedHash(synced)),
          'Boolean/null visibility changes must preserve property position ' + position);
      }
    }
  }
  const absent = Object.fromEntries(entries);
  for (const current of [true, false, null]) {
    const local = JSON.parse(JSON.stringify(absent)); local.visible = current;
    assert.ok((await hashes(JSON.stringify(local))).includes(serializedHash(absent)),
      'rendering an originally absent visible field must not require another sync');
  }
  assert.ok((await hashes(JSON.stringify(absent))).includes(serializedHash(absent)));
});

test('visibility variants never ignore substantive fields, nested fields, or special JSON property names', async () => {
  const hashes = await emittedRevisionHashes();
  const synced = { id: 'one', visible: true, name: 'Route', note: 'Original', color: '#123456', segments: [[{ lat: 1, lon: 2, visible: true }]], updatedAt: '2026-10-17T00:00:00Z' };
  const mutations = [
    track => { track.name = 'Changed'; },
    track => { track.note = 'Changed'; },
    track => { track.color = '#abcdef'; },
    track => { track.segments[0][0].lat = 9; },
    track => { track.segments[0][0].visible = false; },
    track => { track.updatedAt = '2026-10-17T00:00:01Z'; },
    track => { track.extraPayload = { newlyAdded: true }; },
    track => { Object.defineProperty(track, '__proto__', { value: { newlyAdded: true }, enumerable: true }); },
  ];
  for (const mutate of mutations) {
    const local = JSON.parse(JSON.stringify(synced)); local.visible = false; mutate(local);
    assert.ok(!(await hashes(JSON.stringify(local))).includes(serializedHash(synced)),
      'only top-level visibility may differ, including with own __proto__ properties');
  }
});

test('non-Boolean/non-null visibility values receive exact matching only, without coercion', async () => {
  const hashes = await emittedRevisionHashes();
  const synced = { id: 'one', name: 'Route', visible: true, segments: [] };
  for (const value of ['false', 'true', 0, 1, [], {}, { hidden: true }]) {
    const local = JSON.parse(JSON.stringify(synced)); local.visible = value;
    const actual = await hashes(JSON.stringify(local));
    assert.ok(actual.includes(serializedHash(local)), 'unchanged serialized input must retain exact matching');
    assert.ok(!actual.includes(serializedHash(synced)), 'unknown visibility types must not acquire relaxed matching');
    assert.equal(actual.length, 1, 'unknown visibility type should produce only its exact hash');
  }
});

test('non-HTML response is returned without consuming or changing its body', async () => {
  const response = await render(durableEntry, {
    body: '{"fixture":true}',
    type: 'application/json',
    status: 202,
  });
  assert.equal(response.status, 202);
  assert.equal(response.bodyUsed, false);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('x-test-sentinel'), 'preserved');
  assert.equal(await response.text(), '{"fixture":true}');
});

test('transformed HTML retains status/custom headers but removes stale entity metadata', async () => {
  const response = await render(durableEntry, {
    status: 201,
    headers: { etag: '"original-asset"', 'content-length': String(sourceHtml.length) },
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-test-sentinel'), 'preserved');
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('content-length'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  compileInlineScripts(await response.text(), 'header-preserving durable response');
});

// Identification is presentation-only in both entrypoint chains. Provider
// adapters below observe exact emitted render functions, not SDK/network output.
const identificationAnchors = [
  'if(item.visible===false||item.id===state.currentId||(state.current&&item.id===state.current.id))return;',
  'if(state.current && state.current.visible!==false){',
  'if(!item||item.visible===false||!Polyline3DElement||!map3d)return;',
  'if(item.visible==null)item.visible=true;',
];
async function identificationInput() {
  return (await render('worker-ui-optimizations-v2.js')).text();
}
function between(html, start, end) {
  const begin = html.indexOf(start), finish = html.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, start);
  return html.slice(begin, finish);
}
function identificationPrelude(html) {
  return between(html, '// ---------- Render-only track identification ----------', '(function installMancardoTrackClickFlash(){');
}

test('identification transformer uses four exact anchors and is idempotent', async () => {
  const { repairTrackIdentification } = await import(pathToFileURL(path.join(root, 'worker-waypoint-zoom.js')).href);
  const before = await identificationInput(), after = repairTrackIdentification(before);
  for (const anchor of identificationAnchors) assert.equal(before.split(anchor).length, 2);
  for (const anchor of identificationAnchors) assert.equal(after.includes(anchor), false);
  assert.equal(repairTrackIdentification(after), after);
  compileInlineScripts(after, 'render-only identification transformation');
  assert.equal(repairTrackIdentification('<html><body>Maintenance</body></html>'), '<html><body>Maintenance</body></html>');
});
for (const [index, anchor] of identificationAnchors.entries()) {
  for (const fault of ['missing', 'duplicated']) test('identification fails closed for ' + fault + ' render anchor ' + index, async () => {
    const { repairTrackIdentification } = await import(pathToFileURL(path.join(root, 'worker-waypoint-zoom.js')).href);
    const before = await identificationInput();
    const altered = before.replace(anchor, fault === 'missing' ? '/* deliberately removed fixture anchor */' : anchor + '\n' + anchor);
    assert.throws(() => repairTrackIdentification(altered), /Track identification render anchor mismatch/);
  });
}

test('emitted render predicate never adds or changes a durable visibility property', async () => {
  const html = await (await render(durableEntry)).text();
  const context = vm.createContext({}); vm.runInContext(identificationPrelude(html), context);
  for (const item of [{id:'a'}, {id:'a',visible:null}, {id:'a',visible:false}, {id:'a',visible:true}]) {
    const before = JSON.stringify(item), visible = item.visible !== false;
    assert.equal(context.mancardoTrackRenderVisible(item), visible);
    context.mancardoTrackFlash = {id:'a',visible:!visible};
    assert.equal(context.mancardoTrackRenderVisible(item), !visible);
    assert.equal(context.mancardoTrackRenderVisible({id:'other',visible:false}), false);
    context.mancardoTrackFlash = null;
    assert.equal(context.mancardoTrackRenderVisible(item), visible);
    assert.equal(JSON.stringify(item), before);
  }
});

for (const entry of [durableEntry, legacyBaseEntry]) test(entry + ' keeps 2D, Google conversion and 3D identification on render-only visibility', async () => {
  const html = await (await render(entry)).text(), layers = [], googleFeatures = [], lines3d = [];
  class Polyline {
    constructor(points, options){this.points=points;this.options={...options};}
    addTo(){layers.push(this);return this;} on(){return this;}
    getLatLngs(){return this.points.map(p=>({lat:p[0],lng:p[1]}));}
    setStyle(options){Object.assign(this.options,options);return this;}
  }
  class CircleMarker extends Polyline {
    getLatLng(){return {lat:this.points[0],lng:this.points[1]};} getElement(){return null;}
  }
  const other={id:'other',visible:false,segments:[[{lat:1,lon:2},{lat:2,lon:3}]]};
  const current={id:'current',visible:false,segments:[[{lat:4,lon:5},{lat:5,lon:6}]]};
  const state={library:[other,current],current:JSON.parse(JSON.stringify(current)),currentId:'current',selection:null};
  const before=JSON.stringify(state);
  const context=vm.createContext({state,trackLayerGroup:{clearLayers(){layers.length=0;},eachLayer(fn){layers.forEach(fn);}},
    L:{Polyline,CircleMarker,polyline:(p,o)=>new Polyline(p,o),circleMarker:(p,o)=>new CircleMarker(p,o)},
    defaultTrackColour:()=> '#123456',refreshDock(){},getCss:()=> '#123456',map:{getZoom:()=>16},
    clearGoogleTrackData(){googleFeatures.length=0;},googleTrackData:{add(feature){googleFeatures.push(feature);}},
    google:{maps:{LatLng:class {constructor(lat,lng){this.lat=lat;this.lng=lng;}},Data:{Feature:class{constructor(v){Object.assign(this,v);}},LineString:class{constructor(path){this.path=path;}},Point:class{constructor(point){this.point=point;}}}}},
    Polyline3DElement:class{constructor(options){Object.assign(this,options);}},map3d:{append(line){lines3d.push(line);}},track3d:[]});
  vm.runInContext(identificationPrelude(html) + '\n' + between(html,'function render(){','function getCss(') + '\n' +
    between(html,'function syncGoogleTrackVisuals(){',"if(typeof render==='function')") + '\n' +
    between(html,'function addTrack3D(item,isCurrent){','function sync3DTracks(){'),context);
  context.render();assert.equal(layers.length,0);
  for (const item of [other,state.current]) {
    context.mancardoTrackFlash={id:item.id,visible:true};context.render();
    assert.equal(layers.filter(x=>x.constructor===Polyline&&x.options.opacity>0).length,1);
    context.syncGoogleTrackVisuals();assert.equal(googleFeatures.filter(x=>x.properties.kind==='line').length,1);
    assert.deepEqual(JSON.parse(JSON.stringify(googleFeatures.find(x=>x.properties.kind==='line').geometry.path)),item.segments[0].map(p=>({lat:p.lat,lng:p.lon})));
    lines3d.length=0;context.addTrack3D(item,item.id==='current');assert.equal(lines3d.length,1);
    assert.deepEqual(JSON.parse(JSON.stringify(lines3d[0].path)),item.segments[0].map(p=>({lat:p.lat,lng:p.lon})));
    assert.equal(JSON.stringify(state),before,'Rendering must not mutate either durable object');
    context.mancardoTrackFlash=null;context.render();assert.equal(layers.length,0);
    lines3d.length=0;context.addTrack3D(item,true);assert.equal(lines3d.length,0);
  }
});

// Responsive toolbar integration uses the exact emitted base/v2/v3 functions.
// The DOM adapter enforces direct-child insertBefore and preserves node identity;
// real DOM/CSS/viewport qualification requires the separate Chromium definitions
// to execute; a source pass does not establish that browser result.
class ToolbarDomNode {
  constructor(tag = 'div', id = '', className = '') {
    Object.assign(this, { tag, id, className, children: [], parentNode: null, style: {}, attributes: {}, listeners: {}, scrollLeft: 0, clientWidth: 300, scrollWidth: 800 });
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      toggle: name => {
        const names = new Set(this.className.split(' ').filter(Boolean));
        const present = !names.has(name);
        if (present) names.add(name); else names.delete(name);
        this.className = [...names].join(' '); return present;
      },
    };
  }
  get nextSibling() { const nodes = this.parentNode?.children || []; return nodes[nodes.indexOf(this) + 1] || null; }
  get parentElement() { return this.parentNode; }
  remove() { if (this.parentNode) { const nodes = this.parentNode.children; nodes.splice(nodes.indexOf(this), 1); this.parentNode = null; } }
  appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
  insertBefore(node, reference) {
    if (reference !== null && reference.parentNode !== this) throw new DOMException('Reference is not a direct child', 'NotFoundError');
    if (reference === node) return node;
    node.remove(); this.children.splice(reference === null ? this.children.length : this.children.indexOf(reference), 0, node); node.parentNode = this; return node;
  }
  matches(selector) { return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.id === selector.slice(1); }
  querySelector(selector) { for (const node of this.children) { if (node.matches(selector)) return node; const found = node.querySelector(selector); if (found) return found; } return null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  scrollBy({ left }) { this.scrollLeft += left; }
}
function toolbarIife(html, name) {
  const start = html.indexOf('(function ' + name + '(){');
  const end = html.indexOf('\n})();', start);
  assert.ok(start >= 0 && end > start, 'Exact emitted layout function ' + name);
  return html.slice(start, end + 6);
}
function toolbarFixture(html, width, { wrappers = true, displacedToggle = false, missingToggle = false } = {}) {
  const body = new ToolbarDomNode('body');
  const mapWrap = body.appendChild(new ToolbarDomNode('div', 'mapWrap'));
  const host = mapWrap.appendChild(new ToolbarDomNode('div', 'desktopToolbarHost'));
  const dock = body.appendChild(new ToolbarDomNode('div', '', 'dock'));
  const stats = dock.appendChild(new ToolbarDomNode('div', '', 'stats-row'));
  const toolbar = dock.appendChild(new ToolbarDomNode('div', '', 'toolbar'));
  const toggle = dock.appendChild(new ToolbarDomNode('button', 'pointsToggle'));
  const points = dock.appendChild(new ToolbarDomNode('div', 'pointsWrap', 'hidden'));
  const controlHome = mapWrap.appendChild(new ToolbarDomNode('div', 'synthetic-control-home'));
  const zoom = controlHome.appendChild(new ToolbarDomNode('div', '', 'leaflet-control-zoom'));
  const overlayControl = controlHome.appendChild(new ToolbarDomNode('div', '', 'leaflet-control'));
  const overlay = overlayControl.appendChild(new ToolbarDomNode('button', '', 'overlay-control-btn'));
  const originalButton = toolbar.appendChild(new ToolbarDomNode('button', 'synthetic-editing-button'));
  let buttonClicks = 0; originalButton.onclick = () => buttonClicks++;
  const queries = [], listeners = {}, errors = [], timers = [], ioAttempts = [];
  const forbid = name => { ioAttempts.push(name); assert.fail('Unexpected layout side effect: ' + name); };
  let currentWidth = width, invalidations = 0, pointRenders = 0;
  const document = { getElementById: id => body.querySelector('#' + id), querySelector: selector => body.querySelector(selector), createElement: tag => new ToolbarDomNode(tag) };
  const window = {
    matchMedia(query) {
      const media = { query, callbacks: [], get matches() { return query.includes('min-width') ? currentWidth >= 768 : currentWidth < 768; }, addEventListener(_, fn) { this.callbacks.push(fn); }, addListener(fn) { this.callbacks.push(fn); } };
      queries.push(media); return media;
    },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
  };
  const state = { library: [{ id: 'synthetic-hidden', visible: false }, { id: 'synthetic-shown', visible: true }, { id: 'synthetic-null', visible: null }, { id: 'synthetic-absent' }], current: { id: 'synthetic-hidden', visible: false } };
  const serialized = JSON.stringify(state), digest = createHash('sha256').update(serialized).digest('hex');
  const context = vm.createContext({ window, document, state,
    els: { desktopToolbarHost: host, pointsToggle: toggle, pointsWrap: points },
    map: { invalidateSize() { invalidations++; } }, renderPointsTable() { pointRenders++; },
    setTimeout(fn) { timers.push(fn); }, setInterval(fn) { timers.push(fn); }, clearInterval() {},
    fetch() { forbid('fetch'); },
    localStorage: new Proxy({}, { get() { forbid('localStorage'); } }),
    indexedDB: new Proxy({}, { get() { forbid('indexedDB'); } }),
    persistLibrary() { forbid('persistLibrary'); },
    scheduleScan() { forbid('scheduleScan'); },
  });
  if (displacedToggle) { host.appendChild(toolbar); stats.appendChild(toggle); }
  if (missingToggle) toggle.remove();
  const start = html.indexOf("var toolbarEl=document.querySelector('.toolbar');");
  const end = html.indexOf('// ---------- helpers ----------', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(html.slice(start, end), context);
  if (wrappers) {
    vm.runInContext(toolbarIife(html, 'installMancardoMobileLayoutV2'), context);
    vm.runInContext(toolbarIife(html, 'installMancardoMobileLayoutV3'), context);
  }
  const pointStart = html.indexOf('els.pointsToggle.onclick = function(){');
  const pointEnd = html.indexOf('\n};', pointStart);
  assert.ok(pointStart > 0 && pointEnd > pointStart);
  vm.runInContext(html.slice(pointStart, pointEnd + 3), context);
  const call = fn => { try { fn(); } catch (error) { errors.push(error); } };
  const f = {
    body, toolbar, dock, host, stats, toggle, points, zoom, overlay, overlayControl, controlHome, context,
    get nav() { return document.getElementById('mancardoMobileToolbarNav'); },
    get viewport() { return document.getElementById('mancardoMobileToolbarViewport'); },
    resize(nextWidth, order) {
      const changed = queries.filter(q => q.matches !== (q.query.includes('min-width') ? nextWidth >= 768 : nextWidth < 768)); currentWidth = nextWidth;
      const media = () => changed.forEach(q => q.callbacks.forEach(call));
      const event = () => [...(listeners.resize || [])].forEach(call);
      if (order === 'resize-first') { event(); media(); } else { media(); event(); }
      for (const timer of timers.splice(0)) call(timer);
    },
    assertLayout() {
      assert.deepEqual(errors, [], 'Every resize/media/timer callback must complete');
      assert.deepEqual(ioAttempts, [], 'Even caught attempts to access persistence/network are forbidden');
      assert.equal(toolbar.parentNode, currentWidth < 768 ? f.viewport : host);
      assert.equal(f.nav.parentNode, dock, 'Ribbon remains in dock even after desktop startup');
      assert.equal(f.viewport.parentNode, f.nav);
      assert.equal(f.nav.style.display, currentWidth < 768 ? 'grid' : 'none');
      assert.equal(toggle.parentNode, currentWidth < 768 ? stats : dock);
      const count = predicate => { let n = 0; function walk(node) { if (predicate(node)) n++; node.children.forEach(walk); } walk(body); return n; };
      assert.equal(count(node => node.className === 'toolbar'), 1);
      assert.equal(count(node => node.id === 'mancardoMobileToolbarNav'), 1);
      assert.equal(count(node => node.id === 'pointsToggle'), 1);
      assert.equal(toolbar.children[0], originalButton, 'Controls retain identity/listeners');
      originalButton.onclick(); assert.ok(buttonClicks > 0);
      toggle.onclick(); assert.equal(points.classList.contains('hidden'), false); assert.equal(toggle.textContent, 'Hide point list');
      toggle.onclick(); assert.equal(points.classList.contains('hidden'), true); assert.equal(toggle.textContent, 'Show point list');
      assert.ok(pointRenders > 0);
      assert.equal(JSON.stringify(state), serialized);
      assert.equal(createHash('sha256').update(JSON.stringify(state)).digest('hex'), digest);
      assert.ok(invalidations > 0, 'Existing map sizing callback remains active');
      assert.equal(zoom.parentNode, currentWidth < 768 ? document.getElementById('mancardoMobileZoomTray') : controlHome);
      assert.equal(overlayControl.parentNode, currentWidth < 768 ? document.getElementById('mancardoMobileBottomTools') : controlHome);
    },
  };
  return f;
}
for (const entry of [durableEntry, legacyBaseEntry]) {
  for (const width of [767, 768]) {
    for (const order of ['media-first', 'resize-first']) {
      test(entry + ': toolbar startup and repeated responsive transitions from ' + width + ' (' + order + ')', async () => {
        const html = await (await render(entry)).text();
        const f = toolbarFixture(html, width);
        f.assertLayout();
        for (const next of [width, width, 767, 766, 766, 768, 1200, 1200, 767, 768, 767]) {
          f.resize(next, order); f.assertLayout();
        }
        const nav = f.nav;
        vm.runInContext(toolbarIife(html, 'installMancardoMobileLayoutV2'), f.context);
        f.assertLayout(); assert.equal(f.nav, nav, 'Repeated installation is idempotent');
      });
    }
  }
  test(entry + ': safe pre-install mobile fallback accepts a point toggle already in the stats row', async () => {
    const f = toolbarFixture(await (await render(entry)).text(), 767, { wrappers: false, displacedToggle: true });
    assert.equal(f.toolbar.parentNode, f.dock);
    assert.equal(f.toggle.parentNode, f.stats);
  });
  test(entry + ': safe pre-install mobile fallback tolerates an absent point toggle', async () => {
    const f = toolbarFixture(await (await render(entry)).text(), 767, { wrappers: false, displacedToggle: true, missingToggle: true });
    assert.equal(f.toolbar.parentNode, f.dock);
    assert.equal(f.toggle.parentNode, null);
  });
}
