import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createCareer,advanceCareer,startNextSeason,setTraining,setAttributeLock} from '../src/game/engine';
import {cupLedger} from '../src/game/club-competitions';
import {PLAY_STYLES} from '../src/game/attributes';
import {validateCareer,exportCareer} from '../src/game/storage';
import {buildCareerText} from '../src/game/career-text';
import assert from 'node:assert/strict';
async function main(){
 await mkdir('test-results/p27/long',{recursive:true});let c=createCareer({name:'20시즌 통합 검증',nationality:'대한민국',age:23,height:183,weight:78,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'p27-career-twenty'});
 c=setAttributeLock(c,'speed',true);const locked=c.player.attributes.speed,results=[];
 for(let n=1;n<=20;n++){
  const begin=performance.now(),before=c.season.year;c=advanceCareer(c,120);const elapsed=performance.now()-begin;assert.equal(c.stage,'offseason');assert.equal(c.player.attributes.speed,locked);assert.deepEqual(c.systems!.growthLedger!.byCause.aging,{});assert.equal(c.offers.filter(o=>o.type==='transfer').length,6);
  const cups=cupLedger(c,c.season.year);assert.ok(cups.every(t=>t.phase==='completed'),`unfinished ${before}: ${cups.filter(t=>t.phase!=='completed').map(t=>t.name)}`);
  const world=cups.find(t=>t.id.startsWith('CLUB_WORLD_CUP:'));if(world){assert.equal((c.season.year-2025)%4,0);assert.equal(world.entrants.length,32);assert.equal(world.fixtures.length,63);assert.ok(world.winnerId);}
  const inter=cups.find(t=>t.id.startsWith('INTERCONTINENTAL:'));if(n>1){assert.ok(inter);assert.equal(inter.fixtures.length,5);assert.ok(inter.winnerId);}
  validateCareer(c);const row={seasons:n,year:before,age:c.player.age,ms:elapsed,heap:process.memoryUsage().heapUsed,rss:process.memoryUsage().rss,leagueApps:c.season.playerStats.apps,cupApps:cups.reduce((s,t)=>s+t.matches.reduce((x,m)=>x+m.playerStats.apps,0),0),cups:cups.length,world:world?{entrants:world.entrants,winner:world.winnerId,matches:world.fixtures.length}:null,inter:inter?{winner:inter.winnerId,matches:inter.fixtures.length}:null};results.push(row);console.log(JSON.stringify(row));
  if([1,10,20].includes(n))await writeFile(`test-results/p27/long/career-${n}.json`,await exportCareer(c));
  if(n<20)c=startNextSeason(setTraining(c,c.training,c.intensity));
 }
 await writeFile('test-results/p27/long/summary.json',JSON.stringify(results,null,2));await writeFile('test-results/p27/long/career-20.txt',buildCareerText(c));console.log('TWENTY_SEASONS_PASSED');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
