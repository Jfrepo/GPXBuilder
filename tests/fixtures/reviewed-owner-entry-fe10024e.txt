// LOCAL REVIEW CANDIDATE ONLY. No Wrangler configuration selects this entrypoint.
// Adds a dormant, exact-origin diagnostic route without modifying editor code.
// Ordinary API/editor requests retain the current runtime's authentication and
// behavior. Marked diagnostic requests receive additional restrictive checks.
import runtime from './worker-delete-durable-fix.js';

export const QUALIFICATION_ORIGIN = 'https://mancardo-dev-test.jayfenno.workers.dev';
export const QUALIFICATION_PATH = '/api/private-library/qualification/owner-isolation';
export const QUALIFICATION_RUN = 'owner-isolation-20261018-1032';
const API = '/api/private-library';
const MARKER = 'x-mancardo-qualification-run';
const ACTION = 'x-mancardo-qualification-action';
const OWNER = 'x-mancardo-qualification-owner';
const DEVICE = 'disposable-' + QUALIFICATION_RUN;
const IDS = Object.freeze({ a: 'qual_owner_20261018_1032_a_7c9f2d', b: 'qual_owner_20261018_1032_b_f62e81' });

export function qualificationTrack(role, attemptedOverwrite = false) {
  if (!Object.hasOwn(IDS, role)) throw new Error('Unknown synthetic role');
  return {
    id: IDS[role], name: 'DOT-OWNER-QUAL-20261018-' + role.toUpperCase(), type: 'track',
    segments: [[{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0.001 }, { lat: 0.002, lon: 0.0015 }]],
    note: attemptedOverwrite ? 'Rejected foreign overwrite probe' : 'Disposable owner ' + role.toUpperCase() + ' baseline',
    visible: false,
  };
}
const other = role => role === 'a' ? 'b' : 'a';
const trackPath = role => API + '/tracks/' + IDS[role];
function failure(status, code) {
  return Response.json({ error: 'Qualification stopped. Preserve the records and inspect the result before any further action.', code },
    { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function configuredOwners(env) {
  const a = env.MANCARDO_QUALIFICATION_ACCOUNT_A, b = env.MANCARDO_QUALIFICATION_ACCOUNT_B;
  if (env.MANCARDO_QUALIFICATION_RUN !== QUALIFICATION_RUN ||
      typeof a !== 'string' || typeof b !== 'string' || !/^[a-f0-9]{24}$/.test(a) || !/^[a-f0-9]{24}$/.test(b) || a === b) return null;
  return { a, b };
}
async function responseJson(response) {
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Non-JSON diagnostic response');
  return response.json();
}
async function identity(request, env, ctx, owners) {
  const url = new URL(API + '/health', QUALIFICATION_ORIGIN);
  const response = await runtime.fetch(new Request(url, { headers: request.headers }), env, ctx);
  const value = await responseJson(response);
  if (!response.ok || value.authenticated !== true || value.storageReady !== true || value.schemaReady !== true) return null;
  const role = Object.keys(owners).find(role => owners[role] === value.accountKey);
  return role ? { role, accountKey: value.accountKey, accountLabel: value.accountLabel || 'Verified test participant' } : null;
}
async function exactRead(request, role, owner, env, ctx) {
  const headers = new Headers(request.headers);
  headers.set('x-mancardo-private-account', owner);
  headers.delete(MARKER); headers.delete(ACTION); headers.delete(OWNER);
  const response = await runtime.fetch(new Request(new URL(trackPath(role), QUALIFICATION_ORIGIN), { headers }), env, ctx);
  return { response, value: await responseJson(response) };
}
async function hashTrack(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function isBaseline(value, role) {
  const expected = qualificationTrack(role);
  return value.track_id === IDS[role] && value.revision === 1 && value.deleted === false &&
    JSON.stringify(value.track) === JSON.stringify(expected) && value.sha256 === await hashTrack(expected);
}
export function qualificationBody(role, action) {
  if (action === 'create-own') return { base_revision: 0, track: qualificationTrack(role), device_id: DEVICE };
  if (action === 'foreign-put') return { base_revision: 1, track: qualificationTrack(other(role), true), device_id: DEVICE };
  if (action === 'foreign-delete') return { base_revision: 1, device_id: DEVICE, authorized_user_delete: true, delete_intent: 'explicit-ui-delete' };
  return null;
}

// This script has no automatic fetch, retries, timers, app storage, credentials
// inspection or editable API inputs. Each mutation button is single-use for this
// page load. Reload is NOT permission to repeat an uncertain operation.
const CLIENT = String.raw`
(function(){
  'use strict';
  const config=JSON.parse(document.getElementById('configuration').textContent);
  const output=document.getElementById('results'), status=document.getElementById('status');
  const buttons=Array.from(document.querySelectorAll('button[data-action]'));
  const used=new Set(); let busy=false, stopped=false, ownSeen=false;
  const receipts=[];
  function show(message){status.textContent=message;}
  function draw(){for(const b of buttons)b.disabled=busy||(stopped&&b.dataset.action!=='read')||used.has(b.dataset.action);}
  function record(value){receipts.push(value);output.textContent=JSON.stringify({run:config.run,role:config.role,receipts:receipts},null,2);}
  function receiptResult(value,plan){
    const result={unexpected_fields_omitted:true};
    if(!value||typeof value!=='object'||Array.isArray(value))return result;
    const codes=['not_found','revision_conflict','authentication_required','private_account_required','private_account_mismatch',
      'delete_account_required','delete_account_mismatch','qualification_unavailable','qualification_method','qualification_identity',
      'qualification_account_changed','qualification_operation','qualification_origin','qualification_payload',
      'qualification_existing_record','qualification_positive_control','qualification_foreign_collision'];
    if(codes.includes(value.code))result.code=value.code;
    if(value.track_id===plan.id){
      result.track_id=plan.id;
      for(const key of ['revision','created_at','updated_at'])if(Number.isSafeInteger(value[key])&&value[key]>=0)result[key]=value[key];
      if(typeof value.deleted==='boolean')result.deleted=value.deleted;
      if(typeof value.sha256==='string'&&/^[a-f0-9]{64}$/.test(value.sha256))result.sha256=value.sha256;
      if(value.device_id===config.actions['create-own'].body.device_id)result.device_id=value.device_id;
    }
    if(Object.prototype.hasOwnProperty.call(value,'current'))result.current=value.current===null?null:'unexpected object omitted';
    if(value.track===null)result.track=null;
    else if(value.track_id===config.baseline.id&&JSON.stringify(value.track)===JSON.stringify(config.baseline))result.track=config.baseline;
    return result;
  }
  async function send(action){
    const plan=config.actions[action];
    if(!plan)throw new Error('Unknown action');
    const headers={'accept':'application/json','x-mancardo-qualification-run':config.run,
      'x-mancardo-qualification-action':action,'x-mancardo-qualification-owner':config.accountKey};
    if(plan.method==='DELETE')headers['x-mancardo-delete-account']=config.accountKey;
    else headers['x-mancardo-private-account']=config.accountKey;
    if(plan.body)headers['content-type']='application/json';
    const response=await fetch(plan.path,{method:plan.method,credentials:'same-origin',redirect:'error',cache:'no-store',headers:headers,
      ...(plan.body?{body:JSON.stringify(plan.body)}:{})});
    if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('Unexpected response format');
    const value=await response.json();
    record({at:new Date().toISOString(),action:action,target:plan.id,status:response.status,result:receiptResult(value,plan)});
    if(action==='read-own'){
      if(response.status===404&&value.code==='not_found'){if(ownSeen)throw new Error('Previously verified own record disappeared');return value;}
      if(response.status!==200||value.track_id!==plan.id||value.revision!==1||value.deleted!==false||
        JSON.stringify(value.track)!==JSON.stringify(config.baseline)||value.sha256!==config.baselineHash)throw new Error('Positive control changed');
      ownSeen=true;used.add('create-own');
    }else if(action==='read-foreign'){
      if(response.status!==404||value.code!=='not_found')throw new Error('Foreign read differed');
    }else if(action==='create-own'){
      if(response.status!==201||value.track_id!==plan.id||value.revision!==1||value.sha256!==config.baselineHash)throw new Error('Creation outcome differs');
      ownSeen=true;
    }else if(response.status!==409||value.code!=='revision_conflict'||value.current!==null){
      throw new Error('Foreign mutation was not the expected owner-scoped rejection');
    }
    return value;
  }
  async function act(action){
    if(busy||used.has(action)||(stopped&&action!=='read'))return;
    if(action!=='read'){
      const text=action==='foreign-delete'
        ?'Only proceed with specific approval to attempt irreversible deletion of '+config.foreignName+' ('+config.foreignId+'). A protection defect could permanently delete it. One attempt only. Proceed?'
        :action==='foreign-put'?'Only proceed with approval to attempt changing '+config.foreignName+' ('+config.foreignId+'). One attempt only. Proceed?'
        :'Create only '+config.baseline.name+' ('+config.baseline.id+'), a disposable invented track?';
      if(!window.confirm(text))return;
      used.add(action);
    }
    busy=true;draw();
    try{
      if(action==='read'){await send('read-own');await send('read-foreign');show('Read receipts captured. Compare BOTH owners’ exact positive controls; this is not a complete test result.');}
      else{await send(action);show('One operation returned the expected result. Preserve the receipt and verify both owners’ records.');}
    }catch(error){stopped=true;record({at:new Date().toISOString(),outcome:'STOP: failed or uncertain; do not repeat writes or reload to unlock them.'});show('STOP. Outcome differs or is uncertain. Only exact reads remain available. Do not retry, reload, repair or delete anything.');}
    finally{busy=false;draw();}
  }
  for(const button of buttons)button.addEventListener('click',()=>act(button.dataset.action));
  document.getElementById('identity').textContent=config.accountLabel+' | fixed role '+config.role.toUpperCase();
  document.getElementById('own').textContent=config.baseline.name+' ('+config.baseline.id+')';
  document.getElementById('foreign').textContent=config.foreignName+' ('+config.foreignId+')';
  show('No request or mutation runs automatically. Keep existing application storage unchanged.');draw();
})();`;

async function page(who) {
  const foreign = other(who.role), baseline = qualificationTrack(who.role);
  const actions = {};
  for (const action of ['read-own', 'read-foreign', 'create-own', 'foreign-put', 'foreign-delete']) {
    const role = action === 'read-own' || action === 'create-own' ? who.role : foreign;
    actions[action] = { path: trackPath(role), id: IDS[role], method: action.startsWith('read-') ? 'GET' : action === 'foreign-delete' ? 'DELETE' : 'PUT', body: qualificationBody(who.role, action) };
  }
  const config = { run: QUALIFICATION_RUN, ...who, baseline, baselineHash: await hashTrack(baseline), foreignId: IDS[foreign], foreignName: qualificationTrack(foreign).name, actions };
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, '0')).join('');
  const json = JSON.stringify(config).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Development ownership qualification</title>' +
    '<body><h1>Development ownership qualification</h1><p id="identity"></p><p>Own disposable target: <span id="own"></span></p><p>Foreign disposable target: <span id="foreign"></span></p>' +
    '<p>Separate profiles only. This does not test account switching. Use only after both owner baselines and the precise mutation permissions have been reviewed. No automatic cleanup.</p>' +
    '<button data-action="read">Read the two exact IDs</button> <button data-action="create-own">Create my one disposable record</button> ' +
    '<button data-action="foreign-put">Attempt one approved foreign PUT</button> <button data-action="foreign-delete">Attempt one approved foreign DELETE</button>' +
    '<p role="status" id="status"></p><pre id="results"></pre><script type="application/json" id="configuration" nonce="'+nonce+'">'+json+'</script>' +
    '<script nonce="'+nonce+'">'+CLIENT+'</script></body></html>';
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; script-src 'nonce-"+nonce+"'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), marked = request.headers.has(MARKER) || request.headers.has(ACTION) || request.headers.has(OWNER);
    const isPage = url.pathname === QUALIFICATION_PATH;
    if (!isPage && !marked) return runtime.fetch(request, env, ctx);
    // Never serve this diagnostic on Production, previews, aliases or other origins.
    if (url.origin !== QUALIFICATION_ORIGIN || url.search || !configuredOwners(env)) return failure(404, 'qualification_unavailable');
    if (isPage && (request.method !== 'GET' || marked)) return failure(405, 'qualification_method');
    try {
      const who = await identity(request, env, ctx, configuredOwners(env));
      if (!who) return failure(403, 'qualification_identity');
      if (isPage) return page(who);
      if (request.headers.get(MARKER) !== QUALIFICATION_RUN || request.headers.get(OWNER) !== who.accountKey) return failure(409, 'qualification_account_changed');
      const action = request.headers.get(ACTION), body = qualificationBody(who.role, action);
      const expectedRole = action === 'read-own' || action === 'create-own' ? who.role : other(who.role);
      const method = action === 'read-own' || action === 'read-foreign' ? 'GET' : action === 'foreign-delete' ? 'DELETE' : 'PUT';
      if (!['read-own', 'read-foreign', 'create-own', 'foreign-put', 'foreign-delete'].includes(action) || url.pathname !== trackPath(expectedRole) || request.method !== method)
        return failure(400, 'qualification_operation');
      const ownerHeader = method === 'DELETE' ? 'x-mancardo-delete-account' : 'x-mancardo-private-account';
      if (request.headers.get(ownerHeader) !== who.accountKey) return failure(409, 'qualification_account_changed');
      if (method !== 'GET') {
        if (request.headers.get('origin') !== QUALIFICATION_ORIGIN || !(request.headers.get('content-type') || '').startsWith('application/json')) return failure(403, 'qualification_origin');
        const text = await request.clone().text();
        if (text.length > 4096 || JSON.stringify(JSON.parse(text)) !== JSON.stringify(body)) return failure(400, 'qualification_payload');
        const own = await exactRead(request, who.role, who.accountKey, env, ctx);
        if (action === 'create-own') {
          if (own.response.status !== 404 || own.value.code !== 'not_found') return failure(409, 'qualification_existing_record');
        } else {
          if (own.response.status !== 200 || !await isBaseline(own.value, who.role)) return failure(409, 'qualification_positive_control');
          const foreign = await exactRead(request, other(who.role), who.accountKey, env, ctx);
          if (foreign.response.status !== 404 || foreign.value.code !== 'not_found') return failure(409, 'qualification_foreign_collision');
        }
      }
      // Same method, exact path/body, and original verified authentication. The
      // current outer account guard and actual owner/revision SQL still execute.
      return runtime.fetch(request, env, ctx);
    } catch (_) {
      // Never log/return arbitrary exceptions, request headers, or credentials.
      return failure(503, 'qualification_unavailable');
    }
  },
};
