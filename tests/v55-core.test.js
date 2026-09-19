const assert=require('assert');
const core=require('../v55-core.js');

function base(){
  return {
    stage:'turnend',careerState:'ACTIVE_CLUB',club:'Arsenal',clubId:'EN1_01',
    age:20,seasonYear:2024,seasonLabel:'2024/25',seed:123,developmentPoints:17,
    fitness:82,injury:{games:2},eventChoice:'x',lastResult:{x:1},
    phaseCompleted:{transfer:true},playstyleExpPool:14,lastStyleExpAward:14,
    v3GrowthPlan:{selected:['슈팅'],applied:true,result:{}},worldState:{npcYear:2024},
    careerStats:{income:10},wealth:2,transfers:[],contract:{end:2027},wage:1000,
    marketValue:20,pendingTransfer:null,pendingRelease:false
  };
}
function club(name){return name==='Real Madrid'?{canonicalId:'ES1_01',id:'ES1_01'}:{canonicalId:'EN1_01',id:'EN1_01'}}

{
  const g=base();
  const r=core.advanceTurn(g,{lookupClub:club});
  assert.equal(r.ok,true);assert.equal(g.seasonYear,2025);assert.equal(g.age,21);
  assert.equal(g.stage,'season');assert.equal(g.club,'Arsenal');assert.equal(g.developmentPoints,17);
  assert.equal(g.lastResult,null);assert.equal(g.fitness,100);
  const again=core.advanceTurn(g,{lookupClub:club});assert.equal(again.ok,false);assert.equal(g.seasonYear,2025);
}
{
  const g=base();g.stage='transfer';
  const ok=core.acceptOfferState(g,{type:'transfer',club:'Real Madrid',years:4,role:'주전',wage:5000,fee:60});
  assert.equal(ok,true);assert.equal(g.stage,'turnend');assert.equal(g.club,'Arsenal');
  const r=core.advanceTurn(g,{lookupClub:club});
  assert.equal(r.ok,true);assert.equal(g.club,'Real Madrid');assert.equal(g.clubId,'ES1_01');
  assert.equal(g.seasonYear,2025);assert.equal(g.contract.start,2025);assert.equal(g.contract.end,2029);
  assert.equal(g.transfers.length,1);assert.equal(g.transfers[0].from,'Arsenal');assert.equal(g.transfers[0].to,'Real Madrid');
  assert.equal(g.pendingTransfer,null);
}
{
  const g=base();g.stage='transfer';
  core.acceptOfferState(g,{type:'renew',club:'Arsenal',years:3,role:'주전',wage:1500,fee:0});
  core.advanceTurn(g,{lookupClub:club});
  assert.equal(g.club,'Arsenal');assert.equal(g.transfers.length,0);assert.equal(g.contract.end,2028);
}
{
  const g=base();g.stage='transfer';g.contract={end:2025};
  assert.equal(core.stayState(g),true);assert.equal(g.pendingRelease,true);assert.equal(g.stage,'turnend');
  core.advanceTurn(g,{lookupClub:club});
  assert.equal(g.club,null);assert.equal(g.stage,'development');assert.equal(g.careerState,'FREE_AGENT');
  assert.ok(g.developmentPoints>=20);
}
{
  const g=base();g.stage='transfer';g.contract={end:2027};
  core.stayState(g);core.advanceTurn(g,{lookupClub:club});
  assert.equal(g.club,'Arsenal');assert.equal(g.stage,'season');assert.equal(g.careerState,'ACTIVE_CLUB');
}
{
  const g=base();g.stage='season';
  const r=core.advanceTurn(g,{lookupClub:club});
  assert.equal(r.ok,false);assert.equal(g.seasonYear,2024);
}
console.log('V5.5 core tests passed');