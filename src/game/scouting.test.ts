import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,emptyStats} from './engine';
import {PLAY_STYLES} from './attributes';
import {scoutingProfile,scoutingReports} from './scouting';
import {makeContractOffers} from './career-systems';
import {getLeague} from './data';
function prospect(){const c=createCareer({name:'유망주',nationality:'대한민국',age:20,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:PLAY_STYLES.ST[0],clubId:'KR2_01',squad:'senior',difficulty:'realistic',seed:'scout-prospect-v23'});c.player.ovr=62;c.player.potential=90;c.stage='offseason';c.season.week=c.season.totalWeeks;c.season.playerStats={...emptyStats(),apps:30,starts:28,minutes:2450,goals:25,assists:7,ratingCount:30,ratingSum:225};c.systems!.economics.contract.expiresYear=c.season.year+1;return c;}
test('a 25-goal K2 prospect earns realistic higher-division attention and affordable proposals without guaranteed elite offers',()=>{
 const c=prospect(),reports=scoutingReports(c),upper=reports.filter(r=>c.systems!.world.clubs[r.clubId].leagueId==='KR1');assert.ok(upper.length>0);assert.ok(upper.some(r=>r.offerEligible));
 const offers=makeContractOffers(c,'offseason').filter(o=>o.type==='transfer');assert.ok(offers.some(o=>getLeague(c.systems!.world.clubs[o.clubId].leagueId).tier===1));
 assert.ok(offers.length===6);for(const o of offers){assert.ok(o.fee<=c.systems!.world.clubs[o.clubId].budget);if(o.band==='higher')assert.ok(c.systems!.world.clubs[o.clubId].power>c.player.ovr);else if(o.band==='lower')assert.ok(c.systems!.world.clubs[o.clubId].power<c.player.ovr);}
 const poor=prospect();poor.season.playerStats=emptyStats();assert.ok(scoutingProfile(c).projected>scoutingProfile(poor).projected);assert.ok(scoutingReports(poor).filter(r=>r.offerEligible&&poor.systems!.world.clubs[r.clubId].leagueId==='KR1').length<upper.filter(r=>r.offerEligible).length);
});
test('potential and role-specific actual performance help scouting without bypassing present ability',()=>{
 const c=prospect();c.player.ovr=40;c.season.playerStats=emptyStats();assert.ok(scoutingReports(c).every(r=>c.systems!.world.clubs[r.clubId].power<70));
 const keeper=prospect();keeper.player.position='GK';keeper.season.playerStats={...emptyStats(),apps:30,minutes:2700,saves:135,shotsFaced:165,cleanSheets:14,ratingCount:30,ratingSum:222};assert.ok(scoutingProfile(keeper).performance>0);
});
