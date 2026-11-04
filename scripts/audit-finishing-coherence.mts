import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.env.KBALL_AUDIT_ROOT??process.cwd();
const {createCareer,makeFixtures,ENGINE_VERSION}=await import(root+'/src/game/engine.ts');
const {FIELD_ATTRIBUTES,PLAY_STYLES,overall,overallParts}=await import(root+'/src/game/attributes.ts');
const {simulateMatch}=await import(root+'/src/game/match-engine.ts');
const {getClub,CLUBS}=await import(root+'/src/game/data.ts');
const {getClubWorldPower,getWorldClubPlayers}=await import(root+'/src/game/world.ts');
const {validateActionLedger}=await import(root+'/src/game/action-metrics.ts');
const samples=Number(process.env.KBALL_FINISHING_SAMPLES??760),rows=[];
const positions=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM','GK'];
const core=['defending','tackling','pressing','passing','decisions'];
const brain=['positioning','anticipation','decisions','composure','vision'];
const base=createCareer({name:'마무리 연동 대조',nationality:'포르투갈',age:27,height:180,weight:75,foot:'right',position:'CDM',talent:'SSS',style:PLAY_STYLES.CDM[0],clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'finishing-coherence',training:[]});
base.id='finishing-audit';base.player.id='finishing-audit-player';
function profile(kind:string,setPieces=65){
 const skills=kind.startsWith('brain')?brain:core,peak=kind.startsWith('brain')?120:105;
 const fixed={shooting:68,finishing:63,heading:60,setPieces};
 const player={...base.player,attributes:{},playSkills:skills,skillMastery:Object.fromEntries(skills.map(k=>[k,peak-100]))};
 let lo=0,hi=100;
 for(let i=0;i<40;i++){const value=(lo+hi)/2;player.attributes={...Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,value])),...fixed,...Object.fromEntries(skills.map(k=>[k,peak]))};if(overallParts(player).total<100)lo=value;else hi=value;}
 if(kind.endsWith('finisher'))Object.assign(player.attributes,{shooting:95,finishing:95,heading:90});
 if(kind.endsWith('setpiece'))player.attributes.setPieces=100;
 if(kind==='uniform65'||kind==='uniform90'){player.playSkills=[];player.skillMastery={};player.attributes=Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,kind==='uniform65'?65:90]));}
 player.ovr=overall(player);return {...base,player};
}
if(process.env.KBALL_FINISHING_LEAGUES_ONLY!=='1')for(const level of [65,80,90])for(const kind of ['core','core-finisher','core-setpiece','brain','brain-finisher','uniform65','uniform90']){
 const c=profile(kind),roster=(clubId:string)=>positions.map((position,i)=>({id:`finishing:${clubId}:${i}`,name:`대조 ${i}`,clubId,position,ovr:level})),home={...getClub('EN1_12'),power:level},away={...getClub('EN1_13'),power:level},options={home,away,homePlayers:roster(home.id),awayPlayers:roster(away.id),forceSelection:{from:0,to:90,started:true},detailed:false};
 const counts={goals:0,shots:0,onTarget:0,assists:0,headers:0,penalties:0,freeKicks:0,oneOnOnes:0,oneOnOneGoals:0,openGoals:0,teamGoals:0,against:0,recoveries:0,progressive:0},seasons=[];let seasonGoals=0;
 const nonScoring=createHash('sha256');
 const started=performance.now();
 for(let i=0;i<samples;i++){
  const m=simulateMatch({...c,seed:`finishing-paired-${i}`},{id:'finishing-paired',round:i%38+1,homeId:home.id,awayId:away.id,played:false},options),s=m.playerStats;
  counts.goals+=s.goals;counts.shots+=s.shots;counts.onTarget+=s.shotsOnTarget;counts.assists+=s.assists;counts.headers+=s.headerGoals??0;counts.penalties+=s.penaltyGoals??0;counts.freeKicks+=s.freeKickGoals??0;counts.teamGoals+=m.homeGoals;counts.against+=m.awayGoals;counts.recoveries+=s.ballRecoveries??0;counts.progressive+=s.progressivePasses??0;
  const byId=new Map(m.events.map(e=>[e.id,e]));for(const e of m.events){if(e.playerId!==c.player.id)continue;if(e.type==='shot'&&e.detail==='일대일 슈팅')counts.oneOnOnes++;if(e.type==='goal'){const type=byId.get(e.relatedId!)?.detail;if(type==='일대일 슈팅')counts.oneOnOneGoals++;if(type==='슈팅')counts.openGoals++;}}
  nonScoring.update(JSON.stringify(m.performers.map(p=>({id:p.id,minutes:p.minutes,passes:p.stats.passes,completed:p.stats.passesCompleted,progressive:p.stats.progressivePasses,tackles:p.stats.tackles,interceptions:p.stats.interceptions,pressure:p.stats.pressureRecoveries,dribbles:p.stats.dribblesCompleted}))));
  if(i<3){validateActionLedger(m,c.player.id);if(m.playerStats.goals>m.homeGoals)throw Error('double score');}
  seasonGoals+=s.goals;if(i%38===37){seasons.push(seasonGoals);seasonGoals=0;}
 }
 const row={kind,level,ovr:c.player.ovr,attributes:c.player.attributes,playSkills:c.player.playSkills,samples,forced90:true,counts,per38:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,Number((v/samples*38).toFixed(3))])),seasonGoals:seasons,nonScoringHash:nonScoring.digest('hex'),ms:performance.now()-started};rows.push(row);console.log(JSON.stringify({kind,level,ovr:row.ovr,per38:row.per38,ms:row.ms}));
}
const leagues=[];
if(process.env.KBALL_FINISHING_LEAGUES_ONLY==='1')for(const clubId of ['EN1_12','ES1_01'])for(const kind of ['brain','brain-finisher','core']){
 const c=profile(kind,45);c.player.clubId=clubId;
 const club=getClub(clubId),ids=CLUBS.filter(p=>p.leagueId===club.leagueId).map(p=>p.id),fixtures=makeFixtures(ids,2026).filter(f=>f.homeId===clubId||f.awayId===clubId),teams=new Map(ids.map(id=>[id,{club:{...getClub(id),power:getClubWorldPower(c,id)},players:getWorldClubPlayers(c,id)}])),seasons=Number(process.env.KBALL_FINISHING_LEAGUE_SEASONS??20),samples=[];
 const hash=createHash('sha256');
 for(let i=0;i<seasons;i++){
  const totals={goals:0,assists:0,shots:0,onTarget:0,headers:0,freeKicks:0,penalties:0,oneOnOneGoals:0,teamGoals:0,against:0,points:0,minutes:0,recoveries:0,progressive:0};
  for(const f of fixtures){
   const h=teams.get(f.homeId)!,a=teams.get(f.awayId)!,m=simulateMatch({...c,seed:'finishing-league-paired-'+i},f,{home:h.club,away:a.club,homePlayers:h.players,awayPlayers:a.players,forceSelection:{from:0,to:90,started:true},detailed:false}),s=m.playerStats,home=f.homeId===clubId,gf=home?m.homeGoals:m.awayGoals,ga=home?m.awayGoals:m.homeGoals;
   totals.goals+=s.goals;totals.assists+=s.assists;totals.shots+=s.shots;totals.onTarget+=s.shotsOnTarget;totals.headers+=s.headerGoals??0;totals.freeKicks+=s.freeKickGoals??0;totals.penalties+=s.penaltyGoals??0;totals.teamGoals+=gf;totals.against+=ga;totals.points+=gf>ga?3:gf===ga?1:0;totals.minutes+=s.minutes;totals.recoveries+=s.ballRecoveries??0;totals.progressive+=s.progressivePasses??0;
   const byId=new Map(m.events.map(e=>[e.id,e]));for(const e of m.events)if(e.type==='goal'&&e.playerId===c.player.id&&byId.get(e.relatedId!)?.detail==='일대일 슈팅')totals.oneOnOneGoals++;
   hash.update(JSON.stringify(m.performers.map(p=>({id:p.id,minutes:p.minutes,passes:p.stats.passes,completed:p.stats.passesCompleted,progressive:p.stats.progressivePasses,tackles:p.stats.tackles,interceptions:p.stats.interceptions,pressure:p.stats.pressureRecoveries,dribbles:p.stats.dribblesCompleted}))));
   if(i===0)validateActionLedger(m,c.player.id);
  }samples.push(totals);
 }
 const row={clubId,club:club.name,league:club.leagueId,kind,ovr:c.player.ovr,attributes:c.player.attributes,fixtures:fixtures.length,seasons,forced90:true,mean:Object.fromEntries(Object.keys(samples[0]).map(k=>[k,Number((samples.reduce((n,s)=>n+s[k],0)/seasons).toFixed(3))])),goals:samples.map(s=>s.goals),nonScoringHash:hash.digest('hex'),samples};leagues.push(row);console.log(JSON.stringify({...row,attributes:undefined,samples:undefined}));
}
const output=process.env.KBALL_FINISHING_OUTPUT??'test-results/finishing-coherence/after.json';await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify({version:ENGINE_VERSION,samples,scope:'Controlled independent 90-minute samples with reset fitness and fixed teammates, not the actual user save or evolving career seasons. Consecutive sets of 38 are sampling blocks; league runs use actual game schedules, club powers and rosters, with setPieces 45.',rows,leagues},null,2)+'\n');
