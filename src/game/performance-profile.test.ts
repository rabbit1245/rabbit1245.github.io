import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStats} from './math';
import {evaluateFieldPerformance,performanceBaselines,performanceChannels} from './performance-profile';
import {globalVoting} from './global-honours';
import {createCareer} from './engine';
import {PLAY_STYLES} from './attributes';
import type {PlayerStats,Position} from './types';
import type {CompetitorSeason} from './revision-types';

const stats=(extra:Partial<PlayerStats>={}):PlayerStats=>({...emptyStats(),apps:34,starts:32,minutes:2900,ratingCount:34,ratingSum:34*7.1,passes:1000,passesCompleted:850,actionApps:34,actionMinutes:2900,...extra});
const defensive=stats({goals:2,assists:4,tackles:145,interceptions:120,pressingWins:190,aerialWon:75,cleanSheets:18,progressivePasses:130,keyPasses:36,dribblesCompleted:65,ratingSum:34*7.35});
const scoring=stats({goals:28,assists:5,tackles:110,interceptions:95,pressingWins:110,aerialWon:130,cleanSheets:16,keyPasses:40,progressivePasses:110,dribblesCompleted:45,ratingSum:34*7.8});

test('a defensive winger and a scoring centre-back are evaluated by their observed work rather than fixed role weights',()=>{
 const a=evaluateFieldPerformance({position:'RW',stats:defensive}),b=evaluateFieldPerformance({position:'CB',stats:scoring});
 assert.equal(a.role,'DEF');assert.equal(b.role,'FWD');
 assert.ok(a.value>evaluateFieldPerformance({position:'RW',stats:{...defensive,tackles:25,interceptions:20,pressingWins:20}}).value);
 assert.ok(b.value>evaluateFieldPerformance({position:'CB',stats:{...scoring,goals:3}}).value);
 const provider=evaluateFieldPerformance({position:'CB',stats:stats({assists:12,keyPasses:70,progressivePasses:320,passes:1900,passesCompleted:1710,ratingSum:34*7.5})});assert.equal(provider.role,'MID');
});

test('role comparison uses one primary contribution and bounded complementary work without adding header goals twice',()=>{
 const row={position:'CB' as const,stats:scoring};assert.deepEqual(performanceChannels({...scoring,headerGoals:20}),performanceChannels(scoring),'headers remain a subset of goals');
 const onlyFinish=performanceChannels(stats({goals:25})),onlyDefence=performanceChannels(stats({tackles:150,interceptions:100,pressingWins:150}));
 assert.equal(onlyFinish.FWD,performanceChannels(stats({goals:25,tackles:999})).FWD);assert.equal(onlyDefence.DEF,performanceChannels(stats({goals:999,tackles:150,interceptions:100,pressingWins:150})).DEF);
 const all=evaluateFieldPerformance(row);assert.ok(Number.isFinite(all.value));assert.equal(row.stats,scoring,'judging does not mutate or rewrite statistics');
});

test('legacy missing action coverage remains missing and does not fabricate pressure or progressive passes',()=>{
 const legacy=stats({actionApps:0,actionMinutes:0,pressingWins:0,progressivePasses:0}),missing={...legacy};delete missing.pressingWins;delete missing.progressivePasses;delete missing.actionApps;delete missing.actionMinutes;
 assert.deepEqual(performanceChannels(legacy),performanceChannels(missing));
 const frozen=Object.freeze({...defensive});assert.deepEqual(evaluateFieldPerformance({position:'RW',stats:frozen}),evaluateFieldPerformance({position:'RW',stats:defensive}));
});

test('exceptional unconventional output can win a world vote and the old hard personal-score plateau no longer suppresses further output',()=>{
 const c=createCareer({name:'다양한 월드클래스',nationality:'네덜란드',age:27,height:180,weight:76,foot:'right',position:'RW',talent:'S',style:PLAY_STYLES.RW[0],clubId:'EN1_06',squad:'senior',difficulty:'realistic',seed:'versatile-vote',training:[]});c.player.ovr=92;
 const positions:Position[]=['CB','LB','RB','CM','CAM','RW','LW','ST'],rows:CompetitorSeason[]=Array.from({length:80},(_,i)=>({playerId:`peer-${i}`,name:`상대 ${i}`,position:positions[i%positions.length],clubId:'EN1_12',leagueId:'EN1',nationality:'네덜란드',ovr:88,stats:stats({goals:i%8>=5?18:3,assists:5,tackles:i%8<3?110:35,interceptions:i%8<3?85:25,pressingWins:70,cleanSheets:12,keyPasses:35,progressivePasses:100,dribblesCompleted:45}),nationalStats:emptyStats()}));
 const own={...rows[0],playerId:c.player.id,clubId:c.player.clubId,position:'RW' as const,ovr:92,stats:defensive};rows.push(own);
 const baselines=performanceBaselines(rows),judged=new Map(rows.map(r=>[r.playerId,evaluateFieldPerformance(r,baselines)]));
 const ctx={leagueWinners:new Map<string,string>(),cups:[],leagueTitles:new Map([[c.player.clubId,8]]),cupTitles:new Map([[c.player.id,16]]),teamScore:new Map<string,number>(),performanceRoles:new Map(rows.map(r=>[r.playerId,judged.get(r.playerId)!.role]))};
 const v=globalVoting(c,rows,r=>judged.get(r.playerId)!.value,ctx),ranked=[...rows].sort((a,b)=>v.score(b)-v.score(a));assert.equal(ranked[0].playerId,c.player.id);
 const before=globalVoting(c,rows,r=>r.playerId===c.player.id?200:80,ctx).score(own),after=globalVoting(c,rows,r=>r.playerId===c.player.id?250:80,ctx).score(own);assert.ok(after>before,'further exceptional performance still counts beyond the former flat cap');
});
