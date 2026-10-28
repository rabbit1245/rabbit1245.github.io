import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
async function main(){
  const root=process.cwd(),oldRoot=process.env.KBALL_ACTION_BASELINE||'/workspace/kball-action-benchmark/baseline';
  const load=async(base:string)=>({engine:await import(pathToFileURL(`${base}/src/game/engine.ts`).href),match:await import(pathToFileURL(`${base}/src/game/match-engine.ts`).href),world:await import(pathToFileURL(`${base}/src/game/world.ts`).href)});
  const versions={before:await load(oldRoot),after:await load(root)},prepared:any={};
  for(const [label,v]of Object.entries(versions)){
    const c=v.engine.createCareer({name:'행동 엔진 성능',nationality:'대한민국',age:26,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:'프레싱 포워드',clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'action-performance-2100',training:[]});
    const f=c.season.fixtures.find((f:any)=>f.homeId===c.player.clubId);prepared[label]={c,f,options:{homePlayers:v.world.getWorldClubPlayers(c,f.homeId),awayPlayers:v.world.getWorldClubPlayers(c,f.awayId),detailed:false,forceSelection:{from:0,to:90,started:true}}};
  }
  const times:Record<string,number[]>={before:[],after:[],beforeNPC:[],afterNPC:[]},events:Record<string,number>={};
  for(let trial=-1;trial<5;trial++)for(const condition of ['before','after','beforeNPC','afterNPC']){
    const npc=condition.endsWith('NPC'),label=npc?condition.slice(0,-3):condition;
    global.gc?.();const v=versions[label as keyof typeof versions],p=prepared[label],start=performance.now();let eventCount=0;
    for(let i=0;i<1000;i++){p.c.seed=`action-bench-${i}`;eventCount+=v.match.simulateMatch(p.c,p.f,npc?{...p.options,userParticipates:false,recordActionEvents:false}:p.options).events.length;}
    if(trial>=0){times[condition].push(performance.now()-start);events[condition]=eventCount;}
  }
  const median=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],before=median(times.before),after=median(times.after);
  const report={matchesPerTrial:1000,trials:5,baseline:versions.before.engine.ENGINE_VERSION,sameMachineAlternatingTrials:true,calculationsAndFullActionSources:true,timesMs:times,medianBeforeMs:before,medianAfterMs:after,ratio:after/before,npcMedianBeforeMs:median(times.beforeNPC),npcMedianAfterMs:median(times.afterNPC),npcRatio:median(times.afterNPC)/median(times.beforeNPC),events};
  const out=process.env.KBALL_ACTION_RESULTS||'test-results/release-2.10.0';await mkdir(out,{recursive:true});await writeFile(`${out}/engine-performance.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
