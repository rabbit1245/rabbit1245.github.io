import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createCareer,advanceCareer,overall} from './engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {simulateMatch} from './match-engine';
import {actionCoverage,actionEventTotals,validateActionLedger} from './action-metrics';
import {ACTION_COUNTERS,ACTION_STATS,emptyStats,sumStats} from './math';
import {careerStatsLines,buildCareerText} from './career-text';
import {validateCareer,exportCareer,verifySaveText} from './storage';
import {performanceScore} from './career-systems';
import {tournamentPerformance} from './tournament-awards';
import type {AttributeKey,Career,MatchRecord,Player,Position} from './types';

const base=createCareer({name:'행동 기록 검수',nationality:'대한민국',age:25,height:184,weight:80,foot:'right',position:'ST',talent:'S',style:'포처',clubId:'EN1_12',squad:'senior',difficulty:'realistic',seed:'action-metrics-2100',training:[]});
const positions:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','ST','RW','CM','CB'];
const players=(clubId:string)=>positions.map((position,i)=>({id:`${clubId}:peer:${i}`,name:`검수 ${i}`,clubId,position,ovr:70,nationality:'대한민국'}));
const fixture={id:'action-fixture',round:1,homeId:'EN1_12',awayId:'EN1_13',played:false};
const options={home:{id:'EN1_12',name:'검수 홈',nativeName:'Home',country:'영국',leagueId:'EN1',power:70,color:'#fff'},away:{id:'EN1_13',name:'검수 원정',nativeName:'Away',country:'영국',leagueId:'EN1',power:70,color:'#fff'},homePlayers:players('EN1_12'),awayPlayers:players('EN1_13'),forceSelection:{from:0,to:90,started:true},detailed:false};
function profile(position:Position):Career{
  const attributes=Object.fromEntries((position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES).map(k=>[k,80]));
  const player={...base.player,position,style:PLAY_STYLES[position][0],attributes};player.ovr=overall(player);
  return {...base,player};
}
function balanced(position:Position,special:Partial<Record<AttributeKey,number>>,target=80):Career{
  let low=1,high=100,c=profile(position);
  for(let i=0;i<40;i++){
    const rest=(low+high)/2;c={...c,player:{...c.player,attributes:{...Object.fromEntries((position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES).map(k=>[k,rest])),...special}}};c.player.ovr=overall(c.player);
    if(c.player.ovr===target)return c;if(c.player.ovr<target)low=rest;else high=rest;
  }
  assert.fail(`cannot balance ${position} profile at ${target}`);
}
const game=(c:Career,i:number,detailed=false)=>simulateMatch({...c,seed:`new-actions-${i}`},fixture,{...options,detailed});

test('all 16 positions produce source-backed, non-duplicated counters and preserve input abilities',()=>{
  for(const position of Object.keys(PLAY_STYLES) as Position[]){
    const c=profile(position),before=JSON.stringify(c.player);
    for(let i=0;i<10;i++){
      const m=game(c,i);validateActionLedger(m,c.player.id);assert.equal(m.actionVersion,1);
      for(const p of m.performers!){const s=p.stats;assert.ok(s.headerGoals!<=s.goals);assert.ok(s.progressivePasses!<=s.passesCompleted);assert.ok(s.punches!+(s.crossesCaught??0)<=(s.crossesFaced??0));assert.equal(s.actionApps,s.apps);assert.equal(s.actionMinutes,s.minutes);}
      assert.equal(m.performers!.reduce((n,p)=>n+p.stats.goals,0),m.homeGoals+m.awayGoals);
      assert.equal(m.playerStats.goals,m.events.filter(e=>e.type==='goal'&&e.playerId===c.player.id).length);
      const byId=new Map(m.events.map(e=>[e.id,e]));
      for(const assist of m.events.filter(e=>e.type==='assist')){const goal=byId.get(assist.relatedId!),shot=goal&&byId.get(goal.relatedId!);if(shot?.action?.kind==='headerShot')assert.equal(assist.playerId,byId.get(shot.relatedId!)!.playerId,'header assist must belong to its actual cross supplier');}
    }
    assert.equal(JSON.stringify(c.player),before);
  }
});

test('equal-OVR aerial and technical strikers have different actual header shot and goal shares',()=>{
  const aerial=balanced('ST',{heading:100,jumping:100,positioning:95,strength:95}),technical=balanced('ST',{heading:40,jumping:40,positioning:70,strength:60});assert.equal(aerial.player.ovr,technical.player.ovr);
  let a=0,b=0,ag=0,bg=0,as=0,bs=0;
  for(let i=0;i<300;i++)for(const [c,high]of [[aerial,true],[technical,false]] as const){const m=game(c,i),headers=m.events.filter(e=>e.playerId===c.player.id&&e.action?.kind==='headerShot').length;if(high){a+=m.playerStats.headerGoals!;ag+=m.playerStats.goals;as+=headers;}else{b+=m.playerStats.headerGoals!;bg+=m.playerStats.goals;bs+=headers;}}
  assert.ok(as>bs*2,`${as} vs ${bs} header shots`);assert.ok(a>0&&a/Math.max(1,ag)>b/Math.max(1,bg)*2,`${a}/${ag} vs ${b}/${bg} headed goals`);
});

test('aerial centre backs head real set-piece deliveries without losing ordinary aerial contests',()=>{
  const c=balanced('CB',{heading:100,jumping:100,strength:100,positioning:95});let goals=0,contests=0;
  for(let i=0;i<180;i++){
    const m=game(c,i);validateActionLedger(m,c.player.id);goals+=m.playerStats.headerGoals!;contests+=m.playerStats.aerialWon!;
    for(const e of m.events.filter(e=>e.playerId===c.player.id&&e.action?.kind==='headerShot')){assert.equal(e.action!.kind,'headerShot');if(e.action!.kind==='headerShot')assert.equal(e.action!.phase,'setPiece');const cross=m.events.find(x=>x.id===e.relatedId)!;assert.ok(m.events.some(s=>s.id===cross.relatedId&&s.type==='setPiece'));}
  }
  assert.ok(goals>5);assert.ok(contests>goals);
});

test('pressing strength and work rate distinguish equal-OVR forwards, wingers and midfielders',()=>{
  for(const position of ['ST','LW','CM','CDM','CB'] as Position[]){
    const high=balanced(position,{defending:100,anticipation:95,teamwork:95,decisions:95,stamina:100,speed:95},75),low=balanced(position,{defending:35,anticipation:45,teamwork:55,decisions:55,stamina:45,speed:55},75);assert.equal(high.player.ovr,low.player.ovr);
    let a=0,b=0;for(let i=0;i<100;i++){a+=game(high,i).playerStats.pressingWins!;b+=game(low,i).playerStats.pressingWins!;}assert.ok(a>b*1.5&&a>15,`${position}: ${a} vs ${b}`);
  }
});

test('pressure attempts require a separate possession recovery and cannot duplicate tackles or interceptions',()=>{
  const c=profile('ST');c.player.style='프레싱 포워드';let m:MatchRecord|undefined;
  for(let i=0;i<30;i++){const candidate=game(c,i,true);if(candidate.events.some(e=>e.type==='recovery'&&candidate.events.find(p=>p.id===e.relatedId)?.playerId===c.player.id)){m=candidate;break;}}
  assert.ok(m);const recovery=m.events.find(e=>e.type==='recovery')!;
  const missing=structuredClone(m);missing.events=missing.events.filter(e=>e.id!==recovery.id);assert.throws(()=>validateActionLedger(missing,c.player.id),/회복|구분|불일치/);
  const duplicate=structuredClone(m);duplicate.events.push({...structuredClone(recovery),id:`${recovery.id}:duplicate`});assert.throws(()=>validateActionLedger(duplicate,c.player.id),/두 번/);
  const tackle=structuredClone(m);tackle.events.push({...structuredClone(recovery),id:'duplicate-tackle',type:'tackle',action:undefined});assert.throws(()=>validateActionLedger(tackle,c.player.id),/중복/);
  const falseSuccess=structuredClone(m);falseSuccess.playerStats.pressingWins!++;assert.throws(()=>validateActionLedger(falseSuccess,c.player.id),/불일치/);
});

test('equal-OVR build-up defenders and playmakers advance zones with completed passes, not sideways labels',()=>{
  for(const position of ['CB','LB','CDM','CAM'] as Position[]){
    const high=balanced(position,{passing:100,vision:100,decisions:95,ballControl:95},70),low=balanced(position,{passing:40,vision:40,decisions:50,ballControl:50},70);assert.equal(high.player.ovr,low.player.ovr);
    let a=0,b=0;for(let i=0;i<100;i++){const m=game(high,i,true),n=game(low,i);a+=m.playerStats.progressivePasses!;b+=n.playerStats.progressivePasses!;const actual=m.events.filter(e=>e.playerId===high.player.id&&e.type==='pass'&&e.action?.kind==='phasePass'&&e.action.completed&&e.action.toZone>e.action.fromZone).length;assert.equal(m.playerStats.progressivePasses,actual);assert.ok(actual<=m.playerStats.passesCompleted);}
    assert.ok(a>b*1.5,`${position}: ${a} vs ${b}`);
  }
});

test('keepers choose between holding a cross and punching it safe; the same ball is never counted twice',()=>{
  const catcher=balanced('GK',{gkHandling:100,gkAerialCommand:90,gkPositioning:90,decisions:90}),puncher=balanced('GK',{gkHandling:40,gkAerialCommand:95,gkPositioning:95,decisions:95});assert.equal(catcher.player.ovr,puncher.player.ovr);
  let catchesA=0,catchesB=0,punchesA=0,punchesB=0,example:MatchRecord|undefined;
  for(let i=0;i<160;i++)for(const [c,high]of [[catcher,true],[puncher,false]] as const){const m=game(c,i);validateActionLedger(m,c.player.id);if(high){catchesA+=m.playerStats.crossesCaught!;punchesA+=m.playerStats.punches!;}else{catchesB+=m.playerStats.crossesCaught!;punchesB+=m.playerStats.punches!;}if(!example&&m.events.some(e=>e.playerId===c.player.id&&e.type==='punch'&&e.action?.kind==='airClaim'&&e.action.success))example=m;}
  assert.ok(catchesA>catchesB);assert.ok(punchesB>punchesA);assert.ok(example);
  const e=example.events.find(e=>e.type==='punch'&&e.action?.kind==='airClaim'&&e.action.success)!;const bad=structuredClone(example);bad.events.push({...e,id:'duplicate-catch',type:'catch',action:{kind:'airClaim',success:true,destination:'held'}});assert.throws(()=>validateActionLedger(bad,base.player.id),/중복/);
});

test('100-plus mastered attributes still affect actual header and progression decisions',()=>{
  const base100=profile('ST');for(const key of FIELD_ATTRIBUTES)base100.player.attributes[key]=100;base100.player.ovr=overall(base100.player);const mastered={...base100,player:{...base100.player,attributes:{...base100.player.attributes,heading:110,jumping:110,passing:110,vision:110},playSkills:['heading','jumping','passing','vision'] as AttributeKey[]}};mastered.player.ovr=overall(mastered.player);
  let a=0,b=0;for(let i=0;i<240;i++){a+=game(base100,i).playerStats.progressivePasses!;b+=game(mastered,i).playerStats.progressivePasses!;}assert.ok(b>a,`${a} vs ${b}`);
});

test('legacy unknown, measured zero and mixed coverage remain distinct in sums and Korean retirement text',async()=>{
  const old={...emptyStats(),apps:8,minutes:720};for(const key of ACTION_STATS)delete old[key];const modern={...emptyStats(),apps:2,minutes:180,actionApps:2,actionMinutes:180,headerGoals:1,goals:1,pressingWins:3,progressivePasses:4,punches:0};
  assert.equal(actionCoverage(old).known,false);assert.match(careerStatsLines(old,[]).join('\n'),/헤더 득점\(골\): 미집계/);
  const mixed=sumStats([old,modern]);assert.equal(mixed.headerGoals,1);assert.equal(mixed.actionApps,2);assert.equal(mixed.actionMinutes,180);assert.ok(actionCoverage(mixed).partial);assert.match(careerStatsLines(mixed,[]).join('\n'),/헤더 득점\(골\): 1 · 신규 집계 2\/10경기/);
  assert.match(careerStatsLines({...emptyStats(),apps:1,minutes:90,actionApps:1,actionMinutes:90},[]).join('\n'),/헤더 득점\(골\): 0/);
  const source=gunzipSync(readFileSync(new URL('../../tests/fixtures/v2-career.json.gz',import.meta.url))).toString();const legacy=JSON.parse(source),loaded=await verifySaveText(source);assert.equal(JSON.stringify(loaded),JSON.stringify(legacy.career));assert.equal(loaded.season.playerStats.actionApps,undefined);
});

test('header goal subsets and goalkeeper punch counts do not duplicate field-player award credit',()=>{
  // Pressure recoveries and progression now explicitly inform role-neutral
  // judging; the header subset must still never award the same goal twice.
  const c=profile('ST'),m=game(c,10),row={playerId:c.player.id,name:c.player.name,clubId:c.player.clubId,leagueId:c.season.leagueId,position:c.player.position,nationality:c.player.nationality,ovr:c.player.ovr,stats:{...m.playerStats,headerGoals:0}},copy={...row,stats:{...row.stats,headerGoals:row.stats.goals,punches:10}};
  assert.equal(performanceScore(row,c),performanceScore(copy,c));assert.equal(tournamentPerformance({id:c.player.id,...row}),tournamentPerformance({id:c.player.id,...copy}));
});

test('discarded NPC details use the same decisions and counters while career and national sources cannot be disabled',()=>{
  const c=profile('ST');
  for(let i=0;i<50;i++){
    const source={...c,seed:`transient-equality-${i}`},full=simulateMatch(source,fixture,{...options,userParticipates:false}),compact=simulateMatch(source,fixture,{...options,userParticipates:false,recordActionEvents:false});
    assert.equal(full.homeGoals,compact.homeGoals);assert.equal(full.awayGoals,compact.awayGoals);assert.deepEqual(full.performers,compact.performers);assert.deepEqual(full.playerStats,compact.playerStats);assert.ok(full.events.length>compact.events.length);
    const own=simulateMatch(source,fixture,{...options,recordActionEvents:false});assert.equal(own.actionVersion,1);validateActionLedger(own,c.player.id);
  }
});

test('real league progression saves and reloads all new event counters without changing progression systems',async()=>{
  const c=advanceCareer(base,2);validateCareer(c);const total=sumStats(c.season.matches.map(m=>m.playerStats));for(const key of ACTION_STATS)assert.equal(c.season.playerStats[key],total[key]);
  const loaded=await verifySaveText(await exportCareer(c));assert.deepEqual(loaded.season.playerStats,c.season.playerStats);assert.deepEqual(loaded.season.matches,JSON.parse(JSON.stringify(c.season.matches)));for(const label of ['헤더 득점','압박 성공','전진 패스 성공','펀칭 성공'])assert.ok(buildCareerText(c).includes(label));
  const bad=structuredClone(c);bad.season.playerStats.headerGoals=bad.season.playerStats.goals+1;assert.throws(()=>validateCareer(bad),/헤더/);
  const badPass=structuredClone(c);badPass.season.playerStats.progressivePasses=badPass.season.playerStats.passesCompleted+1;assert.throws(()=>validateCareer(badPass),/전진 패스/);
});
