import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalBytes} from './canonical-bytes';
import {PLAY_STYLES} from './attributes';
import {createCareer,releaseContract,advanceHalf,startNextSeason,acceptTransfer,overall,refreshContractOffers} from './engine';
import {makeContractOffers,needsContractOfferRefresh} from './career-systems';
import {executeCommand} from './commands';
import {beginGrowthSeason} from './growth';
import {processNationalWindow,archiveNationalSeason} from './national';
import {emptyStats} from './math';
import {validateCareer,saveCareer,saveCareerChange,loadCareer,exportCareer,verifySaveText,importCareer,deleteSlot} from './storage';
import {commandChange} from './command-patches';
import type {Career} from './types';

let fixtureSerial=0;
function fresh(age=35){
 const c=createCareer({name:'FA 국대 저장',nationality:'대한민국',age:Math.min(35,age),height:180,weight:75,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId:'EN1_01',squad:'senior',difficulty:'realistic',seed:'fa-contract-292',training:[]});c.player.age=age;c.id+=`:fixture:${fixtureSerial++}`;
 for(const key of Object.keys(c.player.attributes) as (keyof typeof c.player.attributes)[])c.player.attributes[key]=94;
 c.player.ovr=overall(c.player);c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;c.managerTrust=95;beginGrowthSeason(c);
 return c;
}
const hash=(c:Career)=>createHash('sha256').update(canonicalBytes(c)).digest('hex');
let expired:Career|undefined;
const expiry=()=>expired??=advanceHalf(advanceHalf(finalYear(fresh())));
function finalYear(c:Career){
 c.player.contractYears=1;const e=c.systems!.economics;e.contract.expiresYear=c.season.year+1;delete e.contract.expiresDate;
 const t=e.contractHistory!.at(-1)!.current;t.expiresYear=c.season.year+1;t.years=1;delete t.expiresDate;
 validateCareer(c);return c;
}

test('FA international performers survive archival, autosave, reload and JSON without relaxing team validation',async()=>{
 let c=releaseContract(fresh());processNationalWindow(c,'first');archiveNationalSeason(c);
 const games=c.systems!.national.history.flatMap(h=>h.matches),appearance=games.find(m=>m.performers?.some(p=>p.id===c.player.id&&p.clubId==='FA'));
 assert.ok(appearance,'exercise an actual national match with a free-agent performer');
 validateCareer(c);
 const archivedOnly=structuredClone(c);archivedOnly.systems!.national.matches=[];validateCareer(archivedOnly);
 await saveCareer(c);assert.equal(hash((await loadCareer(c.id))!),hash(c));
 const text=await exportCareer(c);assert.equal(hash(await verifySaveText(text)),hash(c));
 const imported=await importCareer(text);assert.equal(hash({...imported,id:c.id}),hash(c));
 const bad=structuredClone(c);bad.systems!.national.history.flatMap(h=>h.matches).find(m=>m.fixtureId===appearance.fixtureId)!.performers!.find(p=>p.id===c.player.id)!.clubId='missing-club.svg';
 assert.throws(()=>validateCareer(bad),/performer.clubId/);
 const badTeam=structuredClone(c);badTeam.systems!.national.history[0].matches[0].homeId='FA';assert.throws(()=>validateCareer(badTeam));
 const signed=acceptTransfer(c,c.offers[0].id);assert.notEqual(signed.player.clubId,'FA');validateCareer(signed);
 assert.ok(signed.systems!.national.history.flatMap(h=>h.matches).some(m=>m.performers?.some(p=>p.id===signed.player.id&&p.clubId==='FA')));
 assert.equal(hash(await verifySaveText(await exportCareer(signed))),hash(signed));
 if(process.env.KBALL_FA_FIXTURE_DIR){await mkdir(process.env.KBALL_FA_FIXTURE_DIR,{recursive:true});await writeFile(`${process.env.KBALL_FA_FIXTURE_DIR}/fa-national.json`,text);}
 await deleteSlot(c.id);await deleteSlot(imported.id);
});

test('actual ability loss and poor form still permit short contracts; voluntary FA does not create a guaranteed renewal',()=>{
 const c=fresh(37);c.player.ovr-=12;c.stage='offseason';c.season.playerStats={...emptyStats(),apps:20,minutes:900,ratingCount:20,ratingSum:20*6.1};
 assert.ok(makeContractOffers(c,'offseason').every(o=>o.years===1));
 const released=releaseContract(fresh());assert.equal(released.offers.length,6);assert.ok(!released.offers.some(o=>o.reason.includes('계약 만료 구단의 재계약')));
});

test('opening legacy proposals refreshes duration once without touching archived records or altering signed contracts',async()=>{
 const completed=expiry(),c={...completed,offers:completed.offers.filter(o=>o.clubId!=='EN1_01').map(o=>({...o,id:o.id.replace('offseason-v292','offseason'),years:1}))};
 assert.ok(needsContractOfferRefresh(c));const before=JSON.stringify(c),next=executeCommand(c,{type:'refreshOffers'},'refresh-292');
 assert.equal(JSON.stringify(c),before);assert.equal(next.revision,c.revision+1);assert.equal(needsContractOfferRefresh(next),false);
 assert.equal(c.offers.length,6);assert.equal(next.offers.length,7);
 assert.deepEqual(next.history,c.history);assert.deepEqual(next.systems!.economics,c.systems!.economics);assert.deepEqual(makeContractOffers(next,'offseason'),next.offers);validateCareer(next);
 await saveCareer(c);assert.ok(commandChange(c,next));await saveCareerChange(c,next);assert.equal(hash((await loadCareer(c.id))!),hash(next));await deleteSlot(c.id);
 if(process.env.KBALL_FA_FIXTURE_DIR){await mkdir(process.env.KBALL_FA_FIXTURE_DIR,{recursive:true});await writeFile(`${process.env.KBALL_FA_FIXTURE_DIR}/legacy-expired-veteran.json`,await exportCareer(c));}
 const signed=acceptTransfer(next,next.offers.find(o=>o.clubId==='EN1_01')!.id);assert.equal(needsContractOfferRefresh(signed),false);assert.throws(()=>refreshContractOffers(signed));
});

test('veterans who retain first-team ability and performance receive multi-year offers',()=>{
 for(const age of [32,35,38,42]){
  const c=fresh(age);c.stage='offseason';c.season.playerStats={...emptyStats(),apps:32,starts:30,minutes:2700,goals:23,assists:12,ratingCount:32,ratingSum:32*7.7};
  const offers=makeContractOffers(c,'offseason'),renewal=offers.find(o=>o.type==='renew');assert.ok(renewal);
  assert.ok(renewal.years>=2,`${age}: retained elite player offered only ${renewal.years} year`);
  assert.ok(offers.filter(o=>['핵심 선수','주전'].includes(o.role)).every(o=>o.years>=2));
 }
});

test('expiry keeps natural FA status and offers the former club as a selectable return, not forced renewal',async()=>{
 let c=expiry();assert.equal(c.player.clubId,'FA');assert.equal(c.player.wage,0);
 const returnOffer=c.offers.find(o=>o.clubId==='EN1_01');assert.ok(returnOffer,'former club renewal must not disappear on expiry');assert.ok(returnOffer.years>=2);assert.equal(returnOffer.fee,0);validateCareer(c);
 const skipped=startNextSeason(c);assert.equal(skipped.player.clubId,'FA');assert.equal(skipped.player.wage,0);validateCareer(skipped);
 const returned=acceptTransfer(c,returnOffer.id);assert.equal(returned.player.clubId,'EN1_01');assert.ok(returned.systems!.world.clubs.EN1_01.rosterIds.includes(returned.player.id));validateCareer(returned);
 let continued=startNextSeason(returned);assert.equal(continued.player.clubId,'EN1_01');continued=advanceHalf(continued);assert.ok(continued.season.playerStats.apps>0);validateCareer(continued);
 assert.equal(hash(await verifySaveText(await exportCareer(continued))),hash(continued));
 const bad=structuredClone(continued);bad.season.matches.find(m=>m.performers?.length)!.performers![0].clubId='FA';assert.throws(()=>validateCareer(bad));
 continued=advanceHalf(continued);assert.equal(continued.player.clubId,'EN1_01');assert.equal(continued.player.contractYears,returnOffer.years-1);validateCareer(continued);
 if(process.env.KBALL_FA_FIXTURE_DIR){await writeFile(`${process.env.KBALL_FA_FIXTURE_DIR}/expired-veteran.json`,await exportCareer(c));}
});
