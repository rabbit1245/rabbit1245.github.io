import 'fake-indexeddb/auto';
import {readFile,writeFile} from 'node:fs/promises';
import {leagueAwardRules,AWARD_MODEL_VERSION} from '../src/game/award-rules';
import {clubAwardRules} from '../src/game/club-awards';
import {cupLedger} from '../src/game/club-competitions';
import {exportCareer,verifySaveText,validateCareer} from '../src/game/storage';
import {retireCareer} from '../src/game/engine';
import type {Award} from '../src/game/types';

// Presentation-only synthetic records cover every new label/filter, independently of
// sporting outcomes. Actual adjudication is tested by european-awards.test and a real season.
async function main(){
const out=process.env.KBALL_AWARDS_DIR||'test-results/release-2.9.5';
const c=await verifySaveText(await readFile(`${out}/fixtures/season.json`,'utf8'));
const additions:Award[]=[];
for(const [league,club]of [['ES1','ES1_01'],['DE1','DE1_01'],['FR1','FR1_01']]){
  const rule=leagueAwardRules(league,league).find(r=>r.metric==='performance')!;
  additions.push({id:`layout:${league}:${rule.id}`,year:c.season.year,clubId:club,name:rule.name,category:'league',official:true,verification:'game-model',ruleVersion:AWARD_MODEL_VERSION,description:'수상 화면 표시 전용 합성 기록. 실제 시즌 수상 판정의 근거로 사용하지 않습니다.'});
}
for(const code of ['UCL','UEL','UECL']){
  const t=cupLedger(c).find(t=>t.id.startsWith(`${code}:`))!;
  for(const rule of clubAwardRules(t).filter(r=>r.metric!=='performance'))additions.push({id:`layout:${t.id}:${rule.id}`,year:c.season.year,clubId:c.player.clubId,name:rule.name,category:'continental-individual',official:true,verification:'game-model',ruleVersion:AWARD_MODEL_VERSION,description:'수상 화면 표시 전용 합성 기록. 실제 시즌 수상 판정의 근거로 사용하지 않습니다.'});
}
c.awards.push(...additions);c.history[0].awards.push(...additions);validateCareer(c);
await writeFile(`${out}/fixtures/layout-retired.json`,await exportCareer(retireCareer(c)));
await writeFile(`${out}/layout-fixture.json`,JSON.stringify({syntheticAwardRecords:true,testsPresentationOnly:true,adjudicationEvidence:['award-rules.tap','actual-season.json'],newAwards:additions.map(a=>({id:a.id,name:a.name}))},null,2)+'\n');

}
main().catch(error=>{console.error(error);process.exitCode=1;});
