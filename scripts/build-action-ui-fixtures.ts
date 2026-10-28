import {mkdir,writeFile} from 'node:fs/promises';
import {createCareer,overall} from '../src/game/engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,PLAY_STYLES} from '../src/game/attributes';
import {ACTION_STATS,sumStats} from '../src/game/math';
import {simulateMatch} from '../src/game/match-engine';
import type {Position} from '../src/game/types';
async function main(){
  const base=createCareer({name:'지표 화면 검수',nationality:'대한민국',age:25,height:184,weight:80,foot:'right',position:'ST',talent:'S',style:'포처',clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'action-ui-2100',training:[]}),f=base.season.fixtures.find(f=>f.homeId===base.player.clubId)!;
  const cases:Record<string,unknown>={};
  for(const position of Object.keys(PLAY_STYLES) as Position[]){
    const player={...base.player,position,style:PLAY_STYLES[position][0],attributes:Object.fromEntries((position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES).map(k=>[k,85]))};player.ovr=overall(player);
    const c={...base,player},matches=Array.from({length:40},(_,i)=>simulateMatch({...c,seed:`layout-${position}-${i}`},f,{forceSelection:{from:0,to:90,started:true},detailed:false}));
    const known=sumStats(matches.map(m=>m.playerStats)),legacy={...known};for(const key of ACTION_STATS)delete legacy[key];cases[position]={known,legacy,mixed:sumStats([known,legacy])};
  }
  await mkdir('test-results/release-2.10.0',{recursive:true});await writeFile('test-results/release-2.10.0/metric-fixtures.json',JSON.stringify({generatedFromActualMatchEvents:true,cases},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
