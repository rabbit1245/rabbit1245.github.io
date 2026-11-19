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
test('Ballon voting can favour an 88 OVR performer and ignores changes to ability on a fixed record',()=>{
 const c=fresh(),r=row(c),other={...r,playerId:'other',ovr:120},ctx=context();
 c.player.ovr=88;
 const before=globalVoting(c,[r,other],p=>p.playerId===c.player.id?110:80,ctx);
 const ballon=before.score(r),fifa=before.score(r,'fifa');
 assert.ok(ballon>before.score(other));
 c.player.ovr=120;
 const after=globalVoting(c,[r,other],p=>p.playerId===c.player.id?110:80,ctx);
 assert.equal(after.score(r),ballon);
 assert.ok(after.score(r,'fifa')>fifa);
 const v=globalVoting(c,[r,other],p=>p.playerId===c.player.id?10:110,ctx);assert.ok(v.score(other)>v.score(r));
 const empty={...r,stats:emptyStats()},awards=additionalGlobalHonours(c,[empty],[empty],globalVoting(c,[empty],()=>0,ctx),r=>r).awards;
 assert.equal(awards.length,0);
});
test('Ballon credits senior finals from the tournament ledger and league results in proportion to actual minutes',()=>{
 const c=fresh(),r=row(c),ctx=context(),nat=c.systems!.national;
 const international={...emptyStats(),apps:5,minutes:450,goals:4,assists:3,ratingCount:5,ratingSum:44};
 const friendly={...r,nationalStats:international},grade=(candidate:CompetitorSeason)=>globalVoting(c,[candidate],()=>100,ctx).ballonBreakdown(candidate);
 assert.deepEqual(grade(r),grade(friendly),'friendlies or youth caps in the combined total have no senior finals points');
 const final=(id:string,year:number)=>({id,fixtureId:`NAT|senior|${id}|final|1`,competitionId:id,seasonYear:year,
  homeId:'NAT:일본:senior',awayId:'NAT:대한민국:senior',homeGoals:2,awayGoals:1} as MatchRecord);
 const peers=Object.fromEntries(Array.from({length:10},(_,i)=>{
  const id=`finals-peer-${i}`;
  return [id,{id,name:id,position:r.position,stats:{...emptyStats(),apps:5,minutes:450,ratingCount:5,ratingSum:35}}];
 }));
 nat.tournamentStats={'WC:2026':{...peers,[r.playerId]:{id:r.playerId,name:r.name,position:r.position,stats:international}}};
 nat.teamResults=[final('WC:2026',c.season.year-1)];
 assert.equal(grade(r).nationalApps,0);
 const seniorFinal=final('WC:2026',c.season.year);
 nat.teamResults=[seniorFinal,seniorFinal];
 const senior=grade(r);
 assert.equal(senior.nationalApps,5);
 assert.ok(senior.individual>60&&senior.individual>grade({...r,playerId:'other'}).individual);
 assert.ok(senior.major>0&&senior.major<=4*450/540);
 nat.teamResults=[seniorFinal];
 assert.equal(grade(r).major,senior.major,'the same final does not earn points twice');
 assert.equal(senior.team,0,'a losing finalist gets no winner credit');
 ctx.leagueTitles.set(r.clubId,8);
 assert.equal(grade(r).team,0,'cup and national minutes do not earn league title points');
 c.season.matches=[{...seniorFinal,scope:'club',competitionId:r.leagueId,playerClubId:r.clubId,playerStats:{...emptyStats(),apps:1,minutes:90}}];
 assert.ok(grade(r).team>0&&grade(r).team<1,'limited league appearances earn partial title points');
});
test('An outstanding Champions League campaign can swing a close Ballon vote without overriding a stronger season',()=>{
 const c=fresh(),domestic=row(c),ctx=context(),cups=c.systems!.clubCompetitions!.current;
 const rival={...domestic,playerId:'ucl-rival',clubId:'ES1_01',leagueId:'ES1'};
 const ordinary={...rival,playerId:'ucl-team-winner',clubId:'ES1_02'};
 const bench={...ordinary,playerId:'ucl-bench'};
 const keeper={...ordinary,playerId:'ucl-keeper',position:'GK' as const};
 const candidates=[domestic,rival,ordinary,bench,keeper];
 const cup=cups.find(t=>t.id.startsWith('UCL:'))!;
 const domesticCup=cups.find(t=>t.kind==='cup')!;
 const regular={...emptyStats(),apps:6,minutes:540,ratingCount:6,ratingSum:42};
 const strong={...regular,goals:8,assists:3,mom:4,ratingSum:53.4};
 const peers=Object.fromEntries(Array.from({length:10},(_,i)=>{
  const playerId=`ucl-peer-${i}`;
  return [playerId,{...ordinary,playerId,stats:regular}];
 }));
 const keeperPeers=Object.fromEntries(Array.from({length:7},(_,i)=>{
  const playerId=`ucl-keeper-${i}`;
  return [playerId,{...keeper,playerId,stats:{...regular,saves:18,goalsConceded:8,cleanSheets:2}}];
 }));
 cup.winnerId=ordinary.clubId;
 cup.playerStats={...peers,...keeperPeers,
  [rival.playerId]:{...rival,stats:strong},[ordinary.playerId]:{...ordinary,stats:regular},
  [bench.playerId]:{...bench,stats:emptyStats()},
  [keeper.playerId]:{...keeper,stats:{...regular,ratingSum:51,saves:36,goalsConceded:3,cleanSheets:4}},
 };
 domesticCup.playerStats={...peers,[domestic.playerId]:{...domestic,stats:strong}};
 const worldPerformance=(r:CompetitorSeason)=>r.playerId===domestic.playerId?102:100;
 const before=globalVoting({...c,systems:{...c.systems!,clubCompetitions:undefined}},candidates,worldPerformance,ctx);
 const after=globalVoting(c,candidates,worldPerformance,ctx);
 assert.ok(before.score(domestic)>before.score(rival));
 assert.ok(after.score(rival)>after.score(domestic));
 assert.equal(after.ballonBreakdown(domestic).major,0);
 assert.equal(after.ballonBreakdown(ordinary).major,0);
 assert.equal(after.ballonBreakdown(bench).major,0);
 assert.ok(after.ballonBreakdown(keeper).major>0);
 assert.ok(after.score(rival)-before.score(rival)<=4);
 for(const candidate of candidates)assert.equal(after.score(candidate,'fifa'),before.score(candidate,'fifa'));
 const clear=globalVoting(c,candidates,r=>r.playerId===domestic.playerId?110:100,ctx);
 assert.ok(clear.score(domestic)>clear.score(rival));
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
