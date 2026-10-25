import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createCareer,manuallyAge,overall,startNextSeason,setTraining,stayAtClub,advanceCareer} from './engine';
import {executeCommand} from './commands';
import {cupLedger,cupMatches,cupStats,processClubCompetitions,initializeClubCompetitions,europeanEntries} from './club-competitions';
import {DOMESTIC_CUPS} from './cup-rules';
import {beginGrowthSeason} from './growth';
import {buildCareerText,careerMatchLedger} from './career-text';
import {createNational,processDueNationalWindows,scheduledInternationalWindows,getNationalTotals,nationalSquadFor} from './national';
import {nationalAudit} from './national-audit';
import {exportCareer,importCareer,validateCareer} from './storage';
import {CLUBS} from './data';
import {sumStats} from './math';
import type {Career} from './types';
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const base=createCareer({name:'최종 통합 검증',nationality:'프랑스',age:22,height:180,weight:75,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'EN1_01',squad:'senior',difficulty:'realistic',seed:'final-cups-v26'});
function fresh(){return structuredClone(base);}
function ace(country='프랑스',seed='national-expanded-0'){
 const c=fresh();c.seed=seed;c.player.nationality=country;c.player.ovr=97;c.managerTrust=95;for(const k of Object.keys(c.player.attributes))c.player.attributes[k as keyof typeof c.player.attributes]=97;
 c.season.leagueId='KR1';c.season.calendarYear=2026;c.season.week=0;c.season.index=1;c.createdAt='2026-01-01T00:00:00.000Z';
 // Pure national tests use retained source rosters, independently of a club-world season.
 c.systems!.world.players={};c.systems!.world.playerStats={};c.systems!.national=createNational(c);return c;
}
test('supported domestic cups and UEFA fields use separate valid rules, balanced opponents and no duplicate European entry',()=>{
 const c=fresh(),cups=cupLedger(c),all=new Set<string>();assert.equal(cups.length,25);assert.equal(DOMESTIC_CUPS.length,17);assert.ok(cups.every(t=>t.fixtures.every(f=>f.date&&Number.isFinite(Date.parse(f.date)))));
 for(const t of cups.filter(t=>/^(UCL|UEL|UECL):/.test(t.id))){
  assert.equal(t.entrants.length,36);for(const id of t.entrants){assert.ok(!all.has(id));all.add(id);const games=t.fixtures.filter(f=>f.homeId===id||f.awayId===id);assert.equal(games.length,t.leagueRounds);assert.equal(new Set(games.map(f=>f.homeId===id?f.awayId:f.homeId)).size,t.leagueRounds);assert.equal(games.filter(f=>f.homeId===id).length,t.leagueRounds/2);}
 }
 assert.ok(cups.filter(t=>t.kind==='leagueCup').every(t=>['영국','포르투갈','일본'].includes(t.country!)));
 assert.ok(cups.find(t=>t.id.startsWith('CUP:USOPEN:'))!.entrants.every(id=>!/토론토|밴쿠버|몬트리올/.test(CLUBS.find(club=>club.id===id)!.name)));
});
test('actual cup brackets finish once with byes, two legs, penalties, elimination and league-only records intact',async()=>{
 const c=advanceCareer(fresh(),120),before=JSON.stringify(c.season.playerStats);
 assert.ok(cupMatches(c).length>0);assert.equal(JSON.stringify(c.season.playerStats),before);assert.deepEqual(c.season.playerStats,sumStats(c.season.matches.map(m=>m.playerStats)));assert.deepEqual(cupStats(c),sumStats(cupMatches(c).map(m=>m.playerStats)));
 for(const t of cupLedger(c)){
  assert.equal(t.phase,'completed',t.name);assert.ok(t.fixtures.every(f=>f.played));assert.ok(t.fixtures.some(f=>f.stage==='결승'&&f.winnerId===t.winnerId));
  for(const id of t.entrants){let eliminated=-1;for(const f of t.fixtures.filter(f=>f.homeId===id||f.awayId===id).sort((a,b)=>a.step-b.step)){
   assert.ok(f.step>0);assert.ok(eliminated<0,`${id} played after elimination in ${t.id}`);if(f.winnerId&&f.winnerId!==id)eliminated=f.step;
  }}
  assert.equal(new Set(t.matches.map(m=>m.fixtureId)).size,t.matches.length);
 }
 assert.ok(cupLedger(c).some(t=>t.fixtures.some(f=>f.leg===2)));assert.ok(cupLedger(c).some(t=>t.fixtures.some(f=>f.shootout)));
 const snapshot=JSON.stringify(c.systems!.clubCompetitions);processClubCompetitions(c);assert.equal(JSON.stringify(c.systems!.clubCompetitions),snapshot);
 validateCareer(c);const loaded=await importCareer(await exportCareer(c));assert.deepEqual(loaded.systems!.clubCompetitions,JSON.parse(JSON.stringify(c.systems!.clubCompetitions)));
 const text=buildCareerText(c);assert.match(text,/FA컵/);assert.doesNotMatch(text,/전체 대진/);assert.match(text,/챔피언스리그/);assert.equal(careerMatchLedger(c).club.length,cupMatches(c).length+c.season.matches.length);
 const bad=structuredClone(c);bad.systems!.clubCompetitions!.current[0].winnerId='UNKNOWN';assert.throws(()=>validateCareer(bad),/우승/);
});
test('European qualification uses actual prior league positions, cup winners and rolls spare places without overlap',()=>{
 const c=fresh(),table=c.systems!.world.competitions.EN1.table;table.forEach((r,i)=>{r.played=38;r.points=100-i;});
 const winner=table[11].clubId,cup=cupLedger(c).find(t=>t.id.startsWith('CUP:FA:'))!;cup.winnerId=winner;
 const entries=europeanEntries(c);assert.ok(entries.UEL.includes(winner));assert.deepEqual(entries.UCL.filter(id=>table.some(r=>r.clubId===id)).slice(0,4),table.slice(0,4).map(r=>r.clubId));
 assert.equal(new Set([...entries.UCL,...entries.UEL,...entries.UECL]).size,108);
 c.season.year++;c.season.week=0;initializeClubCompetitions(c,entries);assert.ok(cupLedger(c,c.season.year).find(t=>t.id.startsWith('UEL:'))!.entrants.includes(winner));
});
test('legacy midseason saves do not receive invented past cup fixtures',()=>{
 const c=fresh();delete c.systems!.clubCompetitions;c.season.week=10;initializeClubCompetitions(c);assert.equal(cupLedger(c).length,0);
 c.season.year++;c.season.week=0;initializeClubCompetitions(c);assert.equal(cupLedger(c).length,25);
});
test('manual aging applies once, floors every attribute at zero, recalculates OVR and survives save/TXT',async()=>{
 for(const amount of [1,5,10] as const){const c=fresh(),before=JSON.stringify(c),changed=executeCommand(c,{type:'manualAging',amount,key:'shooting'},`manual-${amount}`);assert.equal(JSON.stringify(c),before);assert.equal(changed.player.age,c.player.age);assert.equal(changed.season.week,0);assert.equal(changed.player.ovr,overall(changed.player));for(const key of Object.keys(c.player.attributes) as (keyof typeof c.player.attributes)[])assert.equal(changed.player.attributes[key],(key==='shooting'?Math.max(0,c.player.attributes[key]!-amount):c.player.attributes[key]));assert.equal(executeCommand(changed,{type:'manualAging',amount,key:'shooting'},`manual-${amount}`),changed);validateCareer(changed);const loaded=await importCareer(await exportCareer(changed));assert.deepEqual(loaded.systems!.manualAging,changed.systems!.manualAging);assert.match(buildCareerText(changed),new RegExp(`능력점수: .*→ ${changed.player.ovr}`));assert.doesNotMatch(buildCareerText(changed).split('B. 통산')[0],/능력점수:/);assert.doesNotMatch(buildCareerText(changed),/수동 노화/);}
 let zero=fresh();for(let i=0;i<10;i++)zero=manuallyAge(zero,10,'shooting');assert.ok(zero.player.attributes.shooting===0);assert.equal(zero.player.ovr,overall(zero.player));validateCareer(zero);
 const invalid=structuredClone(zero);invalid.systems!.manualAging![0].after.shooting!++;assert.throws(()=>validateCareer(invalid),/노화/);
});
test('elite young players can reach seniors while ordinary youth remain U20',()=>{
 const c=ace();c.player.age=18;assert.equal(nationalSquadFor(c),'senior');c.player.ovr=60;assert.equal(nationalSquadFor(c),'U20');const unsupported=ace('모나코');processDueNationalWindows(unsupported,'2026-12-31');assert.equal(unsupported.systems!.national.matches.length,0);assert.match(unsupported.systems!.national.reason,/지원 목록/);
});
test('expanded annual windows distinguish actual caps, starts, bench and exclusion and replay incrementally',()=>{
 const c=ace(),replay=structuredClone(c);assert.equal(scheduledInternationalWindows(c).filter(w=>w.year===2026).length,5);
 processDueNationalWindows(c,'2026-12-31');for(const date of ['2026-03-20','2026-03-28','2026-06-08','2026-06-22','2026-07-19','2026-09-28','2026-10-28','2026-11-28','2026-12-31'])processDueNationalWindows(replay,date);
 assert.deepEqual(c.systems!.national,replay.systems!.national);assert.deepEqual(c.player,replay.player);
 const row=nationalAudit(c).find(r=>r.year===2026&&r.squad==='senior')!;assert.ok(row.teamGames>=8,JSON.stringify(row));assert.equal(row.stats.apps,row.starts+row.sub);assert.equal(row.teamGames,row.starts+row.sub+row.bench+row.excluded);assert.equal(row.called,row.starts+row.sub+row.bench);assert.equal(getNationalTotals(c).apps,row.stats.apps);assert.equal(new Set(c.systems!.national.matches.map(m=>m.fixtureId)).size,c.systems!.national.matches.length);
 const before=JSON.stringify(c);processDueNationalWindows(c,'2026-12-31');assert.equal(JSON.stringify(c),before);
});
test('World Cup and continental finals have full group/knockout stages, qualification and country strength',t=>{
 const outputs=[];
 for(const country of ['프랑스','베트남'])for(let seed=0;seed<8;seed++){
  const c=ace(country,`expanded-distribution-${seed}`);processDueNationalWindows(c,'2026-07-19');const n=c.systems!.national,all=[...n.matches,...n.teamResults!];
  const draw=n.finalDraws!['senior|WC:2026'];assert.equal(draw.size,48);assert.equal(draw.groups.flat().length,48);assert.equal(all.filter(m=>m.competitionId==='WC:2026'&&m.fixtureId.includes('|group|')).length,72);assert.equal(all.filter(m=>m.fixtureId.includes('|final|')).length,1);assert.equal(all.filter(m=>m.competitionId==='WC:2026'&&!m.fixtureId.includes('|qualifying|')).length,104);
  const ownFinals=n.matches.filter(m=>m.competitionId==='WC:2026'&&!m.fixtureId.includes('|qualifying|'));if(!n.qualified)assert.equal(ownFinals.length,0);for(const m of n.matches)assert.ok(m.playerClubId.includes(country));
  const final=all.find(m=>m.fixtureId.includes('|final|'))!,winner=final.shootout?.winnerId??(final.homeGoals>final.awayGoals?final.homeId:final.awayId);outputs.push({country,seed,qualified:n.qualified,caps:getNationalTotals(c).apps,winner});
 }
 assert.ok(outputs.filter(r=>r.country==='베트남'&&r.winner.includes('베트남')).length<2,JSON.stringify(outputs));t.diagnostic(JSON.stringify(outputs));
 const euro=ace();euro.season.year=2028;euro.season.calendarYear=2028;euro.createdAt='2028-01-01T00:00:00.000Z';euro.systems!.national=createNational(euro);processDueNationalWindows(euro,'2028-07-19');assert.equal(euro.systems!.national.finalDraws!['senior|UEFA:2028'].size,24);
});
test('national reserve and injured players gain no phantom appearances',()=>{
 const weak=ace();weak.player.ovr=25;weak.player.attributes=Object.fromEntries(Object.keys(weak.player.attributes).map(k=>[k,25]));weak.player.form=30;processDueNationalWindows(weak,'2026-12-31');assert.equal(getNationalTotals(weak).apps,0);assert.ok(nationalAudit(weak)[0].excluded>=8);
 const injured=ace();injured.player.injuryWeeks=5;processDueNationalWindows(injured,'2026-07-19');assert.equal(getNationalTotals(injured).apps,0);assert.ok(injured.systems!.national.matches.every(m=>m.nationalSelection?.role==='excluded'));
});
