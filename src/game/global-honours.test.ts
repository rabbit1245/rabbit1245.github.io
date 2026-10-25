import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,emptyStats} from './engine';
import {globalVoting,additionalGlobalHonours,europeanShoePoints,type VotingTeamContext} from './global-honours';
import {achievementBonus,finishAchievementSeason} from './achievement-evidence';
import {awardForDisplay} from './award-rules';
import {internationalRoster} from './international-clubs';
import {validateCareer} from './storage';
import type {Career,MatchRecord,Position} from './types';
import type {CompetitorSeason} from './revision-types';
const fresh=()=>createCareer({name:'수상 검증',nationality:'대한민국',age:20,height:180,weight:75,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'EN1_01',squad:'senior',difficulty:'realistic',seed:'honours-280'});
const row=(c:Career,position:Position='ST',stats={})=>({playerId:c.player.id,name:c.player.name,clubId:c.player.clubId,leagueId:c.season.leagueId,nationality:c.player.nationality,ovr:c.player.ovr,position,stats:{...emptyStats(),apps:34,minutes:2900,goals:24,assists:10,ratingCount:34,ratingSum:34*7.8,...stats},nationalStats:emptyStats()});
const context=():VotingTeamContext=>({leagueWinners:new Map(),cups:[],leagueTitles:new Map(),cupTitles:new Map(),teamScore:new Map()});
test('distinct global awards retain organisers, own eligibility and year results without fake nominee screens',()=>{
 const c=fresh(),r=row(c),ctx=context();c.player.ovr=90;
 const voting=globalVoting(c,[r],()=>100,ctx),eleven=(rows:any[])=>rows;
 const result=additionalGlobalHonours(c,[r],[r],voting,eleven);
 const names=result.awards.map(a=>a.name);assert.ok(names.includes('The Best FIFA 올해의 선수'));assert.ok(names.includes("The Best FIFA Men's 11"));assert.ok(names.includes('코파 트로피'));assert.ok(names.includes('유러피언 골든슈'));assert.ok(!names.includes('야신 트로피'));
 assert.equal(new Set(result.awards.map(a=>a.id)).size,result.awards.length);assert.ok(result.awards.every(a=>a.verification==='game-model'&&a.criterion));
 const keeper=row(c,'GK',{goals:0,saves:130,cleanSheets:18}),g=additionalGlobalHonours(c,[keeper],[keeper],globalVoting(c,[keeper],()=>100,ctx),eleven);
 assert.ok(g.awards.some(a=>a.name==='야신 트로피'));assert.ok(g.awards.some(a=>a.name==='The Best FIFA 올해의 골키퍼'));
 c.player.age=21;assert.ok(!additionalGlobalHonours(c,[r],[r],voting,eleven).awards.some(a=>a.name==='코파 트로피'));
});
test('European Golden Shoe uses league goals and coefficients alone, excludes second divisions and non-Europe',()=>{
 const c=fresh(),a=row(c),b={...a,leagueId:'PT1',stats:{...a.stats,goals:31}},higher={...a,stats:{...a.stats,goals:24}};
 assert.equal(europeanShoePoints(a),48);assert.equal(europeanShoePoints(b),46.5);
 assert.equal(europeanShoePoints({...a,leagueId:'EN2'}),0);assert.equal(europeanShoePoints({...a,leagueId:'KR1'}),0);
 const ctx=context(),v=globalVoting(c,[a,b],()=>100,ctx);c.player.ovr=120;
 const result=additionalGlobalHonours(c,[a,b],[higher,{...b,playerId:'competitor'}],v,r=>r);assert.ok(result.awards.some(a=>a.name==='유러피언 골든슈'));
 const losing=additionalGlobalHonours(c,[a,b],[{...higher,stats:{...higher.stats,goals:20}},{...b,playerId:'competitor'}],v,r=>r);assert.ok(!losing.awards.some(a=>a.name==='유러피언 골든슈'));
});
test('ability participates in subjective votes but cannot replace performance, appearances or eligibility',()=>{
 const c=fresh(),r=row(c),other={...r,playerId:'other',ovr:80},ctx=context();c.player.ovr=120;
 const v=globalVoting(c,[r,other],p=>p.playerId===c.player.id?10:110,ctx);assert.ok(v.score(other)>v.score(r));
 const empty={...r,stats:emptyStats()},awards=additionalGlobalHonours(c,[empty],[empty],globalVoting(c,[empty],()=>0,ctx),r=>r).awards;
 assert.equal(awards.length,0);
});
test('narrative achievements require evidence, diminish overlapping titles, cap at ten, and do not invent a drought',()=>{
 const c=fresh(),r=row(c),ctx=context(),e=c.systems!.achievementEvidence!;c.season.playerStats=r.stats;
 c.player.age=35;assert.equal(achievementBonus(c,r,ctx),0,'age and club residence alone have no bonus');
 c.player.age=20;ctx.leagueWinners.set(c.player.clubId,c.season.leagueId);e.clubs[c.player.clubId].expectedRank=18;
 assert.equal(achievementBonus(c,r,{...ctx}),3);e.completeStart=false;assert.equal(achievementBonus(c,r,{...ctx}),0);e.completeStart=true;
 c.player.age=35;e.observedFrom=2010;e.lastTitles[c.player.clubId]=2015;e.previousInjuredRounds[c.player.id]=20;e.records['goals:EN1']={value:23,year:2020};
 c.history=Array.from({length:10},(_,i)=>({year:c.season.year-10+i,clubId:c.player.clubId,leagueId:'EN1',squad:'senior'}))as Career['history'];
 const actor={id:c.player.id,name:c.player.name,clubId:c.player.clubId,teamId:c.player.clubId,position:'ST' as const,ovr:90,stats:r.stats,rating:9,minutes:90,started:true};
 const match={id:'final',fixtureId:'cup-final',seasonYear:c.season.year,homeId:c.player.clubId,awayId:'EN1_02',homeGoals:2,awayGoals:0,playerPlayed:true,playerClubId:c.player.clubId,performers:[actor]}as MatchRecord;
 ctx.cups.push({id:'UCL:2026',kind:'continental',winnerId:c.player.clubId,entrants:Object.keys(e.clubs).slice(0,36),matches:[match],finalIds:['cup-final']});
 const points=achievementBonus(c,r,{...ctx});assert.ok(points>3&&points<=10);
 assert.equal(achievementBonus(c,{...r,stats:{...r.stats,minutes:100,apps:2}},{...ctx}),0);
 delete e.lastTitles[c.player.clubId];e.observedFrom=c.season.year;assert.ok(achievementBonus(c,r,{...ctx})<=points,'no pre-game trophy history is inferred');
});
test('historical league records exclude cup goals and old award IDs/data survive display renaming',()=>{
 const c=fresh(),r=row(c),ctx=context();c.systems!.world.playerStats={[c.player.id]:r};c.season.playerStats={...r.stats,goals:11};
 finishAchievementSeason(c,[{...r,stats:{...r.stats,goals:99}}],ctx);assert.equal(c.systems!.achievementEvidence!.records['goals:EN1'].value,11);
 const old={id:'kept',name:'K볼 선정 · 올해의 선수',year:2025,clubId:c.player.clubId,description:'원자료',category:'club',official:false};
 assert.equal(awardForDisplay(old).id,old.id);assert.ok(awardForDisplay(old).name.startsWith('클럽 선정'));assert.ok(old.name.startsWith('K볼 선정'));
});

test('equal output in a lower division is weighted below top-flight output in global awards',()=>{
 const c=fresh(),a=row(c),b={...a,playerId:'second-division',leagueId:'EN2'},v=globalVoting(c,[a,b],()=>100,context());c.player.ovr=a.ovr;assert.ok(v.score(a)>v.score(b));
});
test('real simulated international guests can be saved as award candidates; forged guest identities remain invalid',()=>{
 const c=fresh(),guest=internationalRoster('INT_SA_AHLI')[14];
 c.systems!.rankings=[{year:c.season.year,candidates:[{playerId:guest.id,name:guest.name,position:guest.position,clubId:guest.clubId,score:1,rank:1,stats:emptyStats(),nationalStats:emptyStats()}],playerRank:null,winnerId:guest.id,world11:[],awards:[]}];
 validateCareer(c);c.systems!.rankings[0].candidates[0].name='검증되지 않은 이름';assert.throws(()=>validateCareer(c),/선수 참조/);
});
