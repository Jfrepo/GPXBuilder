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
 window.cancelEditForTest=()=>{els.cancelChangeBtn.click();if(els.discardEditDialog.open){confirmations.push(els.discardEditTitle.textContent);if(confirmAnswer)els.discardEditConfirm.click();else els.discardEditKeep.click();}};
 window.beginExtend=()=>{selectPoint(0,state.current.segments[0].length-1);els.extendTrackBtn.click();};window.addPoint=()=>map.fire('click',{latlng:L.latLng(1.01,2.01)});
 });return f.page;
}
for(const mobile of [false,true])test(`Cancel restores exact working copy and save state (${mobile?'mobile':'desktop'})`,async t=>{
 const p=await setup(t,{mobile});
 await p.evaluate(()=>{selectPoint(0,99);window.before=snapshot();els.extendTrackBtn.click();addPoint();});
 await p.locator('#cancelChangeBtn').scrollIntoViewIfNeeded();assert.equal(await p.locator('#cancelChangeBtn').isVisible(),true);await p.locator('#cancelChangeBtn').click();assert.equal(await p.locator('#discardEditDialog').isVisible(),true);await p.locator('#discardEditConfirm').click();
 assert.deepEqual(await p.evaluate(()=>({same:snapshot()===before,mode:state.mode,name:!els.nameOverlay.classList.contains('hidden')})),{same:true,mode:'view',name:false});
});
test('rejected confirmation and repeated Cancel preserve editing then become harmless',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{beginExtend();addPoint();const changed=snapshot();confirmAnswer=false;cancelEditForTest();const kept=changed===snapshot()&&state.mode==='extend';confirmAnswer=true;cancelEditForTest();const restored=snapshot();els.cancelChangeBtn.onclick();return {kept,repeated:restored===snapshot(),prompts:confirmations.length};});assert.deepEqual(r,{kept:true,repeated:true,prompts:2});
});
test('new track Cancel removes only its recovery draft and restores previous selection',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{selectPoint(0,4);const before=snapshot();startNewRoute();const id=state.current.id;addPoint();localStorage.setItem('mancardo_unnamed_draft_recovery_v1',JSON.stringify(state.current));cancelEditForTest();return {same:snapshot()===before,draft:localStorage.getItem('mancardo_unnamed_draft_recovery_v1'),ghost:state.library.some(t=>t.id===id),named:!els.nameOverlay.classList.contains('hidden')};});assert.deepEqual(r,{same:true,draft:null,ghost:false,named:false});
});
test('Cancel leaves an unrelated pre-existing recovery draft intact',async t=>{const p=await setup(t);assert.equal(await p.evaluate(()=>{const draft=JSON.stringify({id:'earlier-draft',segments:[[{lat:1,lon:2}]]});localStorage.setItem('mancardo_unnamed_draft_recovery_v1',draft);startNewRoute();addPoint();cancelEditForTest();return localStorage.getItem('mancardo_unnamed_draft_recovery_v1')===draft;}),true);});
for(const variant of ['empty-new','empty-existing','undo'])test(`no confirmation for no remaining geometry changes: ${variant}`,async t=>{const p=await setup(t);const r=await p.evaluate(variant=>{if(variant==='empty-new')startNewRoute();else beginExtend();if(variant==='undo'){addPoint();undo();}cancelEditForTest();return {prompts:confirmations.length,mode:state.mode,label:els.saveBtn.textContent};},variant);assert.deepEqual(r,{prompts:0,mode:'view',label:'Saved'});});
test('prior unsaved geometry, history and dirty indicator survive Cancel; session Undo cannot consume earlier history',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{reverseTrack();els.completeChangeBtn.click();selectPoint(0,99);const before=snapshot();els.extendTrackBtn.click();undo();const stayed=JSON.stringify(state.current.segments)===JSON.stringify(JSON.parse(before).current.segments);addPoint();undo();cancelEditForTest();return {stayed,exact:snapshot()===before,label:els.saveBtn.textContent,prompts:confirmations.length};});assert.deepEqual(r,{stayed:true,exact:true,label:'Save changes',prompts:0});
});
test('Complete/name Cancel and Escape retain new session; naming commits it',async t=>{
 const p=await setup(t);await p.evaluate(()=>{startNewRoute();addPoint();els.completeChangeBtn.click();});assert.equal(await p.locator('#nameOverlay').isVisible(),true);await p.locator('#nameCancelBtn').click();assert.equal(await p.evaluate(()=>state.mode),'draw');await p.locator('#completeChangeBtn').click();await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>state.mode),'draw');await p.locator('#completeChangeBtn').click();await p.locator('#nameInput').fill('New named track');await p.locator('#nameSaveBtn').click();assert.deepEqual(await p.evaluate(()=>({name:state.current.name,saved:state.library[0].id===state.currentId,cancel:!els.cancelChangeBtn.classList.contains('hidden'),label:els.saveBtn.textContent,mode:state.mode})),{name:'New named track',saved:true,cancel:false,label:'Saved',mode:'view'});
});
test('Save ends boundary; subsequent Cancel cannot undo saved geometry',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{beginExtend();addPoint();els.saveBtn.click();selectPoint(0,state.current.segments[0].length-1);const saved=snapshot();els.extendTrackBtn.click();addPoint();cancelEditForTest();return {exact:snapshot()===saved,label:els.saveBtn.textContent,stored:JSON.stringify(JSON.parse(localStorage.getItem('switchback_local_tracks_v1'))[0].segments)===JSON.stringify(state.current.segments)};});assert.deepEqual(r,{exact:true,label:'Saved',stored:true});
});
for(const action of ['joinNextBtn','splitAfterBtn'])test(`${action} stages during a session and retains standalone persistence`,async t=>{
 const p=await setup(t);const r=await p.evaluate(action=>{selectPoint(0,99);const before=snapshot(),library=JSON.stringify(state.library);els.extendTrackBtn.click();addPoint();selectPoint(0,action==='splitAfterBtn'?50:100);els[action].click();const staged=JSON.stringify(state.library)===library;undo();cancelEditForTest();const restored=snapshot()===before;selectPoint(0,action==='splitAfterBtn'?50:99);els[action].click();return {staged,restored,standalone:JSON.stringify(state.library)!==library,persisted:JSON.stringify(JSON.parse(localStorage.getItem('switchback_local_tracks_v1'))[0].segments)===JSON.stringify(state.current.segments)};},action);assert.deepEqual(r,{staged:true,restored:true,standalone:true,persisted:true});
});
test('failed local Save retains editor, dirty state and library; Cancel remains safe',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{beginExtend();const initialLibrary=JSON.stringify(state.library);addPoint();const before=snapshot();const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='switchback_local_tracks_v1')throw new DOMException('quota','QuotaExceededError');return set.call(this,k,v);};els.saveBtn.click();Storage.prototype.setItem=set;const retained=snapshot()===before;cancelEditForTest();return {retained,library:JSON.stringify(state.library)===initialLibrary,alerts:alerts.length,label:els.saveBtn.textContent};});assert.deepEqual(r,{retained:true,library:true,alerts:1,label:'Saved'});
});
for(const source of ['memory','storage','editor'])test(`concurrent ${source} changes block stale restoration and Save`,async t=>{
 const p=await setup(t);const r=await p.evaluate(source=>{beginExtend();addPoint();if(source==='memory')state.library[0].note='concurrent note';if(source==='storage')localStorage.setItem('switchback_local_tracks_v1',JSON.stringify([{...state.library[0],note:'other tab'}]));if(source==='editor')state.current={...state.current,note:'newer editor'};const before=snapshot();cancelEditForTest();els.saveBtn.click();return {retained:snapshot()===before,alerts:alerts.length,mode:state.mode};},source);assert.deepEqual(r,{retained:true,alerts:2,mode:'extend'});
});
test('navigation and metadata publication are blocked without clearing dirty state',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{beginExtend();addPoint();const before=snapshot();loadItem(state.currentId);saveTrackNote(state.currentId,'must not publish');renameTrack(state.currentId);startNewRoute();els.joinToPointBtn.onclick();return {retained:snapshot()===before,alerts:alerts.length,label:els.saveBtn.textContent};});assert.deepEqual(r,{retained:true,alerts:5,label:'Save changes'});
});
test('rejected map-point navigation preserves the current selection',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{state.library.push({id:'other',name:'Other',visible:true,segments:[[],[{lat:3,lon:4}]]});render();beginExtend();addPoint();const before=snapshot();const marker=Object.values(map._layers).find(l=>l instanceof L.CircleMarker&&l.getLatLng().lat===3);marker.fire('click',{latlng:L.latLng(3,4),originalEvent:new MouseEvent('click')});return {same:snapshot()===before,alerts:alerts.length};});assert.deepEqual(r,{same:true,alerts:1});
});
test('range deletion stays staged inside an edit and Cancel restores prior highlights',async t=>{
 const p=await setup(t);const r=await p.evaluate(()=>{selectPoint(0,99);state.pointHighlights=[{seg:0,pt:3},{seg:0,pt:4}];state.pointHighlightAnchor={seg:0,pt:3};const highlights=JSON.stringify(state.pointHighlights),before=snapshot();els.extendTrackBtn.click();addPoint();els.deleteSegBtn.click();els.deleteSegBtn.click();cancelEditForTest();return {same:snapshot()===before,highlights:JSON.stringify(state.pointHighlights)===highlights};});assert.deepEqual(r,{same:true,highlights:true});
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

test('New button isolates previous point highlights and Cancel restores them',async t=>{const p=await setup(t);const r=await p.evaluate(()=>{state.pointHighlights=[{seg:0,pt:3}];state.pointHighlightAnchor={seg:0,pt:3};state.pointHover={seg:0,pt:3};const old=JSON.stringify([state.pointHighlights,state.pointHighlightAnchor,state.pointHover]);els.newRouteBtn.click();const empty=state.pointHighlights.length===0&&state.pointHighlightAnchor===null&&state.pointHover===null;cancelEditForTest();return {empty,restored:JSON.stringify([state.pointHighlights,state.pointHighlightAnchor,state.pointHover])===old};});assert.deepEqual(r,{empty:true,restored:true});});

for(const width of [2048,1100,768,390,320])test(`sole completion tick and fitted Cancel remain usable across editing modes at ${width}px`,async t=>{
 const p=await setup(t,{mobile:width<768});await p.setViewportSize({width,height:width===2048?1221:900});
 const tick=p.getByRole('button',{name:'Complete Change',exact:true});assert.equal(await tick.count(),1);assert.equal(await tick.isDisabled(),true);
 assert.equal(await p.locator('#modeBanner button').count(),0);
 for(const mode of ['draw','extend','move','edited']){
  await p.evaluate(mode=>{if(mode==='draw')startNewRoute();else if(mode==='extend')beginExtend();else if(mode==='move'){selectPoint(0,10);els.movePointBtn.click();}else reverseTrack();},mode);
  await p.locator('#cancelChangeBtn').scrollIntoViewIfNeeded();assert.equal(await tick.isEnabled(),true);
  const layout=await p.evaluate(()=>{
   const b=els.modeBanner,c=els.cancelChangeBtn,f=els.completeChangeBtn,layer=document.querySelector('.layer-toggle');
   const br=b.getBoundingClientRect(),cr=c.getBoundingClientRect(),fr=f.getBoundingClientRect(),lr=layer.getBoundingClientRect();
   const hit=e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
   return {adjacent:innerWidth>=768?cr.top>=fr.bottom&&cr.top-fr.bottom<10:cr.left>=fr.right&&cr.left-fr.right<10,inside:br.left>=0&&br.right<=innerWidth,clearOfLayers:br.top>=lr.bottom,hit:hit(c)&&hit(f),fits:c.scrollWidth<=c.clientWidth,tooltip:c.dataset.tooltip,amber:getComputedStyle(f).backgroundColor,pending:!f.querySelector('.completion-pending-mark').classList.contains('hidden')};
  });
  assert.equal(layout.adjacent,true);assert.equal(layout.inside,true);assert.equal(layout.clearOfLayers,true);assert.equal(layout.hit,true);assert.equal(layout.fits,true);assert.equal(layout.tooltip,'Cancel edit');assert.equal(layout.amber,'rgb(250, 204, 21)');assert.equal(layout.pending,true);
  if(process.env.CANCEL_LAYOUT_ARTIFACT_DIR){fs.mkdirSync(process.env.CANCEL_LAYOUT_ARTIFACT_DIR,{recursive:true});await p.screenshot({path:`${process.env.CANCEL_LAYOUT_ARTIFACT_DIR}/${width}-${mode}.png`});}
  await p.locator('#cancelChangeBtn').click();if(await p.locator('#discardEditDialog').isVisible())await p.locator('#discardEditConfirm').click();assert.equal(await p.locator('#modeBanner').isVisible(),false);assert.equal(await tick.isDisabled(),true);assert.equal(await p.locator('#nameOverlay').isVisible(),false);
  assert.equal(await tick.evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(250, 204, 21)'),false);
 }
});
test('existing Complete ends editing without persisting or changing pending Save state',async t=>{
 const p=await setup(t);await p.evaluate(()=>{window.storedBefore=localStorage.getItem('switchback_local_tracks_v1');window.libraryBefore=JSON.stringify(state.library);beginExtend();addPoint();window.edited=JSON.stringify(state.current);});
 await p.locator('#completeChangeBtn').click();assert.deepEqual(await p.evaluate(()=>({mode:state.mode,current:JSON.stringify(state.current)===edited,library:JSON.stringify(state.library)===libraryBefore,storage:localStorage.getItem('switchback_local_tracks_v1')===storedBefore,label:els.saveBtn.textContent,disabled:els.completeChangeBtn.disabled})),{mode:'view',current:true,library:true,storage:true,label:'Save changes',disabled:true});
});

for(const mobile of [false,true])test(`styled discard dialog safely dismisses and confirms (${mobile?'mobile':'desktop'})`,async t=>{
 const p=await setup(t,{mobile});await p.setViewportSize({width:mobile?320:2048,height:mobile?740:1221});
 await p.evaluate(()=>{window.before=snapshot();startNewRoute();addPoint();window.changed=snapshot();});
 const cancel=p.locator('#cancelChangeBtn'),dialog=p.getByRole('dialog',{name:'Discard unsaved track?',exact:true}),keep=p.getByRole('button',{name:'Keep editing',exact:true}),discard=p.getByRole('button',{name:'Discard track',exact:true});
 await cancel.click();assert.equal(await dialog.isVisible(),true);assert.equal(await keep.evaluate(e=>e===document.activeElement),true);
 assert.equal(await p.locator('#discardEditDescription').textContent(),'Only this new unsaved track will be discarded. Earlier unsaved work and pending saves will be kept.');
 await p.keyboard.press('Enter');assert.equal(await dialog.isVisible(),false);assert.equal(await p.evaluate(()=>snapshot()===changed),true);assert.equal(await cancel.evaluate(e=>e===document.activeElement),true);
 for(const dismiss of ['Escape','close','backdrop']){
  await cancel.click();if(dismiss==='Escape')await p.keyboard.press('Escape');else if(dismiss==='close')await p.getByRole('button',{name:'Keep editing and close'}).click();else await p.mouse.click(2,2);
  assert.equal(await dialog.isVisible(),false);assert.equal(await p.evaluate(()=>snapshot()===changed),true);
 }
 await cancel.click();await discard.focus();await p.keyboard.press('Tab');assert.equal(await p.locator('#discardEditClose').evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Shift+Tab');assert.equal(await discard.evaluate(e=>e===document.activeElement),true);
 await p.evaluate(()=>els.cancelChangeBtn.click());assert.equal(await keep.evaluate(e=>e===document.activeElement),true);assert.equal(await p.locator('dialog[open]').count(),1);
 const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.width<=(mobile?320:2048));assert.ok(bounds.y>=0&&bounds.y+bounds.height<=(mobile?740:1221));
 if(process.env.CANCEL_LAYOUT_ARTIFACT_DIR)await p.screenshot({path:`${process.env.CANCEL_LAYOUT_ARTIFACT_DIR}/discard-${mobile?'mobile':'desktop'}.png`});
 await discard.click();assert.equal(await dialog.isVisible(),false);assert.equal(await p.evaluate(()=>snapshot()===before),true);assert.equal(await p.locator('#nameOverlay').isVisible(),false);
 await p.evaluate(()=>els.discardEditConfirm.click());assert.equal(await p.evaluate(()=>snapshot()===before),true);
});
for(const change of ['geometry','metadata','memory','storage','editor','save','complete'])test(`stale discard confirmation cannot overwrite ${change}`,async t=>{
 const p=await setup(t);await p.evaluate(()=>{beginExtend();addPoint();});await p.locator('#cancelChangeBtn').click();
 await p.evaluate(change=>{
  if(change==='geometry')addPoint();
  if(change==='metadata')state.current.note='Later edit';
  if(change==='memory')state.library[0].note='Concurrent library update';
  if(change==='storage')localStorage.setItem('switchback_local_tracks_v1',JSON.stringify([{...state.library[0],note:'Other tab'}]));
  if(change==='editor')state.current={...state.current,note:'Replacement editor'};
  if(change==='save')els.saveBtn.click();
  if(change==='complete')els.completeChangeBtn.click();
  window.later=snapshot();
 },change);
 if(change==='save'||change==='complete')assert.equal(await p.locator('#discardEditDialog').isVisible(),false);
 await p.evaluate(()=>els.discardEditConfirm.click());assert.equal(await p.evaluate(()=>snapshot()===later),true);assert.equal(await p.locator('#discardEditDialog').isVisible(),false);
});
test('stale dialog cannot retarget another session; naming dialog and rejected navigation remain intact',async t=>{
 const p=await setup(t);await p.evaluate(()=>{beginExtend();addPoint();});await p.locator('#cancelChangeBtn').click();
 await p.evaluate(()=>{els.saveBtn.click();beginExtend();addPoint();window.later=snapshot();els.discardEditConfirm.click();});assert.equal(await p.evaluate(()=>snapshot()===later),true);
 await p.locator('#cancelChangeBtn').click();await p.evaluate(()=>{loadItem('synthetic-track');startNewRoute();});assert.equal(await p.evaluate(()=>snapshot()===later),true);await p.locator('#discardEditKeep').click();
 await p.evaluate(()=>{cancelEditForTest();startNewRoute();addPoint();els.completeChangeBtn.click();});
 assert.equal(await p.locator('#nameOverlay').isVisible(),true);await p.evaluate(()=>els.cancelChangeBtn.click());assert.equal(await p.locator('#discardEditDialog').isVisible(),false);assert.equal(await p.locator('#nameOverlay').isVisible(),true);
});
test('Join To Point without an edit session retains its no-write Cancel exit',async t=>{
 const p=await setup(t);await p.evaluate(()=>{selectPoint(0,99);window.before=snapshot();els.joinToPointBtn.click();});
 assert.equal(await p.evaluate(()=>state.mode),'joinpoint');assert.equal(await p.locator('#completeChangeBtn').isDisabled(),true);assert.equal(await p.locator('#cancelChangeBtn').isVisible(),true);
 await p.locator('#cancelChangeBtn').click();assert.equal(await p.evaluate(()=>state.mode==='view'&&state.joinFrom===null&&snapshot()===before),true);assert.equal(await p.locator('#discardEditDialog').isVisible(),false);
});
for(const action of ['completeChangeBtn','saveBtn'])test(`new-route ${action} invalidates discard before opening naming`,async t=>{
 const p=await setup(t);await p.evaluate(()=>{startNewRoute();addPoint();});await p.locator('#cancelChangeBtn').click();
 await p.evaluate(action=>{els[action].click();window.later=snapshot();els.discardEditConfirm.click();},action);
 assert.equal(await p.locator('#discardEditDialog').isVisible(),false);assert.equal(await p.locator('#nameOverlay').isVisible(),true);assert.equal(await p.evaluate(()=>snapshot()===later),true);assert.equal(await p.locator('#nameInput').evaluate(e=>e===document.activeElement),true);
});
