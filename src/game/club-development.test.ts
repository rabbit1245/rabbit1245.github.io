import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,calculateTable} from './engine';
import {PLAY_STYLES} from './attributes';
import {assessClubSeason} from './club-development';
import {transitionWorldSeason,getClubWorldPower,getWorldClubPlayers} from './world';
const base=createCareer({name:'팀 성장',nationality:'대한민국',age:23,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:PLAY_STYLES.ST[0],clubId:'KR2_01',squad:'senior',difficulty:'realistic',seed:'club-reinvestment-v23'});
test('league overperformance funds actual roster development and prestige gradually, not a flat match bonus',()=>{
 const good=structuredClone(base),poor=structuredClone(base),id=base.player.clubId;
 for(const [c,wins] of [[good,true],[poor,false]] as const){const w=c.systems!.world,comp=w.competitions[c.season.leagueId];for(const f of comp.fixtures){f.played=true;const own=f.homeId===id||f.awayId===id;f.homeGoals=own?(f.homeId===id===wins?3:0):1;f.awayGoals=own?(f.awayId===id===wins?3:0):1;}comp.table=calculateTable(comp.fixtures,comp.table.map(t=>t.clubId));comp.round=comp.totalRounds;}
 const gw=good.systems!.world,pw=poor.systems!.world,gc=gw.clubs[id],pc=pw.clubs[id],initial=gc.power;
 const g=assessClubSeason(good,gc,gw.competitions.KR2.table,true),p=assessClubSeason(poor,pc,pw.competitions.KR2.table,true);assert.equal(g.rank,1);assert.ok(g.bonus>p.bonus);
 transitionWorldSeason(good);transitionWorldSeason(poor);const report=gc.development!.history.at(-1)!;
 assert.ok(report.bonus>0&&report.reinvestment>0);assert.ok(report.reinvestment<=report.bonus);assert.ok(report.recruits+report.improvedPlayers>0);assert.ok(getClubWorldPower(good,id)>getClubWorldPower(poor,id));assert.ok(Math.abs(gc.power-initial)<3,'no sudden team-wide jump');assert.ok(Math.abs(report.prestigeAfter-report.prestigeBefore)<3);
 const snapshot=JSON.stringify(gw);transitionWorldSeason(good);assert.equal(JSON.stringify(gw),snapshot);
});
test('personal ability follows transfers immediately and old clubs retain only their actual roster',()=>{
 const c=structuredClone(base),old=c.player.clubId,target='KR1_01';c.player.ovr=99;const before=getClubWorldPower(c,old);c.player.clubId=target;
 assert.ok(getClubWorldPower(c,old)<before);assert.ok(!getWorldClubPlayers(c,old).some(p=>p.id===c.player.id));assert.ok(getWorldClubPlayers(c,target).some(p=>p.id===c.player.id&&p.ovr===99));
});
test('unplayed historical seasons never acquire invented growth results',()=>{const c=structuredClone(base);transitionWorldSeason(c);assert.equal(c.systems!.world.clubs[c.player.clubId].development!.history.length,0);});
