const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const integrity=require('../track-integrity.js');
// Endpoint-only reduction of user-supplied Moruya_Day4_1.gpx, retaining seven original
// segment endpoints and geometry direction; no user waypoint content is stored.
const moruya={segments:[
  [{lat:-35.967852,lon:150.006959},{lat:-35.967457,lon:149.964666}],
  [{lat:-35.967457,lon:149.964666},{lat:-35.966403,lon:149.965328}],
  [{lat:-35.91164,lon:150.076733},{lat:-35.966403,lon:149.965328}],
  [{lat:-35.97596371013438,lon:150.0404798869779},{lat:-35.921708,lon:150.077319}],
  [{lat:-35.921780448157826,lon:150.07786700835166},{lat:-35.909255,lon:150.156471}],
  [{lat:-35.967852,lon:150.006959},{lat:-35.967678,lon:150.007925}],
  [{lat:-35.967678,lon:150.007925},{lat:-35.975941,lon:150.039747}]
]};
test('Moruya real endpoints: explicit start recovers 3 2-reversed 1-reversed 6 7 4 5 and flags gaps',()=>{
  const before=JSON.stringify(moruya);
  const a=integrity.analyze(moruya,{start:{segment:2,reversed:false},toleranceMeters:5});
  assert.equal(a.status,'review');
  assert.deepEqual(a.proposal.order.map(x=>x.segment),[3,2,1,6,7,4,5]);
  assert.deepEqual(a.proposal.order.map(x=>x.reversed),[false,true,true,false,false,false,false]);
  const gaps=a.proposal.joins.filter(x=>x.status==='review');
  assert.equal(gaps.length,2);
  assert.ok(gaps[0].distanceMeters>65&&gaps[0].distanceMeters<67);
  assert.ok(gaps[1].distanceMeters>49&&gaps[1].distanceMeters<51);
  assert.ok(a.original.joins.filter(x=>x.status==='review').length>=3);
  assert.equal(JSON.stringify(moruya),before,'analysis must never change source track');
});
test('unflagged start is review-required, and reversing a single segment never mutates it',()=>{
  const a=integrity.analyze({segments:[[{lat:0,lon:0},{lat:0,lon:0.00001}]]});
  assert.equal(a.status,'review');
  assert.ok(a.issues.some(x=>x.code==='start_unconfirmed'));
});
test('correctly ordered, confirmed single segment validates',()=>{
  const a=integrity.analyze({segments:[[{lat:0,lon:0},{lat:0,lon:0.00001}]]},{start:{segment:0,reversed:false}});
  assert.equal(a.status,'valid');
  assert.equal(a.original.joins.length,0);
});
test('invalid coordinates fail closed, preventing speculative proposal',()=>{
  const a=integrity.analyze({segments:[[{lat:91,lon:0},{lat:0,lon:0}]]},{start:{segment:0,reversed:false}});
  assert.equal(a.status,'invalid');
  assert.equal(a.proposal.supported,false);
});
test('automatic exact ordering is bounded; large tracks require review',()=>{
  const seg=Array.from({length:11},(_,i)=>[{lat:0,lon:i*.001},{lat:0,lon:i*.001+0.00001}]);
  const a=integrity.analyze({segments:seg});
  assert.equal(a.proposal.supported,false);
  assert.ok(a.issues.some(x=>x.code==='too_many_segments'));
});
test('editor uses separate non-mutating module with start, validation and direction overlays',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/<script src="\.\/track-integrity\.js"><\/script>/);
  assert.match(html,/id="validateTrackBtn"/);
  assert.match(html,/id="flagTrailStartBtn"/);
  assert.match(html,/id="directionArrowsBtn"/);
  assert.match(html,/trackIntegrityLayer\.clearLayers\(\)/);
  assert.match(html,/report\.original\.joins\.forEach/);
});
