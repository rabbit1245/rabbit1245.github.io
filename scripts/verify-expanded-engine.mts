import {pathToFileURL} from 'node:url';
const root=process.argv[2]??process.cwd(),mode=process.argv[3]??'levels';
const get=async (name:string)=>import(pathToFileURL(`${root}/src/game/${name}.ts`).href);
const {createCareer}=await get('engine'),{FIELD_ATTRIBUTES,POSITION_ATTRIBUTES,overall}=await get('attributes'),{simulateMatch}=await get('match-engine'),{getClub}=await get('data');
const c=createCareer({name:'확장 대조 실험',nationality:'대한민국',age:27,height:184,weight:80,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'EN1_01',squad:'senior',difficulty:'realistic',seed:'expanded-control-2120',training:[]});
const positions=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM','GK'];
const fixture={id:'control:fixture',round:1,homeId:'EN1_01',awayId:'EN1_02',played:false};
function options(own=85,opp=85){const roster=(id:string,level:number)=>positions.map((position,i)=>({id:`control:${id}:${i}`,clubId:id,name:`가상 대조 선수 ${i}`,position,ovr:level}));return {home:{...getClub(fixture.homeId),power:own},away:{...getClub(fixture.awayId),power:opp},homePlayers:roster(fixture.homeId,own),awayPlayers:roster(fixture.awayId,opp),detailed:false,forceSelection:{from:0,to:90,started:true}};}
function profile(level:number){const attributes=Object.fromEntries(FIELD_ATTRIBUTES.map((k:string)=>[k,Math.min(120,level)])),skills=level===130?POSITION_ATTRIBUTES.ST.slice(0,5):[];const player={...c.player,attributes,playSkills:skills,skillMastery:Object.fromEntries(skills.map((k:string)=>[k,20])),form:75,fitness:100};player.ovr=overall(player);return {...c,player};}
if(mode==='hash'){
 const {createHash}=await import('node:crypto');const hash=createHash('sha256');for(const level of [80,120,130])for(let i=0;i<20;i++)hash.update(JSON.stringify(simulateMatch({...profile(level),seed:`pure-${i}`},fixture,options())));console.log(hash.digest('hex'));
}else if(mode==='perf'){
 const p=profile(80),o=options();for(let i=0;i<80;i++)simulateMatch({...p,seed:`perf-${i}`},fixture,o);
 const batches=[];for(let batch=0;batch<5;batch++){global.gc?.();const start=performance.now(),cpu=process.cpuUsage();let events=0,bytes=0;for(let i=0;i<400;i++){const m=simulateMatch({...p,seed:`perf-${i}`},fixture,o);events+=m.events.length;if(i<30)bytes+=JSON.stringify(m).length;}const used=process.cpuUsage(cpu);batches.push({wallMs:performance.now()-start,cpuMs:(used.user+used.system)/1000,eventsPerMatch:events/400,sourceBytesPerMatch:bytes/30});}
 console.log(JSON.stringify({root,batches,heapAfterGC:(global.gc?.(),process.memoryUsage().heapUsed)},null,2));
}else{
 const rows=[];for(const level of [85,100,110,120,130]){const p=profile(level),row={level,ovr:p.player.ovr,games:600,goals:0,assists:0,shots:0,wins:0,draws:0,losses:0};for(let i=0;i<row.games;i++){const m=simulateMatch({...p,seed:`level-${i}`},fixture,options());row.goals+=m.playerStats.goals;row.assists+=m.playerStats.assists;row.shots+=m.playerStats.shots;row.wins+=Number(m.homeGoals>m.awayGoals);row.draws+=Number(m.homeGoals===m.awayGoals);row.losses+=Number(m.homeGoals<m.awayGoals);}rows.push(row);}
 const p=profile(130),weak={games:600,wins:0,draws:0,losses:0};for(let i=0;i<weak.games;i++){const m=simulateMatch({...p,seed:`weak-${i}`},fixture,options(60,95));weak.wins+=Number(m.homeGoals>m.awayGoals);weak.draws+=Number(m.homeGoals===m.awayGoals);weak.losses+=Number(m.homeGoals<m.awayGoals);}
 console.log(JSON.stringify({rows,weakTeam130Against95:weak},null,2));
 if(rows.some((r,i)=>i&&r.goals<=rows[i-1].goals)||weak.losses===0)throw Error('High-ability comparison or non-guarantee failed');
}
