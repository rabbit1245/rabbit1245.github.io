import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_ATTRIBUTES, GK_ATTRIBUTES } from './attributes';
import { ALL_STATS, emptyStats, sumStats } from './math';
import { simulateMatch } from './match-engine';
import { calculateTable,makeFixtures } from './engine';
import { ATTRIBUTE_EFFECTS, fieldMetrics, goalkeeperMetrics, per90, successRate } from './metrics';
import type { MatchOptions, MatchParticipant } from './revision-types';
import type { AttributeKey, Career, Club, Fixture, PlayerStats, Position } from './types';

const home:Club={id:'test-home',name:'실험 홈',nativeName:'실험 홈',country:'대한민국',leagueId:'TEST',power:65,color:'#123456'};
const away:Club={...home,id:'test-away',name:'실험 원정'};
const fixture:Fixture={id:'controlled-fixture',round:1,homeId:home.id,awayId:away.id,played:false};
const positions:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM','GK'];
const roster=(clubId:string):MatchParticipant[]=>positions.map((position,index)=>({id:`${clubId}-${index}`,name:`실험 선수 ${index}`,position,clubId,ovr:65}));
const settings:MatchOptions={home,away,homePlayers:roster(home.id),awayPlayers:roster(away.id),forceSelection:{from:0,to:90,started:true},detailed:false};
function career(position:Position='CM'):Career {
  const attributes=Object.fromEntries((position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES).map(key=>[key,65]));
  return {schemaVersion:1,id:'test-save',seed:'controlled-match',revision:0,createdAt:'2026-01-01',updatedAt:'2026-01-01',
    player:{id:'user',name:'통제 선수',nationality:'대한민국',age:24,height:180,weight:75,foot:'right',position,secondaryPositions:[],talent:'A',style:position==='GK'?'전통형 골키퍼':'연결형 미드필더',attributes,clubId:home.id,squad:'senior',fitness:100,morale:70,form:65,injuryWeeks:0,ovr:65,potential:90,wage:1000,contractYears:3},
    season:{year:2026,index:0,week:1,totalWeeks:38,leagueId:'TEST',competitionName:'통제 실험',fixtures:[],table:[],matches:[],playerStats:emptyStats(),ovrStart:65,attributeStart:attributes,completed:false},
    history:[],news:[],training:[],intensity:'balanced',transfers:[],offers:[],stage:'season',managerTrust:70,careerIncome:0,awards:[],difficulty:'realistic',processedCommands:[]};
}
const value=(s:PlayerStats,key:keyof PlayerStats)=>s[key]??0;
const freezeDeep=(object:unknown)=>{if(object&&typeof object==='object'){Object.freeze(object);for(const child of Object.values(object))freezeDeep(child);}};

test('paired complete league schedules turn individual actions into different points and rank distributions',t=>{
  const ids=[home.id,...Array.from({length:7},(_,i)=>`opponent-${i}`)],output=[];
  for(const level of [25,95]){
    let points=0,ranks=0,titles=0,goals=0;
    for(let seed=0;seed<40;seed++){
      const input=career('ST');input.seed=`league-impact-${seed}`;input.player.attributes=Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,level]));
      const schedule=makeFixtures(ids,2026);
      for(const f of schedule){
        // Include a genuinely stronger rival; a historical ace facing seven uniformly
        // weaker squads is a poor experiment for competitive title uncertainty.
        const strength=(id:string)=>id===ids[1]?80:65;
        const own=f.homeId===home.id||f.awayId===home.id,h={...home,id:f.homeId,power:strength(f.homeId)},a={...away,id:f.awayId,power:strength(f.awayId)};
        const record=simulateMatch(input,f,{home:h,away:a,homePlayers:roster(h.id).map(p=>({...p,ovr:h.power})),awayPlayers:roster(a.id).map(p=>({...p,ovr:a.power})),userParticipates:own,forceSelection:{from:0,to:90,started:true},detailed:false});
        f.played=true;f.homeGoals=record.homeGoals;f.awayGoals=record.awayGoals;
        if(own){assert.ok(record.playerStats.goals<=(f.homeId===home.id?record.homeGoals:record.awayGoals));goals+=record.playerStats.goals;}
      }
      const table=calculateTable(schedule,ids),rank=table.findIndex(row=>row.clubId===home.id)+1,row=table[rank-1];points+=row.points;ranks+=rank;titles+=+(rank===1);
      for(const r of table){assert.equal(r.played,r.won+r.drawn+r.lost);assert.equal(r.points,r.won*3+r.drawn);}
    }
    output.push({ability:level,meanPoints:points/40,meanRank:ranks/40,titles,goals});
  }
  assert.ok(output[1].meanPoints>output[0].meanPoints+3,JSON.stringify(output));assert.ok(output[1].meanRank<output[0].meanRank-.5,JSON.stringify(output));
  assert.ok(output[1].goals>output[0].goals);assert.ok(output[1].titles<40,'one excellent player never guarantees the title');t.diagnostic(JSON.stringify({paired40Seasons:output}));
});

test('a weak club’s world-class striker raises earned points without unbounded lower-league scoring',t=>{
  const ids=[home.id,...Array.from({length:19},(_,i)=>`weak-test-${i}`)],output=[];
  for(const ability of [25,90,95]){
    let points=0,ranks=0;const goals=[];
    for(let seed=0;seed<8;seed++){
      const input=career('ST');input.seed=`weak-season-${seed}`;input.player.attributes=Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,ability]));
      const schedule=makeFixtures(ids,2026);let ownGoals=0;
      for(const f of schedule){
        const strength=(id:string)=>id===home.id?50:50+Number(id.split('-').at(-1))%6*3;
        const own=f.homeId===home.id||f.awayId===home.id,h={...home,id:f.homeId,power:strength(f.homeId)},a={...away,id:f.awayId,power:strength(f.awayId)};
        const players=(id:string)=>roster(id).map(p=>({...p,ovr:strength(id)}));
        const m=simulateMatch(input,f,{home:h,away:a,homePlayers:players(h.id),awayPlayers:players(a.id),userParticipates:own,forceSelection:{from:0,to:90,started:true},detailed:false});
        f.played=true;f.homeGoals=m.homeGoals;f.awayGoals=m.awayGoals;
        if(own){ownGoals+=m.playerStats.goals;assert.ok(m.playerStats.goals<=(f.homeId===home.id?m.homeGoals:m.awayGoals));}
      }
      const table=calculateTable(schedule,ids),rank=table.findIndex(row=>row.clubId===home.id)+1;points+=table[rank-1].points;ranks+=rank;goals.push(ownGoals);
    }
    output.push({ability,meanPoints:points/8,meanRank:ranks/8,goals});
  }
  assert.ok(output[1].goals.every(g=>g>=30&&g<=80),JSON.stringify(output));assert.ok(output[2].goals.every(g=>g<90),JSON.stringify(output));assert.ok(output[2].meanPoints>output[0].meanPoints,JSON.stringify(output));assert.ok(output[2].meanRank<output[0].meanRank,JSON.stringify(output));t.diagnostic(JSON.stringify({weakClubEight38GameSeasons:output}));
});

test('seed replay is pure, and output verbosity does not change any performance',()=>{
  const input=career();const options=structuredClone(settings);freezeDeep(input);freezeDeep(options);
  const a=simulateMatch(input,fixture,options),b=simulateMatch(input,fixture,options);
  assert.deepEqual(a,b);
  const detailed=simulateMatch(input,fixture,{...options,detailed:true});
  assert.deepEqual(a.performers,detailed.performers);
  assert.deepEqual(a.playerStats,detailed.playerStats);
  assert.deepEqual(a.effects,detailed.effects);
});

test('scores, shot references, saves, assists and both-team MOM reconcile over 240 games',()=>{
  for(let index=0;index<240;index++){
    const input=career(index%2?'GK':'ST');input.seed=`ledger-${index}`;
    const record=simulateMatch(input,fixture,{...settings,detailed:true});
    const participants=record.performers!;
    assert.ok(participants.length>=22&&participants.length<=26);
    assert.equal(new Set(participants.map(p=>p.id)).size,participants.length);
    assert.equal(record.events.filter(e=>e.type==='goal'&&e.teamId===home.id).length,record.homeGoals);
    assert.equal(record.events.filter(e=>e.type==='goal'&&e.teamId===away.id).length,record.awayGoals);
    assert.equal(participants.reduce((sum,p)=>sum+p.stats.goals,0),record.homeGoals+record.awayGoals);
    assert.ok(participants.reduce((sum,p)=>sum+(p.stats.keyPasses??0),0)<=participants.reduce((sum,p)=>sum+p.stats.shots,0));
    const byId=new Map(record.events.map(e=>[e.id,e]));
    assert.equal(byId.size,record.events.length);
    for(const event of record.events){
      assert.ok(event.minute>0&&event.minute<=90||event.type==='substitution'&&event.minute===0);
      if(event.type==='goal'||event.type==='save')assert.equal(byId.get(event.relatedId!)?.type,'shot');
      if(event.type==='assist')assert.equal(byId.get(event.relatedId!)?.type,'goal');
    }
    for(const key of ['shots','goals','assists','saves'] as const){
      const type=key==='shots'?'shot':key==='goals'?'goal':key==='assists'?'assist':'save';
      assert.equal(record.playerStats[key],record.events.filter(e=>e.type===type&&e.playerId==='user').length,key);
    }
    assert.equal(record.playerStats.keyPasses,record.events.filter(e=>e.type==='keyPass'&&e.playerId==='user').length);
    for(const performer of participants){
      const s=performer.stats;
      for(const key of ALL_STATS)assert.ok(Number.isFinite(s[key])&&value(s,key)>=0,key);
      for(const [success,attempts] of [['passesCompleted','passes'],['shotsOnTarget','shots'],['goals','shotsOnTarget'],['tackles','tackleAttempts'],['dribblesCompleted','dribbleAttempts'],['aerialWon','aerialAttempts'],['saves','shotsFaced'],['oneOnOneSaves','oneOnOneAttempts'],['penaltiesSaved','penaltiesFaced'],['crossesCaught','crossesFaced'],['sweepingSuccesses','sweepingAttempts'],['buildUpCompleted','buildUpPasses'],['longKicksCompleted','longKicks'],['handlingSuccesses','handlingAttempts'],['lateSuccesses','lateActions']] as [keyof PlayerStats,keyof PlayerStats][])assert.ok(value(s,success)<=value(s,attempts),`${success}/${attempts}`);
      assert.equal(s.minutes,performer.minutes);assert.equal(s.detailedApps,s.apps);
      if(performer.position==='GK')assert.equal(s.shotsFaced,s.saves+s.goalsConceded);
    }
    const best=[...participants].sort((a,b)=>b.rating-a.rating||a.id.localeCompare(b.id))[0];
    assert.equal(record.momPlayerId,best.id);assert.equal(best.stats.mom,1);
    assert.equal(participants.reduce((sum,p)=>sum+(p.stats.mom??0),0),1);
    assert.deepEqual(participants.find(p=>p.id==='user')!.stats,record.playerStats);
  }
});

const fieldTargets:Record<string,keyof PlayerStats>={strength:'tackles',stamina:'lateSuccesses',speed:'dribbleAttempts',agility:'dribblesCompleted',jumping:'aerialWon',ballControl:'passesCompleted',dribbling:'dribblesCompleted',passing:'passesCompleted',crossing:'keyPasses',shooting:'shotsOnTarget',heading:'aerialWon',defending:'tackles',setPieces:'shotsOnTarget',decisions:'passesCompleted',vision:'keyPasses',anticipation:'interceptions',positioning:'shots',composure:'shotsOnTarget',concentration:'passesCompleted',teamwork:'passes'};
const keeperTargets:Record<string,keyof PlayerStats>={gkShotStopping:'saves',gkReflexes:'saves',gkHandling:'handlingSuccesses',gkAerialCommand:'crossesCaught',gkOneOnOnes:'oneOnOneSaves',gkPositioning:'sweepingSuccesses',gkDistribution:'buildUpCompleted',decisions:'sweepingSuccesses',concentration:'handlingSuccesses',gkDefensiveOrganization:'shotsFaced'};
for(const [position,attributes,targets] of [['CM',FIELD_ATTRIBUTES,fieldTargets],['GK',GK_ATTRIBUTES,keeperTargets]] as const){
  for(const attribute of attributes)test(`${position}: ${attribute} changes ${targets[attribute]} in its intended direction across 240 paired games with OVR held fixed`,()=>{
    const target=targets[attribute];let low=0,high=0;
    const baseline=career(position);
    for(let game=0;game<240;game++){
      const seed=`attribute-${position}-${attribute}-${game}`;
      const lower={...baseline,seed,player:{...baseline.player,attributes:{...baseline.player.attributes,[attribute]:25}}};
      const higher={...baseline,seed,player:{...baseline.player,attributes:{...baseline.player.attributes,[attribute]:95}}};
      assert.equal(lower.player.ovr,higher.player.ovr);
      const a=simulateMatch(lower,fixture,settings).playerStats,b=simulateMatch(higher,fixture,settings).playerStats;
      low+=value(a,target)+(attribute==='gkAerialCommand'?(a.punches??0):0);
      high+=value(b,target)+(attribute==='gkAerialCommand'?(b.punches??0):0);
    }
    const direction=attribute==='gkDefensiveOrganization'?-1:1;
    assert.ok((high-low)*direction>0,`${attribute}: low ${low/240}, high ${high/240}, target ${target}`);
    assert.ok(ATTRIBUTE_EFFECTS[attribute].metrics.includes(target));
  });
}

test('bench, injuries and red cards respect playing intervals; forced selection controls experiments',()=>{
  let injuries=0,reds=0;
  for(let index=0;index<500;index++){
    const input=career();input.seed=`availability-${index}`;
    const result=simulateMatch(input,fixture,{...settings,forceSelection:undefined});
    const actor=result.performers?.find(p=>p.id==='user');
    assert.equal(result.playerPlayed,!!actor);
    assert.equal(result.playerMinutes,actor?.minutes??0);
    for(const e of result.events.filter(e=>e.playerId==='user'))if(e.type!=='substitution')assert.ok(e.minute<=result.playerMinutes+(result.playerStarted?0:result.events.find(e=>e.type==='substitution'&&e.playerId==='user')?.minute??0));
    injuries+=result.events.some(e=>e.type==='injury')?1:0;reds+=result.playerStats.redCards;
  }
  assert.ok(injuries>0);assert.ok(reds>0);
  const injured=career();injured.player.injuryWeeks=3;
  assert.equal(simulateMatch(injured,fixture,{...settings,forceSelection:undefined}).playerPlayed,false);
  const substitute=simulateMatch(career(),fixture,{...settings,forceSelection:{from:72,to:90,started:false}});
  assert.equal(substitute.playerMinutes,18);assert.equal(substitute.playerStats.starts,0);
});

test('national synthetic teams preserve domestic membership and non-user fixtures contain no user performance',()=>{
  const input=career();const natHome={...home,id:'NAT_KR'},natAway={...away,id:'NAT_JP'};
  const provided=[...roster(natHome.id),{...input.player}];
  const record=simulateMatch(input,{...fixture,homeId:natHome.id,awayId:natAway.id},{...settings,home:natHome,away:natAway,homePlayers:provided,awayPlayers:roster(natAway.id),scope:'national'});
  assert.equal(record.playerPlayed,true);assert.equal(record.scope,'national');assert.equal(record.playerClubId,natHome.id);
  assert.equal(record.performers!.find(p=>p.id===input.player.id)!.clubId,input.player.clubId);
  const generic=simulateMatch(input,fixture,{...settings,userParticipates:false});
  assert.equal(generic.playerStats.apps,0);assert.equal(generic.playerStats.detailedApps,0);
  assert.ok(!generic.performers!.some(p=>p.id===input.player.id));
});

test('field and goalkeeper metric displays sum denominators and support per90 rather than averaging match percentages',()=>{
  const first={...emptyStats(),minutes:90,passes:10,passesCompleted:10},second={...emptyStats(),minutes:30,passes:90,passesCompleted:45};
  const total=sumStats([first,second]);
  assert.equal(fieldMetrics(total).length,12);assert.equal(goalkeeperMetrics(total).length,10);
  assert.equal(successRate(total.passesCompleted,total.passes),55);
  assert.equal(successRate(0,0),null);assert.equal(per90(4,120),3);
});

test('successful passing builds actual team chances and successful defending prevents actual opposing chances',()=>{
  for(const [attribute,team,sign] of [['passing',home.id,1],['defending',away.id,-1]] as const){
    const base=career(attribute==='passing'?'CM':'CB');
    let low=0,high=0;
    for(let game=0;game<600;game++){
      const seed=`team-impact-${attribute}-${game}`;
      const run=(level:number)=>simulateMatch({...base,seed,player:{...base.player,attributes:{...base.player.attributes,[attribute]:level}}},fixture,settings);
      const total=(record:ReturnType<typeof run>)=>record.performers!.filter(p=>(p.teamId??p.clubId)===team).reduce((n,p)=>n+p.stats.shots,0);
      low+=total(run(25));high+=total(run(95));
    }
    assert.ok((high-low)*sign>0,`${attribute}: team shots low=${low}, high=${high}`);
  }
});
