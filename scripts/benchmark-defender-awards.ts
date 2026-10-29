import {pathToFileURL} from 'node:url';import {gzipSync} from 'node:zlib';
import {writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
async function main(){
const root=process.env.KBALL_PROFILE_ROOT||process.cwd();
const {createCareer,advanceHalf,overall}=await import(pathToFileURL(root+'/src/game/engine.ts').href);
const {FIELD_ATTRIBUTES,PLAY_STYLES}=await import(pathToFileURL(root+'/src/game/attributes.ts').href);
const {validateCareer}=await import(pathToFileURL(root+'/src/game/storage.ts').href);
const {beginGrowthSeason}=await import(pathToFileURL(root+'/src/game/growth.ts').href);
const rows=[];
for(const [position,clubId,winning] of JSON.parse(process.env.KBALL_CASES||'[["CB","IT1_01",5],["CB","EN1_11",5],["RWB","IT1_01",10],["RW","IT1_01",5]]')){
 let c=createCareer({name:'수비수 수상 실측',nationality:'네덜란드',age:26,height:187,weight:82,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId,squad:'senior',difficulty:'realistic',seed:'defender-award-2113',training:[]});
 for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=92;c.player.ovr=overall(c.player);c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;c.managerTrust=90;c.systems.attributeLocks=[...FIELD_ATTRIBUTES];c.systems.personality={leadership:winning===10?6:5,stardom:5,fairPlay:5,clutch:5,winning};
 beginGrowthSeason(c);
 const t=Date.now();console.log('START',position,clubId,winning);
 c=advanceHalf(c);console.log('HALF',position,c.season.week,Date.now()-t);c=advanceHalf(c);validateCareer(c,true);
 const rank=c.systems.rankings.at(-1),d=rank.diagnostics.find(d=>d.name==='발롱도르');
 const result={position,clubId,winning,leadership:c.systems.personality.leadership,ovr:c.player.ovr,ms:Date.now()-t,leagueRank:c.season.table.findIndex(r=>r.clubId===clubId)+1,league:c.season.table.find(r=>r.clubId===clubId),stats:c.season.playerStats,ballonRank:rank.playerRank,diagnostic:d,awards:c.awards.map(a=>a.name),candidatePositions:rank.candidates.map(r=>({position:r.position,score:r.score,stats:r.stats})),cups:c.systems.clubCompetitions.current.map(t=>({id:t.id,winnerId:t.winnerId,phase:t.phase,ownStats:t.playerStats?.[c.player.id]?.stats}))};
 if(process.env.KBALL_PROFILE_SAVE==='1'){await mkdir(path.dirname(process.env.KBALL_PROFILE_OUT||'test-results/defender-2113/actual'),{recursive:true});await writeFile((process.env.KBALL_PROFILE_OUT||'test-results/defender-2113/actual')+`-${position}-${clubId}.json.gz`,gzipSync(JSON.stringify(c)));}
 rows.push(result);console.log('RESULT',JSON.stringify({...result,candidatePositions:undefined,cups:result.cups.map(t=>({id:t.id,winnerId:t.winnerId,phase:t.phase}))}));await mkdir(path.dirname(process.env.KBALL_PROFILE_OUT||'test-results/defender-2113/actual.json'),{recursive:true});await writeFile(process.env.KBALL_PROFILE_OUT||'test-results/defender-2113/actual.json',JSON.stringify(rows,null,2));
}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
