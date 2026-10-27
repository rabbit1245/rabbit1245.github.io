import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createCareer,overall,ENGINE_VERSION} from '../src/game/engine';
import {FIELD_ATTRIBUTES} from '../src/game/attributes';
import {simulateMatch} from '../src/game/match-engine';
import {getClub} from '../src/game/data';
import {getWorldClubPlayers} from '../src/game/world';
import {DEFAULT_PERSONALITY} from '../src/game/personality';
import type {Career} from '../src/game/types';

async function main(){
  const out=process.env.KBALL_PRESSING_DIR||'test-results/release-2.9.6',label=process.env.KBALL_PRESSING_LABEL||'after';await mkdir(out,{recursive:true});
  const c=createCareer({name:'압박형 공격수 통제 검사',nationality:'대한민국',age:26,height:184,weight:80,foot:'right',position:'ST',talent:'SSS',style:'프레싱 포워드',clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'pressing-control-296',training:[]});
  for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=95;c.player.ovr=overall(c.player);assert.equal(c.player.ovr,95);
  const attributes={...c.player.attributes},f=c.season.fixtures.find(f=>f.homeId===c.player.clubId)!,home={...getClub(f.homeId),power:72},away={...getClub(f.awayId),power:72};
  const options={home,away,homePlayers:getWorldClubPlayers(c,home.id).map(p=>({...p,ovr:72})),awayPlayers:getWorldClubPlayers(c,away.id).map(p=>({...p,ovr:72})),forceSelection:{from:0,to:90,started:true},detailed:false};
  const records:Record<string,any>={};
  for(const kind of ['pressing','poacher','winning10','final5','final10']){
    let rating=0,goals=0,assists=0,tackles=0,interceptions=0,teamGF=0,teamGA=0,points=0;
    for(let i=0;i<320;i++){
      const career:Career={...c,seed:`pressing-paired-${i}`,player:{...c.player,style:kind==='poacher'?'포처':c.player.style},systems:{...c.systems!,personality:{...DEFAULT_PERSONALITY,...(kind==='winning10'?{winning:10}:kind==='final10'?{clutch:10}:{})}}};
      const match=simulateMatch(career,kind.startsWith('final')?{...f,id:`UCL:2026|final|${i}`} :f,options),s=match.playerStats;
      rating+=match.playerRating;goals+=s.goals;assists+=s.assists;tackles+=s.tackles;interceptions+=s.interceptions;teamGF+=match.homeGoals;teamGA+=match.awayGoals;points+=match.homeGoals>match.awayGoals?3:match.homeGoals===match.awayGoals?1:0;
    }
    records[kind]={matches:320,points,teamGF,teamGA,goals,assists,tackles,interceptions,meanRating:Number((rating/320).toFixed(3))};
  }
  assert.deepEqual(c.player.attributes,attributes);
  const report={version:ENGINE_VERSION,label,controlledFixture:true,userSaveReproduction:false,profile:'all 20 field attributes 95; ST pressing forward; equal 72-power peer teams; forced 90 minutes; 320 paired seeds per condition',attributesUnchanged:true,records};
  await writeFile(`${out}/pressing-${label}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
