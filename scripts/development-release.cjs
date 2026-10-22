// Reviewed Development-only artifact route. No API writes except the explicit deploy command.
const fs=require('node:fs'),path=require('node:path'),{execFileSync,spawnSync}=require('node:child_process');
const {digest,out:production}=require('./build-production.cjs');
const {verify:verifyProduction}=require('./verify-production.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist/development');
const BRANCH='refs/heads/proposal/editor-integrity-20261022';
const PROD_DB='6ada726b-aae6-441b-a698-69dc0789c7b7';
function template(){
 const text=fs.readFileSync(path.join(root,'wrangler.dev.toml'),'utf8');
 if(digest(text)!=='e5237a94e142e693b8a3697b8259787adf35b7faba877a950ff21321aef78bea')throw Error('Unreviewed Development template');
 return text.replace('directory = "."','directory = "assets"');
}
function identity(env=process.env){
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!==BRANCH||env.RELEASE_SHA!==head||env.GITHUB_SHA!==head||!/^[a-f0-9]{40}$/.test(head))throw Error('Exact manually dispatched proposal source required');
 for(const k of ['RELEASE_MANIFEST','DEV_MANIFEST'])if(!/^[a-f0-9]{64}$/.test(env[k]||''))throw Error('Approved manifest inputs required');
}
function prepare(runtimeHash){
 verifyProduction(production,runtimeHash);
 fs.rmSync(out,{recursive:true,force:true});fs.cpSync(production,out,{recursive:true});
 fs.renameSync(path.join(out,'manifest.json'),path.join(out,'production-manifest.json'));
 fs.writeFileSync(path.join(out,'wrangler.toml'),template());
 const runtime=JSON.parse(fs.readFileSync(path.join(out,'production-manifest.json')));
 const names=[...Object.keys(runtime),'production-manifest.json'].sort();
 const manifest=Object.fromEntries(names.map(f=>[f,digest(fs.readFileSync(path.join(out,f)))]));
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 return digest(fs.readFileSync(path.join(out,'manifest.json')));
}
function verify(expected,runtimeHash,directory=out){
 const bytes=fs.readFileSync(path.join(directory,'manifest.json'));
 if(digest(bytes)!==expected)throw Error('Development manifest mismatch');
 const manifest=JSON.parse(bytes),files=[];
 function walk(dir,prefix=''){for(const name of fs.readdirSync(dir)){const full=path.join(dir,name),relative=prefix+name,stat=fs.lstatSync(full);if(stat.isSymbolicLink())throw Error('Symlink forbidden');if(stat.isDirectory())walk(full,relative+'/');else if(stat.isFile())files.push(relative);else throw Error('Nonregular artifact');}}
 walk(directory);
 if(JSON.stringify(files.sort())!==JSON.stringify([...Object.keys(manifest),'manifest.json'].sort()))throw Error('Unexpected artifact files');
 for(const [file,hash]of Object.entries(manifest)){if(!/^(worker[-a-z0-9]*\.js|assets\/index\.html|wrangler\.toml|production-manifest\.json)$/.test(file)||file.includes('qualification')||digest(fs.readFileSync(path.join(directory,file)))!==hash)throw Error('Artifact bytes or allowlist mismatch');}
 const prodBytes=fs.readFileSync(path.join(directory,'production-manifest.json'));if(digest(prodBytes)!==runtimeHash)throw Error('Qualified runtime identity mismatch');
 const prod=JSON.parse(prodBytes);
 if(JSON.stringify(Object.keys(manifest).sort())!==JSON.stringify([...Object.keys(prod),'production-manifest.json'].sort()))throw Error('Runtime file set mismatch');
 for(const [file,hash]of Object.entries(prod))if(file!=='wrangler.toml'&&manifest[file]!==hash)throw Error('Development runtime differs from qualified runtime');
 if(fs.readFileSync(path.join(directory,'wrangler.toml'),'utf8')!==template())throw Error('Development target template changed');
}
async function inspectTarget(env=process.env,fetcher=fetch){
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN,id=env.DEV_DB;
 if(!token||!/^[a-f0-9]{32}$/i.test(account||'')||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')||id.toLowerCase()===PROD_DB)throw Error('Existing isolated Development credentials/binding required');
 async function read(endpoint){let response;try{response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+endpoint,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}});}catch{throw Error('Read-only Development identity request failed');}if(!response.ok)throw Error('Read-only Development identity check failed');const json=await response.json();if(json.success!==true||!json.result)throw Error('Invalid identity response');return json.result;}
 const db=await read('/d1/database/'+id);if(String(db.uuid).toLowerCase()!==id.toLowerCase()||db.name!=='mancardo-private-library-dev')throw Error('Development database identity mismatch');
 const settings=await read('/workers/scripts/mancardo-dev-test/settings'),bindings=settings.bindings;
 if(!Array.isArray(bindings))throw Error('Missing existing Worker bindings');
 const databases=bindings.filter(b=>b.type==='d1');if(databases.length!==1||databases[0].name!=='PRIVATE_LIBRARY_DB'||String(databases[0].database_id||databases[0].id).toLowerCase()!==id.toLowerCase()||(databases[0].database_id&&databases[0].id&&String(databases[0].database_id).toLowerCase()!==String(databases[0].id).toLowerCase()))throw Error('Existing Development Worker binding mismatch');
 const assets=bindings.filter(b=>b.type==='assets');if(assets.length!==1||assets[0].name!=='ASSETS')throw Error('Existing asset binding mismatch');
 // Preserve existing Access configuration, never substitute a different audience.
 for(const key of ['CF_ACCESS_TEAM_DOMAIN','CF_ACCESS_AUD']){const wanted=template().match(new RegExp('^'+key+' = "([^"\\n]+)"$','m'))?.[1];const matches=bindings.filter(b=>b.name===key);if(!wanted||matches.length!==1||matches[0].type!=='plain_text'||matches[0].text!==wanted)throw Error('Existing authentication configuration mismatch');}
 return id;
}
async function deploy(){
 identity();verify(process.env.DEV_MANIFEST,process.env.RELEASE_MANIFEST);
 const id=await inspectTarget();
 // Recheck bytes after the read-only remote guard. Materialize only this approved placeholder.
 verify(process.env.DEV_MANIFEST,process.env.RELEASE_MANIFEST);
 const configured=template().replace('DEV_DATABASE_ID_REQUIRED',id);
 const configPath=path.join(out,'wrangler.toml');fs.writeFileSync(configPath,configured);
 console.log('Verified existing Development Worker, isolated binding, unchanged Access configuration and exact tested runtime.');
 console.log('Materialized Development config SHA256 '+digest(configured));
 const result=spawnSync(path.join(root,'node_modules/.bin/wrangler'),['deploy','--config',configPath,'--name','mancardo-dev-test','--keep-vars'],{cwd:root,env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
 if(result.error||result.signal||!Number.isInteger(result.status))throw Error('Deployment completion uncertain; inspect current version before retry');
 // Do not print Wrangler binding summaries: retained remote variables may be private.
 const output=String(result.stdout||'')+'\n'+String(result.stderr||'');
 const version=output.match(/Current Version ID:\s*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)?.[1];
 if(version)console.log('Development Worker version '+version);
 const url=output.match(/https:\/\/mancardo-dev-test\.[a-z0-9-]+\.workers\.dev\b/i)?.[0];
 if(url)console.log('Development URL '+url);
 if(result.status!==0)throw Error('Deployment returned failure; inspect current version before retry');
}
module.exports={prepare,verify,inspectTarget,identity,template,out};
if(require.main===module)(async()=>{const command=process.argv[2];identity();if(command==='prepare'){const hash=prepare(process.env.RELEASE_MANIFEST);if(hash!==process.env.DEV_MANIFEST)throw Error('Prepared Development digest differs from approved input');verify(hash,process.env.RELEASE_MANIFEST);console.log('Verified Development package '+hash);}else if(command==='deploy')await deploy();else throw Error('Unknown command');})().catch(e=>{console.error(String(e.message||'Development release failed'));process.exitCode=1;});
