import {pathToFileURL} from 'node:url';import {writeFile,mkdir} from 'node:fs/promises';
async function main(){
const root=process.env.KBALL_PROFILE_ROOT||process.cwd();
const {createCareer,calculateTable,overall}=await import(pathToFileURL(root+'/src/game/engine.ts').href),{FIELD_ATTRIBUTES,PLAY_STYLES}=await import(pathToFileURL(root+'/src/game/attributes.ts').href),{getClub}=await import(pathToFileURL(root+'/src/game/data.ts').href),{getWorldClubPlayers,getClubWorldPower}=await import(pathToFileURL(root+'/src/game/world.ts').href),{simulateMatch}=await import(pathToFileURL(root+'/src/game/match-engine.ts').href),{emptyStats,addStats}=await import(pathToFileURL(root+'/src/game/math.ts').href);
const rows=[],allMeans=[],count=Number(process.env.KBALL_SAMPLES||16);
for(const clubId of ['EN1_06','EN1_12','EN1_11']){
 const base=createCareer({name:'92 수비수 리그 대조',nationality:'네덜란드',age:26,height:187,weight:82,foot:'right',position:'CB',talent:'SSS',style:PLAY_STYLES.CB[0],clubId,squad:'senior',difficulty:'realistic',seed:'defender-leagues-2113',training:[]});
 const competition=base.systems.world.competitions.EN1;
 for(let seed=0;seed<count;seed++){
  base.seed='defender-leagues-'+seed;
  const plainPowers=new Map(competition.table.map(r=>[r.clubId,getClubWorldPower(base,r.clubId)])),plainRosters=new Map(competition.table.map(r=>[r.clubId,getWorldClubPlayers(base,r.clubId)]));
  const fixtures=competition.fixtures.map(f=>({...f}));
  for(const f of fixtures){if([f.homeId,f.awayId].includes(clubId))continue;const m=simulateMatch(base,f,{home:{...getClub(f.homeId),power:plainPowers.get(f.homeId)},away:{...getClub(f.awayId),power:plainPowers.get(f.awayId)},homePlayers:plainRosters.get(f.homeId),awayPlayers:plainRosters.get(f.awayId),userParticipates:false,detailed:false,recordActionEvents:false});Object.assign(f,{played:true,homeGoals:m.homeGoals,awayGoals:m.awayGoals});}
  for(const developed of [false,true])for(const mode of ['absent','75','92','92-winning10']){
   const own=base.systems.world.clubs[clubId],before={prestige:own.development.prestige,investmentPower:own.development.investmentPower};
   if(developed){own.development.prestige=95;own.development.investmentPower=7;}
   const level=mode==='75'?75:92;for(const key of FIELD_ATTRIBUTES)base.player.attributes[key]=level;base.player.ovr=overall(base.player);base.systems.personality={leadership:mode==='92-winning10'?6:5,stardom:5,fairPlay:5,clutch:5,winning:mode==='92-winning10'?10:5};
   base.player.squad=mode==='absent'?'youth':'senior';
   const power=getClubWorldPower(base,clubId),roster=getWorldClubPlayers(base,clubId),schedule=fixtures.map(f=>({...f})),stats=emptyStats();
   for(const f of schedule){if(![f.homeId,f.awayId].includes(clubId))continue;const home=f.homeId===clubId,away=f.awayId===clubId;const m=simulateMatch(base,f,{home:{...getClub(f.homeId),power:home?power:plainPowers.get(f.homeId)},away:{...getClub(f.awayId),power:away?power:plainPowers.get(f.awayId)},homePlayers:home?roster:plainRosters.get(f.homeId),awayPlayers:away?roster:plainRosters.get(f.awayId),userParticipates:mode!=='absent',detailed:false,forceSelection:{from:0,to:90,started:true}});Object.assign(f,{played:true,homeGoals:m.homeGoals,awayGoals:m.awayGoals});addStats(stats,m.playerStats);}
   const table=calculateTable(schedule,competition.table.map(r=>r.clubId)),row=table.find(r=>r.clubId===clubId);
   rows.push({clubId,developed,mode,seed,power,rank:table.indexOf(row)+1,points:row.points,gf:row.goalsFor,ga:row.goalsAgainst,stats});Object.assign(own.development,before);
  }
 }
 const means=[false,true].flatMap(developed=>['absent','75','92','92-winning10'].map(mode=>{const subset=rows.filter(r=>r.clubId===clubId&&r.developed===developed&&r.mode===mode);return {clubId,developed,mode,meanPoints:subset.reduce((n,r)=>n+r.points,0)/count,meanPower:subset.reduce((n,r)=>n+r.power,0)/count,meanRank:subset.reduce((n,r)=>n+r.rank,0)/count,titles:subset.filter(r=>r.rank===1).length,samples:count};}));allMeans.push(...means);console.log(JSON.stringify(means));await mkdir('test-results/defender-2113',{recursive:true});await writeFile(process.env.KBALL_PROFILE_OUT||'test-results/defender-2113/leagues.json',JSON.stringify({method:'Real EPL squads/full schedules, paired seeds per case, exact same non-user results reused across matched cases; fixed full availability; developed clubs use explicitly specified prestige 95 / paid investment 7, not an actual 14-season user save',means:allMeans,rows},null,2));
}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
