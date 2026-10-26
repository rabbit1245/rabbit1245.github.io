import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,emptyStats,overall,calculateTable} from './engine';
import {PLAY_STYLES,FIELD_ATTRIBUTES} from './attributes';
import {getCaptainAssessment,proposeCaptainOffer,answerCaptainOffer} from './captain';
import {getClubWorldPower,transitionWorldSeason} from './world';
import {assessClubSeason} from './club-development';
import type {Career,MatchRecord} from './types';

function fresh(){return createCareer({name:'젊은 국대 리더',nationality:'대한민국',age:22,height:181,weight:76,foot:'right',position:'CM',talent:'SSS',style:PLAY_STYLES.CM[0],clubId:'IT3_30',squad:'senior',difficulty:'realistic',seed:'young-national-leader-293',training:[]});}
function nationalCandidate(){
 const c=fresh();for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=94;c.player.ovr=overall(c.player);
 const n=c.systems!.national;n.status='called';n.squad='senior';n.reputation=5;c.systems!.leadership.trait=45;
 const own='NAT:대한민국:senior';n.matches=Array.from({length:12},(_,i)=>({id:`national-${i}`,fixtureId:`national-fixture-${i}`,seasonYear:c.season.year,round:i+1,homeId:own,awayId:'NAT:일본:senior',homeGoals:1,awayGoals:0,events:[],playerClubId:own,playerPlayed:true,playerStarted:true,playerMinutes:90,playerRating:7.7,playerStats:{...emptyStats(),apps:1,starts:1,minutes:90,ratingCount:1,ratingSum:7.7},seed:'assessment-only'} as MatchRecord));
 return c;
}
test('a 22-year-old national ace with strong mental attributes is not blocked by lifetime reputation or age',()=>{
 const c=nationalCandidate(),a=getCaptainAssessment(c,'national');assert.equal(a.eligibleRole,'captain');assert.ok(a.trust>=65);assert.ok(a.mental?.score===94);assert.ok(a.leadership>80);
 proposeCaptainOffer(c,'national');const o=c.systems!.leadership.offers!.find(o=>o.scope==='national')!;assert.ok(o);answerCaptainOffer(c,o.id,true);assert.equal(c.systems!.leadership.nationalRole,'captain');
 const older=nationalCandidate();older.player.age=34;const b=getCaptainAssessment(older,'national');assert.equal(b.score,a.score);assert.equal(b.candidateRank,a.candidateRank);assert.equal(b.eligibleRole,a.eligibleRole);
});
test('each of the four mental skills changes the leadership assessment independently',()=>{
 const c=nationalCandidate(),reference=getCaptainAssessment(c,'national');
 for(const key of ['decisions','concentration','composure','teamwork'] as const){const lower=structuredClone(c);lower.player.attributes[key]=30;const assessment=getCaptainAssessment(lower,'national');assert.ok(assessment.leadership<reference.leadership,key);assert.ok(assessment.score<reference.score,key);}
});
test('a national debut, poor form and missing selection do not earn a captaincy by ability alone',()=>{
 const freshAce=nationalCandidate();freshAce.systems!.national.matches.length=1;assert.equal(getCaptainAssessment(freshAce,'national').eligibleRole,'none');
 const poor=nationalCandidate();for(const m of poor.systems!.national.matches)m.playerStats.ratingSum=6;assert.equal(getCaptainAssessment(poor,'national').eligibleRole,'none');
 const excluded=nationalCandidate();excluded.systems!.national.status='unselected';assert.equal(getCaptainAssessment(excluded,'national').eligibleRole,'none');
});
test('31 goals and 23 assists fund meaningful lower-league development, without free growth from an unused OVR',()=>{
 const c=fresh(),w=c.systems!.world,club=w.clubs[c.player.clubId],comp=w.competitions[c.season.leagueId];
 for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=98;c.player.ovr=overall(c.player);
 for(const f of comp.fixtures){f.played=true;f.homeGoals=1;f.awayGoals=1;}comp.table=calculateTable(comp.fixtures,comp.table.map(t=>t.clubId));comp.round=comp.totalRounds;
 const unused=assessClubSeason(c,club,comp.table,true);assert.equal(unused.star,undefined);
 c.season.playerStats={...emptyStats(),apps:38,starts:38,minutes:3420,goals:31,assists:23,ratingCount:38,ratingSum:38*7.8};
 const assessment=assessClubSeason(c,club,comp.table,true);assert.ok(assessment.star?.retained);const before={...c.player.attributes};transitionWorldSeason(c);
 const d=club.development!,report=d.history.at(-1)!;assert.ok(report.reinvestment>0);assert.ok(d.investmentPower!>=1.2,`funded growth was only ${d.investmentPower}`);assert.ok(d.investmentPower!<=2.2);assert.deepEqual(c.player.attributes,before);
 const invested=getClubWorldPower(c,club.id),saved=d.investmentPower;d.investmentPower=0;assert.ok(invested-getClubWorldPower(c,club.id)>=1.2);d.investmentPower=saved;
});
