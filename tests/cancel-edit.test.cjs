// Real emitted editor, Leaflet, DOM, storage and clock. APIs/map provider are
// synthetic; every request is intercepted by the existing fixture.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');const {fixture}=require('./helpers/map-performance-fixture.cjs');let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});});
test.after(()=>browser?.close());
async function setup(t,options={}){
 const f=await fixture(browser,t,options);f.writes=[];f.page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))f.writes.push({method:r.method(),url:r.url()});});
 t.after(()=>{assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);});
 await f.page.evaluate(()=>{window.confirmations=[];window.alerts=[];window.confirmAnswer=true;window.confirm=message=>{confirmations.push(message);return confirmAnswer;};window.alert=message=>alerts.push(message);
 window.snapshot=()=>JSON.stringify({current:state.current,id:state.currentId,selection:state.selection,history:state.history,future:state.future,library:state.library,label:els.saveBtn.textContent,stored:localStorage.getItem('switchback_local_tracks_v1')});
 window.beginExtend=()=>{selectPoint(0,state.current.segments[0].length-1);els.extendTrackBtn.click();};window.addPoint=()=>map.fire('click',{latlng:L.latLng(1.01,2.01)});
 });return f.page;
}
for(const mobile of [false,true])test(`Cancel restores exact working copy and save state (${mobile?'mobile':'desktop'})`,async t=>{
 const p=await setup(t,{mobile});
 await p.evaluate(()=>{selectPoint(0,99);window.before=snapshot();els.extendTrackBtn.click();addPoint();});
 await p.locator('#cancelChangeBtn').scrollIntoViewIfNeeded();assert.equal(await p.locator('#cancelChangeBtn').isVisible(),true);await p.getByRole('button',{name:'Cancel edit',exact:true}).click();
 assert.deepEqual(await p.evaluate(()=>({same:snapshot()===before,mode:state.mode,count:confirmations.length,name:!els.nameOverlay.classList.contains('hidden')})),{same:true,mode:'view',count:1,name:false});
});
test('rejected confirmation and repeated Cancel preserve editing then become harmless',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{beginExtend();addPoint();const changed=snapshot();confirmAnswer=false;els.cancelChangeBtn.click();const kept=changed===snapshot()&&state.mode==='extend';confirmAnswer=true;els.cancelChangeBtn.click();const restored=snapshot();els.cancelChangeBtn.onclick();return {kept,repeated:restored===snapshot(),prompts:confirmations.length};});assert.deepEqual(r,{kept:true,repeated:true,prompts:2});
});
test('new track Cancel removes only its recovery draft and restores previous selection',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{selectPoint(0,4);const before=snapshot();startNewRoute();const id=state.current.id;addPoint();localStorage.setItem('mancardo_unnamed_draft_recovery_v1',JSON.stringify(state.current));els.cancelChangeBtn.click();return {same:snapshot()===before,draft:localStorage.getItem('mancardo_unnamed_draft_recovery_v1'),ghost:state.library.some(t=>t.id===id),named:!els.nameOverlay.classList.contains('hidden')};});assert.deepEqual(r,{same:true,draft:null,ghost:false,named:false});
});
test('Cancel leaves an unrelated pre-existing recovery draft intact',async t=>{const p=await setup(t);assert.equal(await p.evaluate(()=>{const draft=JSON.stringify({id:'earlier-draft',segments:[[{lat:1,lon:2}]]});localStorage.setItem('mancardo_unnamed_draft_recovery_v1',draft);startNewRoute();addPoint();els.cancelChangeBtn.click();return localStorage.getItem('mancardo_unnamed_draft_recovery_v1')===draft;}),true);});
for(const variant of ['empty-new','empty-existing','undo'])test(`no confirmation for no remaining geometry changes: ${variant}`,async t=>{const p=await setup(t);const r=await p.evaluate(variant=>{if(variant==='empty-new')startNewRoute();else beginExtend();if(variant==='undo'){addPoint();undo();}els.cancelChangeBtn.click();return {prompts:confirmations.length,mode:state.mode,label:els.saveBtn.textContent};},variant);assert.deepEqual(r,{prompts:0,mode:'view',label:'Saved'});});
test('prior unsaved geometry, history and dirty indicator survive Cancel; session Undo cannot consume earlier history',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{reverseTrack();els.completeChangeBtn.click();selectPoint(0,99);const before=snapshot();els.extendTrackBtn.click();undo();const stayed=JSON.stringify(state.current.segments)===JSON.stringify(JSON.parse(before).current.segments);addPoint();undo();els.cancelChangeBtn.click();return {stayed,exact:snapshot()===before,label:els.saveBtn.textContent,prompts:confirmations.length};});assert.deepEqual(r,{stayed:true,exact:true,label:'Save changes',prompts:0});
});
test('Complete/name Cancel and Escape retain new session; naming commits it',async t=>{
 const p=await setup(t);await p.evaluate(()=>{startNewRoute();addPoint();els.completeChangeBtn.click();});assert.equal(await p.locator('#nameOverlay').isVisible(),true);await p.locator('#nameCancelBtn').click();assert.equal(await p.evaluate(()=>state.mode),'draw');await p.locator('#completeChangeBtn').click();await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>state.mode),'draw');await p.locator('#completeChangeBtn').click();await p.locator('#nameInput').fill('New named track');await p.locator('#nameSaveBtn').click();assert.deepEqual(await p.evaluate(()=>({name:state.current.name,saved:state.library[0].id===state.currentId,cancel:!els.cancelChangeBtn.classList.contains('hidden'),label:els.saveBtn.textContent,mode:state.mode})),{name:'New named track',saved:true,cancel:false,label:'Saved',mode:'view'});
});
test('Save ends boundary; subsequent Cancel cannot undo saved geometry',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{beginExtend();addPoint();els.saveBtn.click();selectPoint(0,state.current.segments[0].length-1);const saved=snapshot();els.extendTrackBtn.click();addPoint();els.cancelChangeBtn.click();return {exact:snapshot()===saved,label:els.saveBtn.textContent,stored:JSON.stringify(JSON.parse(localStorage.getItem('switchback_local_tracks_v1'))[0].segments)===JSON.stringify(state.current.segments)};});assert.deepEqual(r,{exact:true,label:'Saved',stored:true});
});
for(const action of ['joinNextBtn','splitAfterBtn'])test(`${action} stages during a session and retains standalone persistence`,async t=>{
 const p=await setup(t);const r=await p.evaluate(action=>{selectPoint(0,99);const before=snapshot(),library=JSON.stringify(state.library);els.extendTrackBtn.click();addPoint();selectPoint(0,action==='splitAfterBtn'?50:100);els[action].click();const staged=JSON.stringify(state.library)===library;undo();els.cancelChangeBtn.click();const restored=snapshot()===before;selectPoint(0,action==='splitAfterBtn'?50:99);els[action].click();return {staged,restored,standalone:JSON.stringify(state.library)!==library,persisted:JSON.stringify(JSON.parse(localStorage.getItem('switchback_local_tracks_v1'))[0].segments)===JSON.stringify(state.current.segments)};},action);assert.deepEqual(r,{staged:true,restored:true,standalone:true,persisted:true});
});
test('failed local Save retains editor, dirty state and library; Cancel remains safe',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{beginExtend();const initialLibrary=JSON.stringify(state.library);addPoint();const before=snapshot();const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='switchback_local_tracks_v1')throw new DOMException('quota','QuotaExceededError');return set.call(this,k,v);};els.saveBtn.click();Storage.prototype.setItem=set;const retained=snapshot()===before;els.cancelChangeBtn.click();return {retained,library:JSON.stringify(state.library)===initialLibrary,alerts:alerts.length,label:els.saveBtn.textContent};});assert.deepEqual(r,{retained:true,library:true,alerts:1,label:'Saved'});
});
for(const source of ['memory','storage','editor'])test(`concurrent ${source} changes block stale restoration and Save`,async t=>{
 const p=await setup(t);const r=await p.evaluate(source=>{beginExtend();addPoint();if(source==='memory')state.library[0].note='concurrent note';if(source==='storage')localStorage.setItem('switchback_local_tracks_v1',JSON.stringify([{...state.library[0],note:'other tab'}]));if(source==='editor')state.current={...state.current,note:'newer editor'};const before=snapshot();els.cancelChangeBtn.click();els.saveBtn.click();return {retained:snapshot()===before,alerts:alerts.length,mode:state.mode};},source);assert.deepEqual(r,{retained:true,alerts:2,mode:'extend'});
});
test('navigation and metadata publication are blocked without clearing dirty state',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{beginExtend();addPoint();const before=snapshot();loadItem(state.currentId);saveTrackNote(state.currentId,'must not publish');renameTrack(state.currentId);startNewRoute();els.joinToPointBtn.onclick();return {retained:snapshot()===before,alerts:alerts.length,label:els.saveBtn.textContent};});assert.deepEqual(r,{retained:true,alerts:5,label:'Save changes'});
});
test('rejected map-point navigation preserves the current selection',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{state.library.push({id:'other',name:'Other',visible:true,segments:[[],[{lat:3,lon:4}]]});render();beginExtend();addPoint();const before=snapshot();const marker=Object.values(map._layers).find(l=>l instanceof L.CircleMarker&&l.getLatLng().lat===3);marker.fire('click',{latlng:L.latLng(3,4),originalEvent:new MouseEvent('click')});return {same:snapshot()===before,alerts:alerts.length};});assert.deepEqual(r,{same:true,alerts:1});
});
test('range deletion stays staged inside an edit and Cancel restores prior highlights',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{selectPoint(0,99);state.pointHighlights=[{seg:0,pt:3},{seg:0,pt:4}];state.pointHighlightAnchor={seg:0,pt:3};const highlights=JSON.stringify(state.pointHighlights),before=snapshot();els.extendTrackBtn.click();addPoint();els.deleteSegBtn.click();els.deleteSegBtn.click();els.cancelChangeBtn.click();return {same:snapshot()===before,highlights:JSON.stringify(state.pointHighlights)===highlights};});assert.deepEqual(r,{same:true,highlights:true});
});
test('typing into a pre-existing note field cannot leak blocked text after Complete',async t=>{
 const p=await setup(t);await p.evaluate(()=>{state.noteOpenId=state.currentId;render();});
 // Library rendering is separate from map rendering; open Note through its UI.
 await p.locator('#trackList .track-item:not(.mancardo-waypoint-item) .track-more').click();await p.getByRole('button',{name:'Note',exact:true}).click();
 // The prior explicit noteOpenId toggle above may close it; reopen if necessary.
 if(await p.locator('.track-note textarea').count()===0){await p.locator('#trackList .track-item:not(.mancardo-waypoint-item) .track-more').click();await p.getByRole('button',{name:'Note',exact:true}).click();}
 await p.evaluate(()=>{beginExtend();addPoint();});await p.locator('.track-note textarea').focus();await p.keyboard.type('x');
 assert.equal(await p.locator('.track-note textarea').inputValue(),'');await p.evaluate(()=>els.completeChangeBtn.click());await p.locator('.track-note textarea').focus();await p.keyboard.type('y');assert.equal(await p.locator('.track-note textarea').inputValue(),'y');assert.equal(await p.evaluate(()=>state.library[0].note),'y');
});

test('New button isolates previous point highlights and Cancel restores them',async t=>{const p=await setup(t);const r=await p.evaluate(()=>{state.pointHighlights=[{seg:0,pt:3}];state.pointHighlightAnchor={seg:0,pt:3};state.pointHover={seg:0,pt:3};const old=JSON.stringify([state.pointHighlights,state.pointHighlightAnchor,state.pointHover]);els.newRouteBtn.click();const empty=state.pointHighlights.length===0&&state.pointHighlightAnchor===null&&state.pointHover===null;els.cancelChangeBtn.click();return {empty,restored:JSON.stringify([state.pointHighlights,state.pointHighlightAnchor,state.pointHover])===old};});assert.deepEqual(r,{empty:true,restored:true});});
