import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,overall} from './engine';
import {FIELD_ATTRIBUTES} from './attributes';
import {contractRole,ensureEconomicMarket,updateMarketValue,marketEstimate,makeContractOffers} from './career-systems';
import {assessmentNow} from './market-value';
import {shareShotSupply} from './ability-contests';
import {emptyStats} from './math';
import {jsonBlob} from './json-blob';
import {utf8Size} from './save-limits';
import {prepareEnvelope} from './storage';
import {packEnvelope,decodeStored} from './save-codec';
import type {Career,SeasonSummary} from './types';

function fresh(){const c=createCareer({name:'위상 연결 검수',nationality:'프랑스',age:21,height:181,weight:76,foot:'left',position:'RW',talent:'SS',style:'인사이드 포워드',clubId:'ES1_01',squad:'senior',difficulty:'realistic',seed:'career-coherence-2111',training:[]});for(const k of FIELD_ATTRIBUTES)c.player.attributes[k]=80;c.player.ovr=overall(c.player);c.player.potential=95;c.season.ovrStart=80;c.season.attributeStart={...c.player.attributes};c.systems!.economics.marketValue=133333000;c.systems!.economics.peakValue=133333000;c.systems!.economics.assessment=assessmentNow(c);return c;}
function season(c:Career,goals=30,assists=10){c.season.week=c.season.totalWeeks;c.season.completed=true;c.stage='offseason';c.season.playerStats={...emptyStats(),apps:36,starts:34,minutes:3000,goals,assists,ratingCount:36,ratingSum:36*7.6};}
function archive(c:Career){c.history.push({year:c.season.year,age:c.player.age,clubId:c.player.clubId,clubName:'레알 마드리드',leagueId:c.season.leagueId,competitionName:'라리가',position:c.player.position,squad:'senior',rank:1,ovrStart:80,ovrEnd:80,stats:{...c.season.playerStats},matches:Array.from({length:38},()=>({})) as SeasonSummary['matches'],awards:[],attributeGrowth:{},income:0,completed:true});}

test('a proven 80-rated incumbent with 30 league goals is offered a first-team role, while an unproven peer still competes',()=>{
 const c=fresh(),plain=contractRole(c,c.player.clubId);assert.ok(['로테이션','유망주','주전'].includes(plain));season(c);assert.ok(['핵심 선수','주전'].includes(contractRole(c,c.player.clubId)));updateMarketValue(c,'실제 시즌 평가');const offers=makeContractOffers(c,'offseason'),renewal=offers.find(o=>o.type==='renew')!;assert.ok(['핵심 선수','주전'].includes(renewal.role));assert.ok(!renewal.reason.includes('즉시 주전 보장 없는'));assert.equal(c.player.ovr,80);
});
test('a Ballon d’Or top-ten season reinforces the incumbent role without changing ability or award outcomes',()=>{
 const c=fresh();season(c,20,8);c.systems!.rankings.push({year:c.season.year,playerRank:8,candidates:[],world11:[],winnerId:'fixture-winner',awards:[]});const prior=structuredClone(c.awards),ability=c.player.ovr;assert.equal(contractRole(c,c.player.clubId),'핵심 선수');assert.ok(marketEstimate(c)>marketEstimate({...c,systems:{...c.systems!,rankings:[]}}));assert.deepEqual(c.awards,prior);assert.equal(c.player.ovr,ability);
});
test('lower-division production alone does not give the same proven top-flight role',()=>{
 const c=fresh();season(c);c.season.leagueId='IT3__B';assert.notEqual(contractRole(c,'ES1_01'),'핵심 선수');
});
test('a young 30→20 goal season retains a market reputation instead of losing half its value',()=>{
 const c=fresh();season(c);updateMarketValue(c,'30골');archive(c);const before=c.systems!.economics.marketValue;c.season.year++;c.player.age++;c.season.week=0;c.season.completed=false;c.season.playerStats=emptyStats();c.stage='season';updateMarketValue(c,'새 시즌');assert.equal(c.systems!.economics.marketValue,before);
 season(c,20,10);updateMarketValue(c,'20골');const after=c.systems!.economics.marketValue;assert.ok(after>=before*.88,`${before} → ${after}`);assert.equal(c.player.ovr,80);
});
test('manual ability changes and birthdays before new matches do not immediately mark down the market quote',()=>{
 const c=fresh(),e=c.systems!.economics,initial=e.marketValue;c.player.age++;c.player.attributes.speed=70;c.player.ovr=overall(c.player);updateMarketValue(c,'수동 능력 변화');assert.equal(e.marketValue,initial);for(let i=0;i<10;i++)updateMarketValue(c,'같은 시점 재평가');assert.equal(e.marketValue,initial);
});
test('deferred manual decline keeps the old ability reference until actual new games support a revaluation',()=>{
 const c=fresh(),e=c.systems!.economics,initial=e.marketValue;
 for(const k of FIELD_ATTRIBUTES)c.player.attributes[k]=60;c.player.ovr=overall(c.player);updateMarketValue(c,'경기 없는 수동 노화');assert.equal(e.marketValue,initial);assert.equal(e.assessment!.ability,80);
 const retained=fresh();for(const x of [c,retained]){x.season.week=19;x.season.playerStats={...emptyStats(),apps:15,starts:10,minutes:1000,goals:2,assists:1,ratingCount:15,ratingSum:15*6.4};updateMarketValue(x,'실제 다음 반시즌');}
 assert.ok(e.marketValue<retained.systems!.economics.marketValue,'actual decline is distinguished from retained skill after new appearances');assert.equal(e.assessment!.ability,60);
});
test('repeated poor periods can reduce value, and repeated clicks cannot compound the same decline',()=>{
 const c=fresh(),e=c.systems!.economics,initial=e.marketValue;c.season.week=19;updateMarketValue(c,'반시즌 미출전');const first=e.marketValue;assert.ok(first<initial&&first>=initial*.88);updateMarketValue(c,'같은 반시즌');assert.equal(e.marketValue,first);c.season.week=38;updateMarketValue(c,'한시즌 미출전');assert.ok(e.marketValue<first);
});
test('existing quoted values, signed contracts and archived records survive the one-time market migration',()=>{
 const c=fresh();season(c);archive(c);const e=c.systems!.economics,old=structuredClone({value:e.marketValue,contract:e.contract,history:c.history,valueHistory:e.valueHistory});delete e.assessment;e.valuationVersion=1;ensureEconomicMarket(c);assert.equal(e.marketValue,old.value);assert.deepEqual(e.contract,old.contract);assert.deepEqual(c.history,old.history);assert.deepEqual(e.valueHistory,old.valueHistory);const once=structuredClone(e);ensureEconomicMarket(c);assert.deepEqual(e,once);
});
test('shot sharing conserves the original team supply and distinguishes real finishing attributes',()=>{
 const rows=[{opportunities:3,quality:80},{opportunities:3,quality:95},{opportunities:1,quality:70,contest:false}],shared=shareShotSupply(rows,95);assert.ok(Math.abs(shared.reduce((a,b)=>a+b,0)-7)<1e-10);assert.ok(shared[0]<3&&shared[1]>3);assert.equal(shared[2],1,'defensive set-piece opportunities are preserved');assert.deepEqual(shareShotSupply(rows,60),rows.map(r=>r.opportunities));assert.deepEqual(shareShotSupply([{opportunities:2,quality:80},{opportunities:4,quality:80}],95),[2,4]);
 const high=shareShotSupply([{opportunities:3,quality:105},{opportunities:3,quality:95}],95);assert.ok(high[0]>3,'100+ actual traits still have an advantage');
});
test('chunked export is byte-equivalent JSON, including Korean text and undefined object fields',async()=>{
 const data={문자:'축구⚽😀',undefined:undefined,list:[1,undefined,null,{b:2,a:'x'}],long:'한글'.repeat(50000)};const blob=jsonBlob(data);assert.equal(await blob.text(),JSON.stringify(data));for(const s of ['hello','한글','😀','\ud800','한😀x'.repeat(20000)])assert.equal(utf8Size(s),new TextEncoder().encode(s).length);
});
test('compressed snapshots retain full validation and reject damaged streams or misleading expanded sizes',async()=>{
 const c=createCareer({name:'압축 저장 검사',nationality:'대한민국',age:22,height:180,weight:75,foot:'right',position:'ST',talent:'A',style:'포처',clubId:'KR2_01',squad:'senior',difficulty:'realistic',seed:'gzip-integrity',training:[]});
 const prepared=packEnvelope(await prepareEnvelope(c)),record=prepared.record,rawBytes=record.blob.size,blob=await new Response(record.blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
 const compressed={...record,blob,encoding:'gzip' as const,rawBytes};assert.ok(blob.size<rawBytes*.25);assert.deepEqual((await decodeStored(compressed)).career,JSON.parse(JSON.stringify(c)));
 await assert.rejects(()=>decodeStored({...compressed,rawBytes:rawBytes+1}),/읽을 수 없습니다/);
 const bytes=new Uint8Array(await blob.arrayBuffer());bytes[Math.floor(bytes.length/2)]^=255;await assert.rejects(()=>decodeStored({...compressed,blob:new Blob([bytes])}),/읽을 수 없습니다/);
});
