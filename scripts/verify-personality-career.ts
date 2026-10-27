import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createCareer,advanceHalf,startNextSeason,overall,setAllAttributeLocks,setPersonalityValues,respondToCaptainOffer,acceptTransfer,ENGINE_VERSION} from '../src/game/engine';
import {FIELD_ATTRIBUTES} from '../src/game/attributes';
import {beginGrowthSeason} from '../src/game/growth';
import {emptyStats} from '../src/game/math';
import {DEFAULT_PERSONALITY} from '../src/game/personality';
import {getCaptainAssessment} from '../src/game/captain';
import {getClubWorldPower} from '../src/game/world';
import {userInfluencedClub} from '../src/game/club-balance';
import {validateCareer,exportCareer,verifySaveText} from '../src/game/storage';
import type {Career} from '../src/game/types';

function acceptLeadership(c:Career){
  const order={none:0,vice:1,captain:2};
  for(const offer of c.systems!.leadership.offers??[])if(offer.status==='pending'&&order[getCaptainAssessment(c,offer.scope).eligibleRole]>=order[offer.role])c=respondToCaptainOffer(c,offer.id,true);
  return c;
}
async function main(){
  const out=process.env.KBALL_PERSONALITY_CAREER_DIR||'test-results/release-2.9.6/careers';await mkdir(out,{recursive:true});
  let base=createCareer({name:'95 압박형 공격수 통제 검사',nationality:'대한민국',age:26,height:184,weight:80,foot:'right',position:'ST',talent:'SSS',style:'프레싱 포워드',clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'pressing-career-296',training:[]});
  for(const key of FIELD_ATTRIBUTES)base.player.attributes[key]=95;base.player.ovr=overall(base.player);base.player.potential=Math.max(base.player.potential,95);base.season.attributeStart={...base.player.attributes};base.season.ovrStart=95;
  beginGrowthSeason(base);base.systems!.firstHalfSnapshot={attributes:{...base.player.attributes},stats:emptyStats(),ovr:95,value:base.systems!.economics.marketValue,round:0};base=setAllAttributeLocks(base,true);
  const baselines=new Map(Object.values(base.systems!.world.clubs).map(t=>[t.id,t.development!.basePower])),attributes={...base.player.attributes};
  const all:Record<string,unknown>={};
  for(const label of ['default5','high10']){
    let c=structuredClone(base);if(label==='high10')c=setPersonalityValues(c,{...DEFAULT_PERSONALITY,leadership:10,stardom:10,clutch:10,winning:10});
    const rows=[];
    for(let i=0;i<3;i++){
      c=acceptLeadership(advanceHalf(c));c=acceptLeadership(advanceHalf(c));validateCareer(c);assert.deepEqual(c.player.attributes,attributes);
      const s=c.season.playerStats,w=c.systems!.world,offers=c.systems!.leadership.offers??[];
      const maxNpcRise=Math.max(...Object.values(w.clubs).filter(t=>!userInfluencedClub(c,t.id)).map(t=>getClubWorldPower(c,t.id)-baselines.get(t.id)!));assert.ok(maxNpcRise<=6.51);
      rows.push({year:c.season.year,rank:c.season.table.findIndex(r=>r.clubId===c.player.clubId)+1,points:c.season.table.find(r=>r.clubId===c.player.clubId)!.points,apps:s.apps,goals:s.goals,assists:s.assists,tackles:s.tackles,interceptions:s.interceptions,rating:s.ratingCount?Number((s.ratingSum/s.ratingCount).toFixed(3)):0,power:getClubWorldPower(c,c.player.clubId),investment:w.clubs[c.player.clubId].development?.investmentPower??0,clubRole:c.systems!.leadership.clubRole,offers:offers.filter(o=>o.year===c.season.year).map(o=>({scope:o.scope,role:o.role,round:o.round,status:o.status})),awards:c.awards.filter(a=>a.year===c.season.year).map(a=>a.name),maxNpcRise});
      console.log(label,JSON.stringify(rows.at(-1)));await writeFile(`${out}/${label}-progress.json`,JSON.stringify(rows,null,2)+'\n');
      if(i<2){const renewal=c.offers.find(o=>o.clubId===c.player.clubId);assert.ok(renewal);c=startNextSeason(acceptTransfer(c,renewal.id));}
    }
    const text=await exportCareer(c),loaded=await verifySaveText(text);assert.deepEqual(loaded.awards,JSON.parse(JSON.stringify(c.awards)));await writeFile(`${out}/${label}.json`,text);all[label]=rows;
  }
  const report={version:ENGINE_VERSION,userSaveReproduction:false,controlledProfile:'all field attributes 95; ST pressing forward; Liverpool; age 26; locked abilities; three actual whole-world seasons per arm; same starting seed; valid captain offers and renewals accepted',arms:all,attributesUnchanged:true,JSONRoundTrips:true};
  await writeFile(`${out}/results.json`,JSON.stringify(report,null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
