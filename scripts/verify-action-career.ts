import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createCareer,advanceHalf,advanceCareer,startNextSeason,acceptTransfer,retireCareer,setAllAttributeLocks,overall,ENGINE_VERSION} from '../src/game/engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,PLAY_STYLES} from '../src/game/attributes';
import {beginGrowthSeason} from '../src/game/growth';
import {ACTION_STATS,ACTION_COUNTERS,emptyStats,sumStats} from '../src/game/math';
import {actionEventTotals,actionCoverage,validateActionLedger} from '../src/game/action-metrics';
import {careerMatchLedger,careerRecordTotals,buildCareerText,careerStatsLines,STAT_TEXT} from '../src/game/career-text';
import {validateCareer,exportCareer,verifySaveText} from '../src/game/storage';
import type {Career} from '../src/game/types';
const protectedFiles=['attributes.ts','play-skills.ts','growth.ts','career-systems.ts','global-honours.ts','award-rules.ts','tournament-awards.ts','extra-honours.ts','achievement-evidence.ts'].map(f=>`src/game/${f}`);
function reconcile(c:Career){
  const ledger=careerMatchLedger(c),matches=[...ledger.club,...ledger.national],totals=careerRecordTotals(c).all,fromMatches=sumStats(matches.map(m=>m.playerStats));
  for(const key of ACTION_STATS)assert.equal(totals[key],fromMatches[key],`${key}: record totals differ from source matches`);
  for(const m of matches)if(m.actionVersion===1){validateActionLedger(m,c.player.id);const events=actionEventTotals(m.events).get(c.player.id);for(const key of ACTION_COUNTERS)assert.equal(m.playerStats[key],events?.[key]??0);}
  const lines=careerStatsLines(totals,matches).join('\n');for(const key of ACTION_COUNTERS)if(actionCoverage(totals).known)assert.ok(lines.includes(`${STAT_TEXT[key]}: ${totals[key]}`));
  return {matches:matches.length,clubMatches:ledger.club.length,nationalMatches:ledger.national.length,totals:Object.fromEntries(ACTION_STATS.map(k=>[k,totals[k]])),coverage:actionCoverage(totals)};
}
async function main(){
  execFileSync('git',['diff','--exit-code','--',...protectedFiles]);
  const out=process.env.KBALL_ACTION_RESULTS||'test-results/release-2.10.0';await mkdir(`${out}/careers`,{recursive:true});const results:Record<string,unknown>={};
  for(const position of ['CB','GK'] as const){
    if(process.argv.includes('--resume-careers')){const text=await readFile(`${out}/careers/${position}-season.json`,'utf8'),c=await verifySaveText(text),r=await verifySaveText(await readFile(`${out}/careers/${position}-retired.json`,'utf8')),seasons=JSON.parse(await readFile(`${out}/careers/${position}-progress.json`,'utf8'));validateCareer(c);validateCareer(r);assert.deepEqual(reconcile(c),reconcile(r));assert.deepEqual(seasons.at(-1).totals,reconcile(c).totals);results[position]={seasons,retirement:true,JSONRoundTrip:true,bytes:Buffer.byteLength(text)};continue;}
    let c=createCareer({name:`세부 행동 ${position} 검수`,nationality:'대한민국',age:25,height:190,weight:85,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:`action-career-${position}-2100`,training:[]});
    for(const key of position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES)c.player.attributes[key]=95;if(position==='GK')c.player.attributes.gkHandling=70;
    c.player.ovr=overall(c.player);c.player.potential=Math.max(c.player.potential,c.player.ovr);c.season.ovrStart=c.player.ovr;c.season.attributeStart={...c.player.attributes};beginGrowthSeason(c);c.systems!.firstHalfSnapshot={attributes:{...c.player.attributes},stats:emptyStats(),ovr:c.player.ovr,value:c.systems!.economics.marketValue,round:0};c=setAllAttributeLocks(c,true);
    const attrs={...c.player.attributes},seasons=[];
    for(let i=0;i<2;i++){
      c=advanceHalf(advanceHalf(c));validateCareer(c);assert.deepEqual(c.player.attributes,attrs);const checked=reconcile(c);seasons.push({year:c.season.year,...checked});console.log(position,JSON.stringify(seasons.at(-1)));await writeFile(`${out}/careers/${position}-progress.json`,JSON.stringify(seasons,null,2)+'\n');
      if(i===0){const renewal=c.offers.find(o=>o.clubId===c.player.clubId);assert.ok(renewal);c=startNextSeason(acceptTransfer(c,renewal.id));}
    }
    const text=await exportCareer(c),loaded=await verifySaveText(text);assert.deepEqual(reconcile(loaded),reconcile(c));await writeFile(`${out}/careers/${position}-season.json`,text);
    const retired=retireCareer(c);validateCareer(retired);assert.deepEqual(reconcile(retired),reconcile(c));await writeFile(`${out}/careers/${position}-retired.json`,await exportCareer(retired));await writeFile(`${out}/careers/${position}.txt`,buildCareerText(retired));results[position]={seasons,retirement:true,JSONRoundTrip:true,bytes:Buffer.byteLength(text)};
  }
  let legacy=await verifySaveText(await readFile('test-results/release-2.9.5/fixtures/season.json','utf8'));const oldYear=legacy.season.year,oldStats=JSON.stringify(legacy.history[0].stats),renewal=legacy.offers.find(o=>o.clubId===legacy.player.clubId);assert.ok(renewal);
  legacy=advanceHalf(startNextSeason(acceptTransfer(legacy,renewal.id)));validateCareer(legacy);assert.equal(JSON.stringify(legacy.history.find(h=>h.year===oldYear)!.stats),oldStats);const mixed=reconcile(legacy);assert.ok(mixed.coverage.known&&mixed.coverage.partial);assert.ok(buildCareerText(legacy).includes('과거 미집계 제외'));await writeFile(`${out}/careers/legacy-mixed.json`,await exportCareer(legacy));results.mixedLegacy={...mixed,pastStatsUnchanged:true};
  let long=await verifySaveText(await readFile('test-results/release-2.9.4/liverpool/career.json','utf8'));const longPast=structuredClone(long.history),longYears=long.history.length,longRenewal=long.offers.find(o=>o.clubId===long.player.clubId);assert.ok(longRenewal);
  long=advanceCareer(startNextSeason(acceptTransfer(long,longRenewal.id)),2);validateCareer(long);
  const compared=structuredClone(long.history);let settled=false;for(let i=0;i<longPast.length;i++)if(!longPast[i].details?.clubDevelopment&&compared[i].details?.clubDevelopment){assert.equal(i,longPast.length-1);assert.equal(compared[i].details!.clubDevelopment!.year,longPast[i].year);delete compared[i].details!.clubDevelopment;settled=true;}assert.deepEqual(compared,longPast);
  const longChecked=reconcile(long);assert.ok(longChecked.coverage.known&&longChecked.coverage.partial);const longText=await exportCareer(long);assert.deepEqual(reconcile(await verifySaveText(longText)),longChecked);await writeFile(`${out}/careers/long-mixed.json`,longText);results.longLegacy={...longChecked,pastSeasons:longYears,newLeagueRounds:2,pastRecordsUnchanged:true,existingSeasonSettlementCompleted:settled,JSONRoundTrip:true,bytes:Buffer.byteLength(longText)};
  const report={version:ENGINE_VERSION,actualWholeWorldSeasons:4,legacyNextHalfSeason:true,sourceEventReconciliation:true,protectedSystemsUnchanged:protectedFiles,results};await writeFile(`${out}/action-careers.json`,JSON.stringify(report,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
