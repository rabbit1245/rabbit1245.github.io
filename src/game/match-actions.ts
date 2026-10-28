import {playingAbility} from './attributes';
import {clamp,integer,seededRandom} from './math';
import type {MatchPerformance} from './revision-types';
import type {AttributeKey,MatchAction,MatchEvent,Position} from './types';

export interface ActionActor extends MatchPerformance {from:number;to:number;teamId:string;user:boolean;style:string;creation:number}
export interface ActionTeam {club:{id:string;name:string};actors:ActionActor[];power:number}
export type ActionEmitter=(type:MatchEvent['type'],actor:ActionActor,minute:number,detail:string,relatedId?:string,action?:MatchAction)=>string;
const forward=new Set<Position>(['ST','CF','SS','LW','RW']);
const defenders=new Set<Position>(['CB','LB','RB','LWB','RWB']);
const duration=(p:ActionActor)=>Math.max(0,p.to-p.from)/90;
const count=(v:number,rng:()=>number)=>Math.max(0,Math.floor(v+rng()));
const zone=(p:Position)=>p==='GK'||defenders.has(p)?0:forward.has(p)?2:1;
const intervals=new WeakMap<ActionTeam,{until:number;players:ActionActor[]}[]>();
const byZone=new WeakMap<ActionActor[],ActionActor[][]>();
const recoverers=new WeakMap<ActionActor[],ActionActor>();
const receiverPools=new WeakMap<ActionActor[],ActionActor[][]>();
const aerialRatings=new WeakMap<ActionActor,number>();
const suppliers=new WeakMap<ActionActor,{cross:number;setPiece:number}>();
const PHASE_RATES:Record<Position,number>={GK:0,CB:6,LB:5,RB:5,LWB:6,RWB:6,CDM:8,CM:8.5,CAM:7.5,LM:5,RM:5,LW:4,RW:4,CF:3,SS:3,ST:2.5};
const PRESS_RATES:Record<Position,number>={GK:0,CB:2,LB:3,RB:3,LWB:3.4,RWB:3.4,CDM:4.8,CM:4.5,CAM:3.5,LM:4.3,RM:4.3,LW:4.3,RW:4.3,CF:4,SS:4,ST:4};
const active=(team:ActionTeam,minute:number)=>{
  let rows=intervals.get(team);if(!rows){const boundaries=[...new Set([90,...team.actors.flatMap(p=>[p.from,p.to])])].filter(n=>n>0).sort((a,b)=>a-b);rows=boundaries.map(until=>({until,players:team.actors.filter(p=>p.from<until&&p.to>=until)}));intervals.set(team,rows);}
  return rows.find(r=>minute<=r.until)?.players??[];
};
const zonePools=(players:ActionActor[])=>{let pools=byZone.get(players);if(!pools){pools=[0,1,2].map(z=>players.filter(p=>zone(p.position)===z));byZone.set(players,pools);}return pools;};
export const actionAbility=(p:ActionActor,key:AttributeKey)=>{
  if(!p.attributes)return p.ovr;
  const raw=p.attributes[key];if(raw!==undefined)return clamp(raw,1,110);
  return clamp(p.ovr>100?playingAbility({...p,attributes:p.attributes,style:p.style,ovr:undefined}):p.ovr,1,110);
};

/** Only a bounded number of attacking phase transitions are expanded; ordinary passes keep the existing fast aggregate. */
export function phasePasses(actor:ActionActor,team:ActionTeam,opposition:ActionTeam,seed:string,emit:ActionEmitter,detailed:boolean,passFactor:number,endurance:number,ordinarySuccess:number,record=true){
  const rng=seededRandom(`${seed}:${actor.id}:progression`),a=(key:AttributeKey)=>actionAbility(actor,key),s=actor.stats;
  const planned=Math.min(s.passes,count(PHASE_RATES[actor.position]*duration(actor)*(.5+a('vision')*.006+a('decisions')*.002)*passFactor*endurance,rng));
  const quality=a('passing')*.4+a('vision')*.25+a('decisions')*.2+a('ballControl')*.15,forwardChance=clamp(.2+a('vision')*.004+a('decisions')*.002,.15,.9),longChance=clamp((a('vision')-60)*.008,0,.4),base=zone(actor.position);
  let attempts=0,completed=0,logged=0,loggedCompleted=0;
  for(let i=0;i<planned;i++){
    const minute=integer(rng,actor.from+1,actor.to),lineup=active(team,minute);if(lineup.length<2)continue;
    const fromZone=base===0?(rng()<.8?0:1):base===2?(rng()<.7?2:1):1;
    const forwardIntent=rng()<forwardChance;
    const toZone=forwardIntent?Math.min(3,fromZone+1+(rng()<longChance?1:0)):Math.max(0,fromZone-(rng()<.55?0:1));
    // Receiver identity belongs to the retained source event, not the pass-success calculation.
    // Consume the same draw even in an NPC result whose source will immediately be discarded.
    const receiverPick=rng();let receiver:ActionActor|undefined;
    if(record){let pools=receiverPools.get(lineup);if(!pools){pools=[0,1,2].map(z=>lineup.filter(p=>zone(p.position)>=z));receiverPools.set(lineup,pools);}let pool=pools[Math.min(2,toZone)],self=pool.indexOf(actor),size=pool.length-Number(self>=0);if(!size){pool=lineup;self=pool.indexOf(actor);size=pool.length-Number(self>=0);}const chosen=Math.floor(receiverPick*size);receiver=pool[chosen+(self>=0&&chosen>=self?1:0)];}
    const probability=toZone>fromZone?clamp(.2+quality*.007-(opposition.power-65)*.002-(toZone-fromZone)*.055,.05,.97):ordinarySuccess;
    const success=rng()<probability;attempts++;if(success)completed++;
    if(success&&toZone>fromZone)s.progressivePasses=(s.progressivePasses??0)+1;
    if(record&&(success&&toZone>fromZone||detailed&&actor.user)){
      emit('pass',actor,minute,`${['수비 진영','중원','공격 진영','박스'][fromZone]} → ${['수비 진영','중원','공격 진영','박스'][toZone]} 패스 ${success?'성공':'실패'}`,undefined,{kind:'phasePass',fromZone,toZone,completed:success,receiverId:receiver!.id});logged++;if(success)loggedCompleted++;
    }
  }
  return {attempts,completed,logged,loggedCompleted};
}

/** A pressure is credited only after a separate, won recovery duel changes the owner. */
export function resolvePressing(teams:ActionTeam[],seed:string,emit:ActionEmitter,detailed:boolean,record=true){
  for(let side=0;side<2;side++)for(const actor of teams[side].actors){
    if(actor.position==='GK'||!actor.minutes)continue;
    const rng=seededRandom(`${seed}:${actor.id}:pressure`),a=(k:AttributeKey)=>actionAbility(actor,k),style=/프레싱|압박|수비형/.test(actor.style)?1.3:1;
    const opportunities=count(PRESS_RATES[actor.position]*duration(actor)*(.35+(a('stamina')*.6+a('speed')*.4)*.008)*style,rng);
    const quality=a('defending')*.24+a('anticipation')*.2+a('teamwork')*.18+a('decisions')*.16+a('speed')*.12+a('stamina')*.1,cooperation=a('teamwork')*.0012;
    for(let i=0;i<opportunities;i++){
      const minute=integer(rng,actor.from+1,actor.to),opponents=active(teams[1-side],minute),mates=active(teams[side],minute);if(!opponents.length||!mates.length)continue;
      const nearby=zonePools(opponents)[2-zone(actor.position)],pool=nearby.length?nearby:opponents,holder=pool[integer(rng,0,pool.length-1)];
      const resistance=actionAbility(holder,'ballControl')*.4+actionAbility(holder,'composure')*.3+actionAbility(holder,'passing')*.3;
      const forced=rng()<clamp(.08+(quality-resistance)*.008+cooperation,.02,.8);
      let best=recoverers.get(mates);if(!best){best=mates.reduce((best,p)=>actionAbility(p,'anticipation')+actionAbility(p,'teamwork')>actionAbility(best,'anticipation')+actionAbility(best,'teamwork')?p:best,mates[0]);recoverers.set(mates,best);}
      const recoverer=rng()<.6?actor:best;
      const recovery=forced&&rng()<clamp(.4+actionAbility(recoverer,'anticipation')*.003+actionAbility(recoverer,'teamwork')*.001+(actionAbility(recoverer,'speed')-actionAbility(holder,'speed'))*.002,.15,.95);
      if(!recovery&&!(detailed&&actor.user))continue;
      if(record){const possessionId=`${actor.id}:press:${i}`,pressureId=emit('pressure',actor,minute,recovery?'압박으로 상대의 볼 처리를 방해':'압박했지만 상대 소유권 유지',undefined,{kind:'pressure',possessionId,holderId:holder.id,holderTeamId:holder.teamId??holder.clubId,recovered:recovery});if(recovery)emit('recovery',recoverer,minute,'압박 이후 우리 팀 소유권 회복',pressureId,{kind:'recovery',possessionId,fromTeamId:holder.teamId??holder.clubId});}
      if(recovery)actor.stats.pressingWins=(actor.stats.pressingWins??0)+1;
    }
  }
}

function supplier(team:ActionTeam,minute:number,rng:()=>number,exclude?:string,setPiece=false){
  const players=active(team,minute).filter(p=>p.id!==exclude&&p.position!=='GK');
  if(!players.length)return active(team,minute).find(p=>p.id!==exclude);
  // Supply is an opportunity, not a permanent highest-stat taker. Reuse the engine's
  // existing positional creation rate so a skilled CB does not take every teammate's cross.
  const weights=players.map(p=>{let rating=suppliers.get(p);if(!rating){const role=['LB','RB','LWB','RWB','LW','RW','LM','RM'].includes(p.position)?10:0,creation=Math.max(.1,p.creation);rating={cross:(actionAbility(p,'crossing')+role)**2*creation,setPiece:actionAbility(p,'setPieces')**2*creation};suppliers.set(p,rating);}return setPiece?rating.setPiece:rating.cross;});
  let pick=rng()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<players.length;i++){pick-=weights[i];if(pick<=0)return players[i];}return players.at(-1);
}
export function resolveAirClaims(teams:ActionTeam[],seed:string,emit:ActionEmitter,record=true){
  for(let side=0;side<2;side++)for(const keeper of teams[side].actors.filter(p=>p.position==='GK'&&p.minutes>0)){
    const rng=seededRandom(`${seed}:${keeper.id}:air-claims`),a=(k:AttributeKey)=>actionAbility(keeper,k),opp=teams[1-side];
    const faced=count(5.5*duration(keeper)*clamp(.65+opp.power*.005,.65,1.25),rng);
    for(let i=0;i<faced;i++){
      const minute=integer(rng,keeper.from+1,keeper.to),crosser=supplier(opp,minute,rng);if(!crosser)continue;
      const crossId=record?emit('cross',crosser,minute,'페널티 지역으로 들어온 크로스',undefined,{kind:'cross',keeperId:keeper.id,claimable:true,phase:'open'}):'';keeper.stats.crossesFaced=(keeper.stats.crossesFaced??0)+1;
      const pressure=clamp(rng()*(.4+opp.power/150),0,1);
      const catchUtility=a('gkHandling')*.5+a('gkAerialCommand')*.2+a('gkPositioning')*.15+a('decisions')*.15+18-pressure*35;
      const punchUtility=a('gkAerialCommand')*.4+a('decisions')*.3+a('gkPositioning')*.2+a('gkHandling')*.1+5-pressure*8;
      const punch=punchUtility>catchUtility,probability=punch?.08+a('gkAerialCommand')*.0035+a('decisions')*.0025+a('gkPositioning')*.002+a('gkHandling')*.001-pressure*.14-actionAbility(crosser,'crossing')*.001:.1+a('gkHandling')*.004+a('gkAerialCommand')*.002+a('gkPositioning')*.0015+a('decisions')*.001-pressure*.18-actionAbility(crosser,'crossing')*.001;
      const success=rng()<clamp(probability,.08,.97);if(record)emit(punch?'punch':'catch',keeper,minute,success?(punch?'위험 지역 밖으로 펀칭':'크로스를 안전하게 포구'):(punch?'펀칭 후 위험 지역에 공이 남음':'크로스 포구 실패'),crossId,{kind:'airClaim',success,destination:success?(punch?'safe':'held'):'danger'});
      if(success){if(punch)keeper.stats.punches=(keeper.stats.punches??0)+1;else keeper.stats.crossesCaught=(keeper.stats.crossesCaught??0)+1;}
    }
  }
}

export const aerialQuality=(p:ActionActor)=>{let rating=aerialRatings.get(p);if(rating===undefined){rating=actionAbility(p,'heading')*.38+actionAbility(p,'jumping')*.22+actionAbility(p,'positioning')*.24+actionAbility(p,'strength')*.16;aerialRatings.set(p,rating);}return rating;};
export function headerProbability(actor:ActionActor,team:ActionTeam){
  const base=actor.position==='GK'?.02:actor.position==='CB'?.42:['ST','CF','SS'].includes(actor.position)?.19:defenders.has(actor.position)?.18:.14;
  const quality=aerialQuality(actor),other=actionAbility(actor,'shooting')*.5+actionAbility(actor,'dribbling')*.25+actionAbility(actor,'speed')*.25;
  const wide=team.actors.filter(p=>['LB','RB','LWB','RWB','LW','RW','LM','RM'].includes(p.position));
  const service=wide.length?wide.reduce((n,p)=>n+actionAbility(p,'crossing'),0)/wide.length:team.power;
  return clamp(base*clamp(.35+quality/100+(quality-other)*.015,.25,2.5)*(.75+service*.0035),.005,.65);
}
export function headerDelivery(team:ActionTeam,opposition:ActionTeam,shooter:ActionActor,keeper:ActionActor,minute:number,rng:()=>number,emit:ActionEmitter,record=true):{won:boolean;crossId:string;duelId:string;phase:'open'|'setPiece';crosser:ActionActor}|undefined{
  const phase=shooter.position==='CB'||rng()<.35?'setPiece':'open',crosser=supplier(team,minute,rng,shooter.id,phase==='setPiece');if(!crosser)return;
  const delivery=phase==='setPiece'?(rng()<.6?'corner':'freeKick'):undefined;
  const setPieceId=record&&delivery?emit('setPiece',crosser,minute,'세트피스 크로스 공급',undefined,{kind:'setPiece',delivery}):undefined;
  const crossId=record?emit('cross',crosser,minute,'공중볼 경합 지점으로 크로스',setPieceId,{kind:'cross',keeperId:keeper.id,claimable:false,phase}):'';keeper.stats.crossesFaced=(keeper.stats.crossesFaced??0)+1;
  const defending=active(opposition,minute).filter(p=>p.position!=='GK'),pool=defending.filter(p=>defenders.has(p.position));
  const defender=(pool.length?pool:defending).reduce<ActionActor|undefined>((best,p)=>!best||aerialQuality(p)>aerialQuality(best)?p:best,undefined);if(!defender)return;
  shooter.stats.aerialAttempts=(shooter.stats.aerialAttempts??0)+1;defender.stats.aerialAttempts=(defender.stats.aerialAttempts??0)+1;
  const won=rng()<clamp(.5+(aerialQuality(shooter)-aerialQuality(defender))*.009,.05,.93),winner=won?shooter:defender;winner.stats.aerialWon=(winner.stats.aerialWon??0)+1;
  const duelId=record?emit('aerial',winner,minute,won?'공중 경합 후 헤더 기회 확보':'크로스를 공중볼 경합으로 차단',crossId,{kind:'headerDuel',attackerId:shooter.id,defenderId:defender.id,winnerId:winner.id}):'';
  return {won,crossId,duelId,phase,crosser};
}
