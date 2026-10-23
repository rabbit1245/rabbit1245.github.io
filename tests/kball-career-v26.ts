import 'fake-indexeddb/auto';
import {webcrypto} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createCareer,advanceCareer,startNextSeason,stayAtClub,setTraining,overall,manuallyAge,retireCareer,getCareerTotals} from '../src/game/engine';
import {beginGrowthSeason} from '../src/game/growth';
import {cupLedger,cupMatches} from '../src/game/club-competitions';
import {validateCareer,exportCareer,importCareer} from '../src/game/storage';
import {nationalAudit} from '../src/game/national-audit';
import {careerMatchLedger,buildCareerText} from '../src/game/career-text';
import {sumStats} from '../src/game/math';
if(!globalThis.crypto?.subtle)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
async function main(){
 let c=createCareer({name:'6시즌 연결 검증',nationality:'프랑스',age:18,height:180,weight:75,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'EN1_13',squad:'senior',difficulty:'realistic',seed:'full-six-season-v26'});
 for(const k of Object.keys(c.player.attributes))c.player.attributes[k as keyof typeof c.player.attributes]=97;c.player.ovr=overall(c.player);c.player.potential=99;c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;c.managerTrust=95;beginGrowthSeason(c);
 const records=[];
 for(let i=0;i<6;i++){
  c=advanceCareer(c,120);validateCareer(c);assert.equal(c.stage,'offseason');assert.ok(cupLedger(c,c.season.year).every(t=>t.phase==='completed'));
  const all=careerMatchLedger(c);assert.deepEqual(getCareerTotals(c,'club'),sumStats(all.club.map(m=>m.playerStats)));assert.deepEqual(getCareerTotals(c,'national'),sumStats(all.national.map(m=>m.playerStats)));
  const record={year:c.season.year,age:c.player.age,ovr:c.player.ovr,league:c.season.playerStats,cupMatches:cupMatches(c,c.season.year).length,awards:c.awards.filter(a=>a.year===c.season.year).map(a=>a.name),ballon:c.systems!.rankings.at(-1)?.playerRank,clubRank:c.season.table.findIndex(r=>r.clubId===c.player.clubId)+1,national:nationalAudit(c).slice(0,3)};records.push(record);console.log('verified',JSON.stringify(record));
  if(i<5){c=stayAtClub(c);c=setTraining(c,c.training,c.intensity);if(i===2)c=manuallyAge(c,5);const attributes={...c.player.attributes},age=c.player.age;c=startNextSeason(c);assert.deepEqual(c.player.attributes,attributes);assert.equal(c.player.age,age+1);validateCareer(c);}
 }
 const totals=getCareerTotals(c);c=retireCareer(c);assert.deepEqual(getCareerTotals(c),totals);const exported=await exportCareer(c),loaded=await importCareer(exported);assert.deepEqual(getCareerTotals(loaded),totals);assert.equal(loaded.systems!.manualAging!.length,1);
 const ledger=careerMatchLedger(c);assert.equal(new Set([...ledger.club,...ledger.national].map(m=>m.fixtureId)).size,ledger.club.length+ledger.national.length);
 const text=buildCareerText(c);assert.match(text,/수동 노화/);assert.match(text,/UEFA 챔피언스리그/);assert.match(text,/국가대표 커리어/);assert.doesNotMatch(text,/"playerId"|"byCause"/);
 mkdirSync('test-results/p26',{recursive:true});writeFileSync('test-results/p26/new-career-six-seasons.json',exported);writeFileSync('test-results/p26/new-career-six-seasons.txt',text);writeFileSync('test-results/p26/career-six-results.json',JSON.stringify({records,saveBytes:Buffer.byteLength(exported),txtBytes:Buffer.byteLength(text),clubMatches:ledger.club.length,nationalMatches:ledger.national.length,totals,retirement:true,saveReload:true},null,2));console.log('six seasons, retirement and full export verified');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
