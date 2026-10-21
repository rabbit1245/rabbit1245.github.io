import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer,emptyStats,respondToCaptainOffer } from './engine';
import { getCaptainAssessment,proposeCaptainOffer,answerCaptainOffer,expireCaptainOffers } from './captain';
import { PLAY_STYLES } from './attributes';
import type { Career,MatchRecord } from './types';

const base=createCareer({name:'주장 검증',nationality:'대한민국',age:27,height:180,weight:75,foot:'right',position:'CM',talent:'S',style:PLAY_STYLES.CM[0],clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'captain-offers-v22'});
function candidate():Career{
 const c=structuredClone(base);c.season.year=2028;c.season.week=20;c.player.ovr=85;c.managerTrust=90;
 const l=c.systems!.leadership;l.clubSinceYear=2026;l.trait=90;
 const club=c.systems!.world.clubs[c.player.clubId];club.power=70;
 for(const p of Object.values(c.systems!.world.players))if(p.clubId===c.player.clubId){p.ovr=65;p.leadership=55;}
 c.season.matches=Array.from({length:45},(_,i)=>({id:`match-${i}`,fixtureId:`fixture-${i}`,seasonYear:i<25?2027:2028,round:i<25?i+1:i-24,homeId:c.player.clubId,awayId:'KR1_02',homeGoals:1,awayGoals:0,events:[],playerClubId:c.player.clubId,playerPlayed:true,playerStarted:true,playerMinutes:90,playerRating:7.5,playerStats:{...emptyStats(),apps:1,starts:1,minutes:90,ratingCount:1,ratingSum:7.5},seed:'test'} as MatchRecord));
 return c;
}
test('a real performer gets a proposal before any role or captain term changes',()=>{
 const c=candidate(),a=getCaptainAssessment(c,'club');assert.equal(a.eligibleRole,'captain');
 proposeCaptainOffer(c,'club');proposeCaptainOffer(c,'club');
 assert.equal(c.systems!.leadership.offers!.length,1);assert.equal(c.systems!.leadership.clubRole,'none');assert.equal(c.systems!.leadership.terms.length,0);
 const before=JSON.stringify(c),offer=c.systems!.leadership.offers![0];
 const accepted=respondToCaptainOffer(c,offer.id,true);
 assert.equal(JSON.stringify(c),before,'command must preserve previous snapshot');
 assert.equal(accepted.systems!.leadership.clubRole,'captain');assert.equal(accepted.systems!.leadership.terms.length,1);assert.equal(accepted.systems!.leadership.terms[0].apps,0);
 assert.equal(accepted.systems!.leadership.offers![0].assessment.playerOvr,85);
 assert.throws(()=>respondToCaptainOffer(accepted,offer.id,true),/응답/);
});
test('leadership alone cannot make an inferior player captain of a stronger club',()=>{
 const c=candidate();c.player.ovr=55;c.systems!.leadership.trait=99;c.systems!.world.clubs[c.player.clubId].power=90;
 for(const p of Object.values(c.systems!.world.players))if(p.clubId===c.player.clubId)p.ovr=90;
 const a=getCaptainAssessment(c,'club');assert.equal(a.eligibleRole,'none');assert.ok(a.reasons.some(r=>r.includes('실력')));
 proposeCaptainOffer(c,'club');assert.equal(c.systems!.leadership.offers!.length,0);
});
test('candidate ranking compares the same season and weights without a user-only tenure bonus',()=>{
 const c=candidate(),peers=Object.values(c.systems!.world.players).filter(p=>p.clubId===c.player.clubId).slice(0,3);
 const stats={...emptyStats(),apps:20,starts:20,minutes:1800,ratingCount:20,ratingSum:150};
 for(const p of peers){p.ovr=85;p.leadership=95;p.age=27;c.systems!.world.playerStats[p.id]={playerId:p.id,name:p.name,clubId:p.clubId,leagueId:c.season.leagueId,position:p.position,nationality:p.nationality,ovr:p.ovr,stats,nationalStats:emptyStats()};}
 const a=getCaptainAssessment(c,'club');assert.equal(a.candidateRank,4);assert.equal(a.eligibleRole,'none');
});
test('age, actual performances, tenure and trust each constrain proposals',()=>{
 for(const change of [(c:Career)=>{c.player.age=18;},(c:Career)=>{c.systems!.leadership.clubSinceYear=c.season.year;},(c:Career)=>{c.managerTrust=40;},(c:Career)=>{for(const m of c.season.matches)m.playerStats.ratingSum=5.5;},(c:Career)=>{for(const m of c.season.matches)m.playerStats.minutes=15;}]){
  const c=candidate();change(c);assert.equal(getCaptainAssessment(c,'club').eligibleRole,'none');
 }
});
test('declining is final for that team and season, and a later season re-evaluates',()=>{
 const c=candidate();proposeCaptainOffer(c,'club');const offer=c.systems!.leadership.offers![0];answerCaptainOffer(c,offer.id,false);
 proposeCaptainOffer(c,'club');assert.equal(c.systems!.leadership.offers!.length,1);assert.equal(c.systems!.leadership.clubRole,'none');
 c.season.year++;proposeCaptainOffer(c,'club');assert.equal(c.systems!.leadership.offers!.length,2);
 expireCaptainOffers(c);assert.equal(c.systems!.leadership.offers![1].status,'expired');
});
test('a stale team offer cannot be accepted after the player changes club',()=>{
 const c=candidate();proposeCaptainOffer(c,'club');const id=c.systems!.leadership.offers![0].id;c.player.clubId='KR1_02';
 assert.throws(()=>answerCaptainOffer(c,id,true),/현재 소속/);
 expireCaptainOffers(c,'club');assert.equal(c.systems!.leadership.offers![0].status,'expired');
});
test('national proposals require the correct age group and actual national selection',()=>{
 const c=candidate();assert.equal(getCaptainAssessment(c,'national').eligibleRole,'none');
 c.player.age=22;c.systems!.national.squad='U20';assert.equal(getCaptainAssessment(c,'national').eligibleRole,'none');
});
