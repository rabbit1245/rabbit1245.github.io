import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,setPersonality,overall,configureCheats,retireCareer} from './engine';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {personality,PERSONALITY_KEYS,DEFAULT_PERSONALITY} from './personality';
import {executeCommand} from './commands';
import {commandChange} from './command-patches';
import {validateCareer,exportCareer,verifySaveText,saveCareer,saveCareerChange,loadCareer} from './storage';
import {getClub,getLeague} from './data';
import {getWorldClubPlayers,getClubWorldPower,transitionWorldSeason} from './world';
import {calculateTable,emptyStats} from './engine';
import {globalVoting,europeanShoePoints} from './global-honours';
import {makeContractOffers,updateMarketValue} from './career-systems';
import {getCaptainAssessment} from './captain';
import {simulateMatch} from './match-engine';
import {ESTABLISHED_CLUBS,userInfluencedClub} from './club-balance';
import type {Career,Fixture} from './types';
const fresh=(clubId='EN1_12')=>createCareer({name:'성향 검수',nationality:'대한민국',age:27,height:182,weight:77,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId,squad:'senior',difficulty:'realistic',seed:'personality-294',training:[]});
const elite=(clubId='EN1_12')=>{const c=fresh(clubId);for(const k of FIELD_ATTRIBUTES)c.player.attributes[k]=98;c.player.ovr=overall(c.player);return c;};

test('five independent personality controls preserve attributes and OVR, journal, JSON and legacy absence',async()=>{
 const original=fresh(),before=JSON.stringify(original),attrs={...original.player.attributes},rating=original.player.ovr;assert.deepEqual(personality(original),DEFAULT_PERSONALITY);assert.equal(original.systems!.personality,undefined);
 let c=original;await saveCareer(c);
 for(const key of PERSONALITY_KEYS){const next=executeCommand(c,{type:'personality',key,value:10},`personality-${key}`);assert.ok(commandChange(c,next));await saveCareerChange(c,next);c=next;assert.deepEqual(c.player.attributes,attrs);assert.equal(c.player.ovr,rating);}
 assert.equal(JSON.stringify(original),before);assert.ok(PERSONALITY_KEYS.every(k=>c.systems!.personality![k]===10));assert.deepEqual((await loadCareer(c.id))!.systems!.personality,c.systems!.personality);assert.deepEqual((await verifySaveText(await exportCareer(c))).systems!.personality,c.systems!.personality);
 assert.throws(()=>setPersonality(c,'fairPlay',0));assert.throws(()=>setPersonality(c,'fairPlay',11));assert.throws(()=>setPersonality(c,'fairPlay',2.5));const bad=structuredClone(c);bad.systems!.personality!.clutch=99;assert.throws(()=>validateCareer(bad));
 const neutral=setPersonality(original,'stardom',5);assert.deepEqual(neutral.player,original.player);assert.deepEqual(neutral.training,original.training);
});

test('unaffected clubs cannot become superclubs from inherited investment; all requested established clubs are protected',()=>{
 const c=fresh(),w=c.systems!.world,id='DE1_09',base=getClubWorldPower(c,id);assert.ok(!userInfluencedClub(c,id));w.clubs[id].development!.investmentPower=22;w.clubs[id].development!.prestige=99;assert.ok(getClubWorldPower(c,id)-base<=4.01);
 assert.equal(ESTABLISHED_CLUBS.size,22);for(const club of ESTABLISHED_CLUBS){assert.ok(w.clubs[club]);assert.ok(['영국','이탈리아','스페인','독일','프랑스'].includes(getLeague(w.clubs[club].leagueId).country));}
 const own=w.clubs[c.player.clubId],old=getClubWorldPower(c,own.id);own.development!.investmentPower=12;assert.ok(getClubWorldPower(c,own.id)>old+10);
 const past=structuredClone(c);past.player.clubId='FA';past.history=[{clubId:own.id,squad:'senior',ovrEnd:98,stats:{apps:30,minutes:2700,ratingCount:30,ratingSum:225}}] as Career['history'];assert.ok(userInfluencedClub(past,own.id),'an actually built former club keeps its legacy');
 const cameo=structuredClone(c);cameo.player.clubId='FA';cameo.history=[{clubId:own.id,squad:'senior',ovrEnd:50,stats:{apps:8,minutes:120,ratingCount:8,ratingSum:48}}] as Career['history'];assert.equal(userInfluencedClub(cameo,own.id),false,'a brief reserve spell does not license decades of autonomous superclub growth');
});
test('the first command repairs legacy current club powers on a copy without rewriting historic games or the original',()=>{
 const c=fresh();delete c.systems!.world.balanceVersion;c.systems!.world.clubs.DE1_09.development!.investmentPower=20;c.systems!.world.clubs.DE1_09.power=95;const before=JSON.stringify(c),history=JSON.stringify(c.history);
 const next=setPersonality(c,'leadership',6);assert.equal(JSON.stringify(c),before);assert.equal(next.systems!.world.balanceVersion,1);assert.ok(next.systems!.world.clubs.DE1_09.power<83);assert.equal(JSON.stringify(next.history),history);validateCareer(next);
});

test('an elite 40-year-old retains meaningful value, multi-year first-team offers and the same selection as a 27-year-old',()=>{
 const young=elite(),old=structuredClone(young);young.player.age=27;old.player.age=40;for(const c of [young,old]){updateMarketValue(c,'동일 실력 평가');c.stage='offseason';}
 assert.ok(old.systems!.economics.marketValue>=young.systems!.economics.marketValue*.45);
 assert.ok(makeContractOffers(old,'offseason').find(o=>o.clubId===old.player.clubId)!.years>=2);
 const f=young.season.fixtures.find(f=>f.homeId===young.player.clubId)!;
 for(let i=0;i<80;i++){young.seed=old.seed=`veteran-${i}`;const a=simulateMatch(young,f),b=simulateMatch(old,f);assert.equal(a.playerStarted,b.playerStarted);assert.equal(a.playerMinutes,b.playerMinutes);}
});

test('fair play 10 produces no cards, while 1 produces materially more real disciplinary events',()=>{
 const c=elite(),f=c.season.fixtures.find(f=>f.homeId===c.player.clubId)!;let clean=0,rough=0;
 for(let i=0;i<180;i++)for(const level of [1,10]){const r={...c,seed:`fair-${i}`,systems:{...c.systems!,personality:{...DEFAULT_PERSONALITY,fairPlay:level}}};const m=simulateMatch(r,f,{detailed:false});const cards=m.playerStats.yellowCards+m.playerStats.redCards;assert.equal(m.events.filter(e=>e.playerId===c.player.id&&(e.type==='yellow'||e.type==='red')).length,cards);if(level===10)clean+=cards;else rough+=cards;}
 assert.equal(clean,0);assert.ok(rough>35,`rough cards ${rough}`);
});

test('stardom changes valuation and leadership changes captain assessment without changing ability',()=>{
 const c=elite(),star=setPersonality(c,'stardom',10);updateMarketValue(c,'기준');updateMarketValue(star,'스타');assert.ok(star.systems!.economics.marketValue>c.systems!.economics.marketValue);
 const leader=setPersonality(c,'leadership',10);assert.ok(getCaptainAssessment(leader,'club').leadership>getCaptainAssessment(c,'club').leadership);assert.deepEqual(leader.player.attributes,c.player.attributes);
});
test('leadership improves the use of real paid investment rather than creating free money',()=>{
 const c=elite('IT3_30'),comp=c.systems!.world.competitions[c.season.leagueId];for(const f of comp.fixtures){f.played=true;f.homeGoals=1;f.awayGoals=1;}comp.round=comp.totalRounds;comp.table=calculateTable(comp.fixtures,comp.table.map(r=>r.clubId));c.season.playerStats={...emptyStats(),apps:38,starts:38,minutes:3420,goals:31,assists:23,ratingCount:38,ratingSum:296.4};
 const high=setPersonality(structuredClone(c),'leadership',10);transitionWorldSeason(c);transitionWorldSeason(high);const a=c.systems!.world.clubs.IT3_30.development!,b=high.systems!.world.clubs.IT3_30.development!;assert.equal(a.history.at(-1)!.reinvestment,b.history.at(-1)!.reinvestment);assert.ok(b.investmentPower!>a.investmentPower!);assert.deepEqual(c.player.attributes,high.player.attributes);
});
test('stardom gives a noticeable bounded subjective vote bonus but never changes a Golden Shoe goal count',()=>{
 const c=elite(),high=setPersonality(c,'stardom',10),r={playerId:c.player.id,name:c.player.name,clubId:c.player.clubId,leagueId:c.season.leagueId,nationality:c.player.nationality,ovr:98,position:c.player.position,stats:{...emptyStats(),apps:34,minutes:2900,goals:31,assists:23,ratingCount:34,ratingSum:272},nationalStats:emptyStats()},ctx={leagueWinners:new Map<string,string>(),cups:[],leagueTitles:new Map<string,number>(),cupTitles:new Map<string,number>(),teamScore:new Map<string,number>()};
 const a=globalVoting(c,[r],()=>100,ctx).score(r),b=globalVoting(high,[r],()=>100,ctx).score(r);assert.ok(b>a*1.05&&b<=a*1.12);assert.equal(europeanShoePoints(r),62);assert.deepEqual(high.player.attributes,c.player.attributes);
});

test('clutch only boosts big stages; winning helps actual on-pitch team chances and never absent players',()=>{
 const c=elite(),fixture=c.season.fixtures.find(f=>f.homeId===c.player.clubId)!,home={...getClub(fixture.homeId),power:72},away={...getClub(fixture.awayId),power:72};
 const options={home,away,homePlayers:getWorldClubPlayers(c,home.id),awayPlayers:getWorldClubPlayers(c,away.id),detailed:false,forceSelection:{from:0,to:90,started:true}};
 let weak=0,strong=0,lowTeam=0,highTeam=0;
 for(let i=0;i<180;i++){
  const low={...c,seed:`clutch-${i}`,systems:{...c.systems!,personality:{...DEFAULT_PERSONALITY,clutch:1}}},high={...low,systems:{...low.systems,personality:{...DEFAULT_PERSONALITY,clutch:10}}};
  assert.deepEqual(simulateMatch(low,fixture,options),simulateMatch(high,fixture,options));
  const final={...fixture,id:`UCL:2026|final|${i}`} as Fixture;weak+=simulateMatch(low,final,options).playerStats.goals;strong+=simulateMatch(high,final,options).playerStats.goals;
  const a={...low,systems:{...low.systems,personality:{...DEFAULT_PERSONALITY,winning:1}}},b={...low,systems:{...low.systems,personality:{...DEFAULT_PERSONALITY,winning:10}}};const m=simulateMatch(a,fixture,options),n=simulateMatch(b,fixture,options);lowTeam+=m.homeGoals-m.awayGoals;highTeam+=n.homeGoals-n.awayGoals;assert.deepEqual(simulateMatch(a,fixture,{...options,userParticipates:false}),simulateMatch(b,fixture,{...options,userParticipates:false}));
 }
 assert.ok(strong>weak,`${weak} -> ${strong}`);assert.ok(highTeam>lowTeam,`${lowTeam} -> ${highTeam}`);
});
