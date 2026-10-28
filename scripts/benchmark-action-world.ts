import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
async function main(){
  const root=process.cwd(),oldRoot=process.env.KBALL_ACTION_BASELINE||'/workspace/kball-action-benchmark/baseline';
  const versions={before:await import(pathToFileURL(`${oldRoot}/src/game/engine.ts`).href),after:await import(pathToFileURL(`${root}/src/game/engine.ts`).href)};
  const times:Record<string,number[]>={before:[],after:[]},fixtures:Record<string,number>={};
  for(let trial=-1;trial<3;trial++)for(const label of trial%2===0?['after','before']:['before','after']){
    const engine=versions[label as keyof typeof versions];let c=engine.createCareer({name:'세계 진행 성능',nationality:'대한민국',age:26,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:'프레싱 포워드',clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'action-world-performance-2100',training:[]});
    global.gc?.();const start=performance.now();c=engine.advanceCareer(c,2);const elapsed=performance.now()-start;if(c.season.week!==2)throw new Error('진행 라운드 불일치');
    if(trial>=0){times[label].push(elapsed);fixtures[label]=Object.values(c.systems.world.competitions).reduce((n:number,l:any)=>n+l.fixtures.filter((f:any)=>f.played).length,0);}
  }
  const median=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const report={baseline:versions.before.ENGINE_VERSION,trials:3,leagueRoundsPerTrial:2,sameMachineAlternatingTrials:true,wholeWorldAndCareerProgression:true,timesMs:times,medianBeforeMs:median(times.before),medianAfterMs:median(times.after),ratio:median(times.after)/median(times.before),worldFixturesPlayed:fixtures};
  const out=process.env.KBALL_ACTION_RESULTS||'test-results/release-2.10.0';await mkdir(out,{recursive:true});await writeFile(`${out}/world-performance.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
