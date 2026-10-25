import {writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createCareer,setPlaySkill,advanceCareer,stayAtClub,setTraining,startNextSeason,retireCareer,dismissChoice} from '../src/game/engine';
import {attributeWeights,FIELD_ATTRIBUTES,overall} from '../src/game/attributes';
import {validateCareer,exportCareer} from '../src/game/storage';
import {buildCareerText,careerSeasonRecords} from '../src/game/career-text';
import {getNationalTotals} from '../src/game/national';
import type {AttributeKey} from '../src/game/types';
const out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/release-2.8.0';mkdirSync(out,{recursive:true});
for(const file of ['native-career.json','career-year-1.json','career-year-10.json','career-year-20.json','first-120.json','retired.json','retired.txt'])rmSync(out+'/'+file,{force:true});
const years=Number(process.env.KBALL_LONG_SEASONS||20),start=2026,style='포처';
const skills=(Object.entries(attributeWeights('ST',style))as[AttributeKey,number][]).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k])=>k);
let c=createCareer({name:'플레이스킬 장기검수',nationality:'포르투갈',age:16,height:180,weight:75,foot:'right',position:'ST',talent:'SSS',style,clubId:'EN1_01',squad:'senior',difficulty:'realistic',seed:'complete-career-280',training:skills.slice(0,3),intensity:'intense'});
for(const key of skills)c=setPlaySkill(c,key,true);
const initial={...c.player.attributes},results=[];let oldHash='',reached120=false;
const stable=()=>createHash('sha256').update(JSON.stringify({...c.history[0],details:{...c.history[0].details,clubDevelopment:undefined}})).digest('hex');
async function main(){
 for(let n=1;n<=years;n++){
  const started=performance.now();
  if(n===11)c=setPlaySkill(c,'shooting',false);
  if(n===13){const prior=c.player.ovr;c=setPlaySkill(c,'shooting',true);assert.equal(c.player.ovr,prior,'reacquiring an old skill gives no instant bonus');}
  while(c.stage==='season'){if(c.systems!.pendingChoice)c=dismissChoice(c);const old=c.season.week;c=advanceCareer(c,120);assert.ok(c.stage!=='season'||c.season.week>old||c.systems!.pendingChoice,'career must progress');}
  validateCareer(c);assert.equal(c.player.ovr,overall(c.player));
  for(const key of FIELD_ATTRIBUTES)if(!skills.includes(key))assert.ok((c.player.attributes[key]??0)<=(initial[key]??0),'unchecked skill grew: '+key);
  if(n===1)oldHash=stable();else assert.equal(stable(),oldHash,'old season source data changed');
  const h=c.history.at(-1)!,annual=careerSeasonRecords(c).find(r=>r.year===h.year)!,r={elapsedMs:Math.round(performance.now()-started),heapMB:Math.round(process.memoryUsage().heapUsed/1048576),season:n,year:h.year,age:c.player.age,ovr:c.player.ovr,rank:h.rank,goals:h.stats.goals,assists:h.stats.assists,caps:getNationalTotals(c).apps,skills:annual.playSkills,awards:h.awards.map(a=>a.name),injuredRounds:c.systems!.growthLedger?.injuredRounds??0};
  assert.equal(annual.playSkills.includes('스나이퍼'),!(n===11||n===12));assert.ok(!r.awards.some(a=>a.startsWith('K볼 선정')));
  results.push(r);console.log(JSON.stringify(r));
  if(c.player.ovr===120&&!reached120){reached120=true;writeFileSync(out+'/first-120.json',await exportCareer(c));}
  if([1,10,years].includes(n))writeFileSync(out+`/career-year-${n}.json`,await exportCareer(c));
  writeFileSync(out+'/native-career.json',JSON.stringify({method:'Full actual world, cups and national windows. SSS starts at age 16, no cheats, no forced selections/results, 3 selected training attributes rotate each season. Shooting skill is removed in season 11 and reacquired in season 13. Original historical data hashes exclude only the earned development metadata attached at transition.',reached120,results},null,2));
  if(n<years){c=stayAtClub(c);const train=[...(c.player.playSkills??[])].sort((a,b)=>(c.player.attributes[a]??0)-(c.player.attributes[b]??0)).slice(0,3);c=setTraining(c,train,'intense');c=startNextSeason(c);validateCareer(c);}
 }
 c=retireCareer(c);validateCareer(c);const txt=buildCareerText(c);assert.ok(!txt.includes('낭만'));assert.ok(!txt.split('C. 연도별 기록')[0].includes('플레이스타일'));
 writeFileSync(out+'/retired.json',await exportCareer(c));writeFileSync(out+'/retired.txt',txt);
 if(years>=20)assert.ok(reached120,'normal full career must reach 120');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
