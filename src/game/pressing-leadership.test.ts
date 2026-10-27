import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,overall,setPersonalityValues} from './engine';
import {FIELD_ATTRIBUTES} from './attributes';
import {DEFAULT_PERSONALITY} from './personality';
import {getCaptainAssessment,proposeCaptainOffer,answerCaptainOffer} from './captain';
import {performanceScore,updateLeadership} from './career-systems';
import {tournamentPerformance} from './tournament-awards';
import {emptyStats} from './math';
import type {Career,MatchRecord} from './types';
import type {CompetitorSeason} from './revision-types';

const fresh=()=>createCareer({name:'압박형 리더',nationality:'대한민국',age:24,height:184,weight:80,foot:'right',position:'ST',talent:'SSS',style:'프레싱 포워드',clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'pressing-captain-296',training:[]});
const appearance=(c:Career,i:number,rating=7.5):MatchRecord=>({id:`lead-${i}`,fixtureId:`lead-${i}`,round:i,seasonYear:c.season.year,homeId:c.player.clubId,awayId:'KR1_02',homeGoals:1,awayGoals:0,events:[],playerClubId:c.player.clubId,playerPlayed:true,playerStarted:true,playerMinutes:90,playerRating:rating,playerStats:{...emptyStats(),apps:1,starts:1,minutes:90,ratingCount:1,ratingSum:rating},seed:'captain-assessment-fixture'});
function candidate(apps=12){
  const c=fresh();for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=90;c.player.ovr=overall(c.player);c.managerTrust=90;
  c.systems!.leadership.trait=70;c.systems!.leadership.traitUpdatedYear=c.season.year;c.systems!.world.clubs[c.player.clubId].power=70;
  for(const p of Object.values(c.systems!.world.players))if(p.clubId===c.player.clubId){p.ovr=65;p.leadership=55;}
  c.season.week=apps;c.season.matches=Array.from({length:apps},(_,i)=>appearance(c,i+1));return c;
}

test('a forward earns credit for observed ball winning, key passes and aerial work without gifted goals or higher OVR',()=>{
  const c=fresh();
  const simple:CompetitorSeason={playerId:'forward',name:'forward',clubId:c.player.clubId,leagueId:c.season.leagueId,position:'ST',ovr:95,nationality:c.player.nationality,stats:{...emptyStats(),apps:30,starts:30,minutes:2700,goals:12,assists:8,ratingCount:30,ratingSum:225,dribblesCompleted:30,tackles:10,interceptions:10,keyPasses:10,aerialWon:10}};
  const pressing={...simple,ovr:70,stats:{...simple.stats,tackles:90,interceptions:60,keyPasses:50,aerialWon:60}};
  assert.ok(performanceScore(pressing,c)>performanceScore(simple,c)+15);assert.ok(tournamentPerformance({id:'forward',...pressing})>tournamentPerformance({id:'forward',...simple})+10);
  assert.equal(pressing.stats.goals,simple.stats.goals);assert.equal(pressing.stats.assists,simple.stats.assists);
});
test('regular in-season leadership reviews offer a proven newcomer vice captaincy before a season boundary',()=>{
  const c=candidate(12);updateLeadership(c,'club');
  assert.equal(c.systems!.leadership.offers!.length,1);assert.equal(c.systems!.leadership.offers![0].round,12);assert.equal(c.systems!.leadership.offers![0].role,'vice');assert.equal(c.systems!.leadership.clubRole,'none');
});
test('accepting a vice captain offer does not block a deserved captain upgrade in the same season',()=>{
  const c=candidate(12);proposeCaptainOffer(c,'club');const vice=c.systems!.leadership.offers![0];answerCaptainOffer(c,vice.id,true);
  c.season.week=24;c.season.matches=Array.from({length:24},(_,i)=>appearance(c,i+1));proposeCaptainOffer(c,'club');proposeCaptainOffer(c,'club');
  const offers=c.systems!.leadership.offers!;assert.equal(offers.length,2);assert.notEqual(offers[1].id,vice.id);assert.equal(offers[1].role,'captain');assert.equal(c.systems!.leadership.clubRole,'vice');
  answerCaptainOffer(c,offers[1].id,true);assert.equal(c.systems!.leadership.clubRole,'captain');assert.equal(c.systems!.leadership.terms[0].endRound,24);
});
test('an unanswered vice offer upgrades cleanly; a declined offer stays final, and an expired one can be reconsidered',()=>{
  const pending=candidate(12);proposeCaptainOffer(pending,'club');pending.season.week=24;pending.season.matches=Array.from({length:24},(_,i)=>appearance(pending,i+1));proposeCaptainOffer(pending,'club');assert.deepEqual(pending.systems!.leadership.offers!.map(o=>[o.role,o.status]),[['vice','expired'],['captain','pending']]);
  const declined=candidate(12);proposeCaptainOffer(declined,'club');answerCaptainOffer(declined,declined.systems!.leadership.offers![0].id,false);declined.season.matches=Array.from({length:24},(_,i)=>appearance(declined,i+1));proposeCaptainOffer(declined,'club');assert.equal(declined.systems!.leadership.offers!.length,1);
  const recovered=candidate(12);proposeCaptainOffer(recovered,'club');recovered.managerTrust=40;proposeCaptainOffer(recovered,'club');assert.equal(recovered.systems!.leadership.offers![0].status,'expired');recovered.managerTrust=90;recovered.season.week=18;proposeCaptainOffer(recovered,'club');assert.equal(recovered.systems!.leadership.offers![1].status,'pending');
});
test('leadership personality can beat close established candidates without granting a weak player a role',()=>{
  const c=candidate(18);c.systems!.leadership.clubSinceYear=c.season.year-1;c.systems!.leadership.trait=50;for(const m of c.season.matches)m.playerStats.ratingSum=7.1;
  for(const p of Object.values(c.systems!.world.players).filter(p=>p.clubId===c.player.clubId).slice(0,3)){
    p.ovr=85;p.leadership=95;c.systems!.world.playerStats[p.id]={playerId:p.id,name:p.name,clubId:p.clubId,leagueId:c.season.leagueId,position:p.position,ovr:p.ovr,nationality:p.nationality,stats:{...emptyStats(),apps:18,starts:18,minutes:1620,ratingCount:18,ratingSum:135}};
  }
  const high=setPersonalityValues(c,{...DEFAULT_PERSONALITY,leadership:10});assert.ok(getCaptainAssessment(high,'club').candidateRank<getCaptainAssessment(c,'club').candidateRank);assert.notEqual(getCaptainAssessment(high,'club').eligibleRole,'none');
  high.player.ovr=40;assert.equal(getCaptainAssessment(high,'club').eligibleRole,'none');
});
