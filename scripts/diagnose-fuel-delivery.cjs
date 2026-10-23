// Read-only exact deployed-shell diagnosis. Never execute delivered HTML or persist it.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const childProcess=require('node:child_process');
const {PIN,MANIFEST}=require('./release-map-performance-development.cjs');
const VERSION='7e6aed39-3549-4d1a-947d-8bd6caf9730a',DEPLOYMENT='b29387d1-19d2-4240-ac4e-2d201d3774b0';
const URL='https://mancardo-dev-test.jayfenno.workers.dev/';
const START='// Fuel data belongs to OSM',END='\n\n\nels.layerStreetsBtn.onclick';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const count=(s,needle)=>s.split(needle).length-1;
function compare(body,source){
 const a=source.indexOf(START),b=source.indexOf(END,a);
 if(a<0||b<=a||count(source,START)!==1)throw Error('INVALID_EXPECTED_SPAN');
 const expected=source.slice(a,b),start=body.indexOf(START),end=body.indexOf(END,start);
 const result={bodyBytes:Buffer.byteLength(body),bodySha256:hash(body),startMarkers:count(body,START),endMarkers:count(body,END),exact:body.includes(expected),expectedBytes:Buffer.byteLength(expected),expectedSha256:hash(expected),cacheDatabaseMarkers:count(body,'mancardo-fuel-cache-v1'),fuelControlMarkers:count(body,'function refreshFuelStations')};
 if(start<0||end<=start||result.startMarkers!==1)return result;
 const actual=body.slice(start,end),e=Buffer.from(expected),s=Buffer.from(actual);let first=0;
 while(first<e.length&&first<s.length&&e[first]===s[first])first++;
 let suffix=0;while(suffix<e.length-first&&suffix<s.length-first&&e[e.length-1-suffix]===s[s.length-1-suffix])suffix++;
 Object.assign(result,{actualBytes:s.length,actualSha256:hash(s),firstDifferingByte:result.exact?null:first,commonSuffixBytes:suffix,whitespaceOnlyDifference:expected.replace(/\s/g,'')===actual.replace(/\s/g,'')});
 if(!result.exact){
  // Only the pinned public source is emitted. Unknown response bytes are never logged,
  // even if they look like source code: HTML may contain keys or account information.
  result.expectedExcerpt=JSON.stringify(e.subarray(Math.max(0,first-32),first+64).toString());
  result.actualExcerpt=JSON.stringify(e.subarray(Math.max(0,first-32),first).toString())+' [response bytes withheld]';
  result.verifiedSuffixExcerpt=JSON.stringify(e.subarray(Math.max(e.length-suffix,e.length-64)).toString());
  result.actualWhitespaceAtDifference=/^[\t\r\n ]/.test(actual.slice(Buffer.from(s.subarray(0,first)).toString().length))?JSON.stringify(String.fromCharCode(s[first])):null;
 }
 return result;
}
function classify(status,type,body){
 if(status>=300&&status<400)return 'redirect';
 if(status!==200)return 'http-error';
 if(!type.includes('text/html'))return 'non-html';
 if(/<title[^>]*>\s*(?:Just a moment|Cloudflare Access|Access denied)|\/cdn-cgi\/challenge-platform|id="challenge-form"/i.test(body))return 'challenge-or-login';
 if(!body.includes('id="mapDiv"'))return 'unexpected-html';
 return 'application';
}
async function diagnose(env=process.env,request=fetch){
 const output={candidate:PIN,manifestSha256:MANIFEST,readOnly:true,versionVerified:false};
 const target=path.resolve(env.EVIDENCE_PATH||'fuel-delivery-diagnostic.json');
 try{
  if(!env.CF_TOKEN||!/^[a-f0-9]{32}$/i.test(env.CF_ACCOUNT||'')||!env.CF_ACCESS_CLIENT_ID||!env.CF_ACCESS_CLIENT_SECRET)throw Error('MISSING_CONFIGURATION');
  const root=path.resolve(env.CANDIDATE_ROOT||'.');
  if(childProcess.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==PIN)throw Error('WRONG_CHECKOUT');
  async function get(url,headers){return request(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers});}
  const base='https://api.cloudflare.com/client/v4/accounts/'+env.CF_ACCOUNT+'/workers/scripts/mancardo-dev-test';
  async function api(suffix){const r=await get(base+suffix,{Authorization:'Bearer '+env.CF_TOKEN});if(r.status!==200)throw Error('IDENTITY_READ_FAILED');const d=await r.json();if(d.success!==true)throw Error('IDENTITY_READ_FAILED');return d.result;}
  function verify(d){const v=d.deployments?.[0];if(v?.id!==DEPLOYMENT||v.versions?.length!==1||v.versions[0].version_id!==VERSION||v.versions[0].percentage!==100)throw Error('DEPLOYMENT_CHANGED');}
  verify(await api('/deployments'));
  const v=await api('/versions/'+VERSION);
  if(v.annotations?.['workers/message']!==PIN+' '+MANIFEST||v.annotations?.['workers/tag']!=='fuel-cancel-6ac8fb56f3b7')throw Error('CANDIDATE_CHANGED');
  output.versionVerified=true;output.versionId=VERSION;output.deploymentId=DEPLOYMENT;
  const r=await get(URL,{'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':env.CF_ACCESS_CLIENT_SECRET});
  // Bounded streaming read; never follow a redirect or fetch any subresource/data API.
  const reader=r.body?.getReader();let size=0,chunks=[];
  if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(value));}}
  const body=Buffer.concat(chunks).toString('utf8');output.status=r.status;output.responseKind=classify(r.status,r.headers.get('content-type')||'',body);
  if(output.responseKind==='application')output.fuel=compare(body,fs.readFileSync(path.join(root,'index.html'),'utf8'));
  verify(await api('/deployments'));output.versionUnchanged=true;
 }catch(e){const allowed=['MISSING_CONFIGURATION','WRONG_CHECKOUT','IDENTITY_READ_FAILED','DEPLOYMENT_CHANGED','CANDIDATE_CHANGED','RESPONSE_TOO_LARGE','INVALID_EXPECTED_SPAN'];output.error=allowed.includes(e.message)?e.message:'DIAGNOSTIC_FAILED';process.exitCode=1;}
 fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');return output;
}
module.exports={compare,classify,diagnose,VERSION,DEPLOYMENT};
if(require.main===module)diagnose();
