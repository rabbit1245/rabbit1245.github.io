import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {webcrypto} from 'node:crypto';
import {CLUBS,ROSTERS,ROSTER_CALIBRATION} from './data';
import {advanceCareer,createCareer} from './engine';
import {initializeSystems} from './systems';
import {getClubWorldPower,getWorldClubPlayers} from './world';
import {exportCareer,validateCareer} from './storage';
import type {SaveEnvelope} from './types';
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const original=JSON.parse(gunzipSync(readFileSync(new URL('../../tests/fixtures/v2-career.json.gz',import.meta.url))).toString()) as SaveEnvelope;
const fresh=()=>createCareer({name:'전력 검수',nationality:'대한민국',age:20,height:180,weight:75,foot:'right',position:'ST',talent:'A',style:'포처',clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'roster-scale-regression'});

test('German and Spanish squads use source players, not elite substitutes from league strength',()=>{
 const c=fresh();
 for(const club of CLUBS.filter(row=>['DE1','ES1','EN1','FR1','IT1'].includes(row.leagueId))){
  assert.ok(ROSTERS[club.id].filter(p=>p.id.startsWith('fc25_')).length>=18,club.id);
 }
 assert.ok(ROSTERS.DE1_09.some(p=>/Ducksch/.test(p.name)));
 assert.ok(ROSTERS.DE1_09.some(p=>/Weiser/.test(p.name)));
 assert.ok(getClubWorldPower(c,'DE1_09')<78);
 assert.ok(getClubWorldPower(c,'DE1_02')>getClubWorldPower(c,'DE1_09')+7);
 for(const id of ['ES1_13','ES1_15','ES1_18'])assert.ok(getClubWorldPower(c,'ES1_02')>getClubWorldPower(c,id)+4);
 assert.equal(c.systems!.world.rosterVersion,ROSTER_CALIBRATION.version);
});
test('every retained real OVR equals its source; generated depth stays below an empirical league scale',()=>{
 const source=JSON.parse(readFileSync(new URL('../../data/players.min.json',import.meta.url),'utf8')).players;
 const byId=new Map<string,any>(source.map((p:any)=>[p.id,p]));
 for(const club of CLUBS){
  for(const p of ROSTERS[club.id]){
   if(p.id.startsWith('fc25_'))assert.equal(p.ovr,byId.get(p.id).ovr,p.id);
   else assert.ok(p.ovr<=88,p.id);
  }
 }
 const c=fresh();
 for(const club of CLUBS.filter(row=>ROSTERS[row.id].every(p=>p.id.startsWith('sim_'))))
  assert.ok(getClubWorldPower(c,club.id)<84,club.id);
});
test('published old hash stays unchanged on validation/export; first command corrects future NPC strength on a copy',async()=>{
 const old=structuredClone(original.career),serialized=JSON.stringify(old);
 const exported=JSON.parse(await exportCareer(validateCareer(old)));
 assert.equal(exported.hash,original.hash);
 assert.equal(JSON.stringify(old),serialized);
 assert.equal(old.systems!.world.rosterVersion,undefined);
 const next=advanceCareer(old,1);
 assert.equal(next.systems!.world.rosterVersion,ROSTER_CALIBRATION.version);
 assert.equal(JSON.stringify(old),serialized,'command leaves the loaded old revision intact');
 assert.ok(getClubWorldPower(next,'DE1_09')<getClubWorldPower(old,'DE1_09')-10);
 validateCareer(next);
});
test('club-level repair keeps every NPC, personal profile and played record intact; it is idempotent',()=>{
 const c=structuredClone(original.career),w=c.systems!.world;
 // A replacement generation must not inherit the old faulty starting scale forever.
 for(const [prefix,serial] of [['regen','2040_0'],['success','2040']] as const){
  const p=structuredClone(w.players[w.clubs.DE1_09.rosterIds[0]]),id=`${prefix}_DE1_09_${serial}`;
  p.id=id;p.ovr=94;p.potential=98;p.age=24;w.players[id]=p;w.clubs.DE1_09.rosterIds.push(id);
 }
 const before=structuredClone(c);
 initializeSystems(c);
 for(const key of ['player','season','history','awards','transfers'] as const)assert.deepEqual(c[key],before[key],key);
 for(const key of ['national','economics','leadership','growthReports','rankings'] as const)assert.deepEqual(c.systems![key],before.systems![key],key);
 assert.deepEqual(w.competitions,before.systems!.world.competitions);
 assert.deepEqual(w.playerStats,before.systems!.world.playerStats);
 assert.deepEqual(w.movements,before.systems!.world.movements);
 assert.deepEqual(w.players,before.systems!.world.players,'team correction never rewrites individual NPC ratings');
 assert.ok(getClubWorldPower(c,'DE1_09')<78,'even inherited 94 OVR recruits cannot override the club baseline');
 assert.equal(c.systems!.events.filter(e=>e.id==='roster-calibration-2').length,1);
 const repaired=JSON.stringify(c);initializeSystems(c);assert.equal(JSON.stringify(c),repaired);
 validateCareer(c);
 const invalid=structuredClone(c);invalid.systems!.world.rosterVersion=0;assert.throws(()=>validateCareer(invalid),/선수단 자료 버전/);
});
test('club base power survives inflated replacement generations while the user keeps intrinsic ability',()=>{
 const c=fresh(),w=c.systems!.world,id='ES1_18',before=getClubWorldPower(c,id);
 for(const pid of w.clubs[id].rosterIds){w.players[pid].ovr=99;w.players[pid].potential=99;}
 assert.equal(getClubWorldPower(c,id),before);
 assert.ok(getWorldClubPlayers(c,id).every(p=>p.ovr<80),'matches must use the same bounded club scale');
 assert.ok(getClubWorldPower(c,'ES1_01')>before+8);
 w.clubs[id].development!.prestige=99;
 assert.ok(getClubWorldPower(c,id)-before<=3.01,'cumulative success has a bounded team effect');
});
