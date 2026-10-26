import {playingAbility,leadershipAbility} from './attributes';
import { CLUBS, ROSTERS } from './data';
import { clamp, emptyStats, integer, round, seededRandom } from './math';
import type { MatchOptions, MatchParticipant, MatchPerformance } from './revision-types';
import type { AttributeKey, Career, Club, Fixture, MatchEvent, MatchRecord, PlayerStats, Position } from './types';

const CLUB_INDEX = new Map(CLUBS.map(club=>[club.id,club]));
interface Actor extends MatchPerformance { from:number;to:number;teamId:string;user:boolean;style:string;creation:number }
interface Team { club:Club; actors:Actor[]; power:number; leadership:number }
const FORWARD = new Set<Position>(['ST','CF','SS','LW','RW']);
const MIDFIELD = new Set<Position>(['CDM','CM','CAM','LM','RM']);
const DEFENCE = new Set<Position>(['CB','LB','RB','LWB','RWB']);
const SHOTS:Record<Position,number>={GK:.025,CB:.55,LB:.65,RB:.65,LWB:.9,RWB:.9,CDM:.75,CM:1.1,CAM:1.9,LM:1.2,RM:1.2,LW:2.25,RW:2.25,CF:2.5,SS:2.8,ST:3.2};
const PASSES:Record<Position,number>={GK:19,CB:43,LB:39,RB:39,LWB:38,RWB:38,CDM:52,CM:57,CAM:46,LM:37,RM:37,LW:29,RW:29,CF:29,SS:26,ST:23};
const CREATION_ROLE:Record<Position,number>={GK:.03,CB:.2,LB:.85,RB:.85,LWB:1.1,RWB:1.1,CDM:.75,CM:1.45,CAM:2.4,LM:1.8,RM:1.8,LW:1.8,RW:1.8,CF:1.75,SS:1.75,ST:1.4};
// World NPCs carry a validated 1–100 OVR rather than thirty identical attribute entries.
const ability=(p:MatchParticipant,key:AttributeKey)=>{
 if(!p.attributes)return p.ovr;
 const raw=p.attributes[key];if(raw!==undefined)return clamp(raw,1,110);
 // Missing GK physical/field traits use actual keeper ability, never the 120 display conversion.
 return clamp(p.ovr>100?playingAbility({...p,attributes:p.attributes,style:'style'in p?String(p.style):'',ovr:undefined}):p.ovr,1,110);
};
const duration=(p:Actor)=>Math.max(0,p.to-p.from)/90;
const roundedCount=(mean:number,rng:()=>number)=>Math.max(0,Math.floor(mean+rng()));
const group=(p:Position)=>p==='GK'?0:DEFENCE.has(p)?1:MIDFIELD.has(p)?2:3;
const styleFactor=(p:Actor,kind:'shot'|'pass'|'dribble'|'tackle'|'aerial'|'sweep')=>{
  if(kind==='shot'&&/포처|골 사냥|침투|쉐도우|인사이드/.test(p.style))return 1.25;
  if(kind==='pass'&&/플레이메이커|레지스타|연계|템포|빌드업|배급|펄스/.test(p.style))return 1.2;
  if(kind==='dribble'&&/드리블|돌파|볼 운반|테크니컬/.test(p.style))return 1.35;
  if(kind==='tackle'&&/스토퍼|수비형|볼 위닝|압박|프레싱/.test(p.style))return 1.3;
  if(kind==='aerial'&&/타깃|공중/.test(p.style))return 1.4;
  if(kind==='sweep'&&/스위퍼|공격형 골키퍼/.test(p.style))return 1.6;
  return 1;
};

function sourcePlayers(career:Career,club:Club,provided?:MatchParticipant[]):MatchParticipant[] {
  if(provided?.length)return provided;
  const world=career.systems?.world;
  const ids=world?.clubs[club.id]?.rosterIds;
  if(ids?.length&&world)return ids.map(id=>world.players[id]).filter((p):p is NonNullable<typeof p>=>!!p&&p.injuryWeeks<=0);
  return ROSTERS[club.id]??[];
}

function makeTeam(career:Career,club:Club,provided:MatchParticipant[]|undefined,userTeam:string|undefined,selection:{from:number;to:number;started:boolean},rng:()=>number):Team {
  const user=career.player;
  const candidates=sourcePlayers(career,club,provided).filter(p=>p.id!==user.id);
  // Synthetic national teams and injury-depleted clubs still field a complete, explicitly fictional side.
  const fallback:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM'];
  for(let i=0;candidates.length<13;i++)candidates.push({id:`${club.id}:reserve:${i}`,name:`${club.name} 예비 선수 ${i+1} (가상)`,clubId:club.id,position:fallback[i%fallback.length],ovr:Math.max(20,club.power-8)});
  const desired:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST'];
  const chosen:MatchParticipant[]=[];
  const used=new Set<string>();
  for(const position of desired){
    let best:MatchParticipant|undefined;let bestScore=-Infinity;
    for(const candidate of candidates){
      if(used.has(candidate.id))continue;
      const score=candidate.ovr+(candidate.position===position?55:group(candidate.position)===group(position)?20:-80);
      if(score>bestScore){best=candidate;bestScore=score;}
    }
    if(best){chosen.push(best);used.add(best.id);}
  }
  const includesUser=userTeam===club.id&&selection.to>selection.from;
  const userParticipant:MatchParticipant={id:user.id,name:user.name,clubId:user.clubId,position:user.position,ovr:user.ovr,attributes:{...user.attributes},nationality:user.nationality};
  const closestIndex=()=>chosen.reduce((best,p,i)=>{
    const flank=user.position==='LWB'?'LB':user.position==='RWB'?'RB':user.position==='LB'?'LWB':user.position==='RB'?'RWB':undefined;
    const quality=(q:MatchParticipant,index:number)=>(q.position===user.position?100:flank&&(q.position===flank||desired[index]===flank)?85:group(q.position)===group(user.position)?35:-100)-q.ovr*.01;
    return quality(p,i)>quality(chosen[best],best)?i:best;
  },0);
  if(includesUser&&selection.started)chosen[closestIndex()]=userParticipant;
  const actors:Actor[]=chosen.map(p=>({...p,teamId:club.id,stats:emptyStats(),rating:0,minutes:90,started:true,from:0,to:90,user:p.id===user.id,style:p.id===user.id?user.style:'',creation:0}));
  let out:Actor|undefined;let substitute:MatchParticipant|undefined;let minute=integer(rng,64,77);
  if(includesUser&&!selection.started){
    out=actors[closestIndex()];substitute=userParticipant;minute=selection.from;
  }else if(includesUser&&selection.to<90){
    out=actors.find(p=>p.user);minute=selection.to;
    // A sending-off leaves the team short; an injury or tactical withdrawal permits a replacement.
    if(out&&selection.to>selection.from)substitute=candidates.filter(p=>!used.has(p.id)&&(user.position==='GK'?p.position==='GK':p.position!=='GK')).sort((a,b)=>(b.position===user.position?100:0)+b.ovr-((a.position===user.position?100:0)+a.ovr))[0];
  }else{
    const eligible=actors.filter(p=>!p.user&&p.position!=='GK');
    out=eligible[integer(rng,0,eligible.length-1)];
    substitute=candidates.filter(p=>!used.has(p.id)&&p.position!=='GK').sort((a,b)=>b.ovr-a.ovr)[0];
  }
  if(out&&substitute){
    out.to=minute;out.minutes=minute;
    const to=substitute.id===user.id?selection.to:90;
    actors.push({...substitute,teamId:club.id,stats:emptyStats(),rating:0,minutes:to-minute,started:false,from:minute,to,user:substitute.id===user.id,style:substitute.id===user.id?user.style:'',creation:0});
  }
  const userActor=actors.find(p=>p.user);
  if(userActor){userActor.from=selection.from;userActor.to=selection.to;userActor.minutes=selection.to-selection.from;userActor.started=selection.started;}
  const worldPower=career.systems?.world.clubs[club.id]?.power;
  // Supplied teams already carry their current power (including national teams).
  const power=provided?.length?club.power:worldPower??club.power;
  return {club,actors,power,leadership:0};
}

function sampleActions(actor:Actor,opponentPower:number,rng:()=>number,emit:(type:MatchEvent['type'],actor:Actor,minute:number,detail:string,relatedId?:string)=>string,detailed:boolean){
  const s=actor.stats, a=(key:AttributeKey)=>ability(actor,key), f=duration(actor);
  const count=(mean:number)=>roundedCount(mean*f,rng);
  const success=(attempts:number,probability:number)=>Math.min(attempts,roundedCount(attempts*clamp(probability,.03,.98),rng));
  const resistance=(opponentPower-65)*.0015;
  const lateMinutes=Math.max(0,actor.to-Math.max(60,actor.from));
  const lateEnergy=Math.min(1,.48+a('stamina')*.0052);
  const endurance=1-(1-lateEnergy)*lateMinutes/Math.max(1,actor.minutes);
  s.apps=actor.minutes>0?1:0;s.starts=actor.started?1:0;s.minutes=actor.minutes;s.detailedApps=1;
  if(actor.position==='GK'){
    s.buildUpPasses=count(PASSES.GK*styleFactor(actor,'pass'));
    s.buildUpCompleted=success(s.buildUpPasses,.24+a('gkDistribution')*.005+a('decisions')*.002-resistance);
    s.longKicks=count(7.5);s.longKicksCompleted=success(s.longKicks,.12+a('gkDistribution')*.0055+a('decisions')*.0012-resistance);
    s.passes=s.buildUpPasses+s.longKicks;s.passesCompleted=s.buildUpCompleted+s.longKicksCompleted;
    s.crossesFaced=count(5.5);s.crossesCaught=success(s.crossesFaced,.08+a('gkAerialCommand')*.006+a('gkHandling')*.002-resistance);
    s.sweepingAttempts=count(2.6*styleFactor(actor,'sweep'));
    s.sweepingSuccesses=success(s.sweepingAttempts,.08+a('decisions')*.0045+a('gkPositioning')*.0032-resistance);
    s.handlingAttempts=count(3.8);s.handlingSuccesses=success(s.handlingAttempts,.15+a('gkHandling')*.007+a('concentration')*.001-resistance);
  }else{
    s.passes=count(PASSES[actor.position]*styleFactor(actor,'pass')*(.66+a('teamwork')*.005)*endurance);
    s.passesCompleted=success(s.passes,(.33+a('passing')*.0045+a('ballControl')*.0012+a('decisions')*.0013+a('concentration')*.0009-resistance)*endurance);
    const wide=['LW','RW','LM','RM','LB','RB','LWB','RWB'].includes(actor.position);
    actor.creation=(.15+a('vision')*.021+a('passing')*.007+a('crossing')*(wide?.019:.008)+a('decisions')*.006+a('setPieces')*.006+a('teamwork')*.005)*CREATION_ROLE[actor.position]*styleFactor(actor,'pass')*endurance;
    s.dribbleAttempts=count((FORWARD.has(actor.position)?5.2:MIDFIELD.has(actor.position)?3.4:1.9)*styleFactor(actor,'dribble')*(.55+a('speed')*.007)*endurance);
    s.dribblesCompleted=success(s.dribbleAttempts,(.07+a('dribbling')*.005+a('agility')*.0022+a('ballControl')*.0013+a('speed')*.0008+a('strength')*.0006-resistance)*endurance);
    s.tackleAttempts=count((DEFENCE.has(actor.position)?4.3:MIDFIELD.has(actor.position)?3.1:1.6)*styleFactor(actor,'tackle')*endurance);
    s.tackles=success(s.tackleAttempts,(.1+a('defending')*.0057+a('strength')*.002+a('decisions')*.0007-resistance)*endurance);
    s.interceptions=count((DEFENCE.has(actor.position)?2.1:MIDFIELD.has(actor.position)?1.5:.65)*(.2+a('anticipation')*.013+a('positioning')*.004+a('concentration')*.002)*endurance);
    s.aerialAttempts=count((actor.position==='CB'||actor.position==='ST'?4.5:2.1)*styleFactor(actor,'aerial'));
    s.aerialWon=success(s.aerialAttempts,.06+a('jumping')*.0044+a('heading')*.0024+a('strength')*.002-resistance);
  }
  // Explicit late actions expose stamina's time-dependent effect without conflating it with OVR.
  s.lateActions=roundedCount(lateMinutes*(actor.position==='GK'?.22:.65)*(.35+a('stamina')*.008),rng);
  s.lateSuccesses=success(s.lateActions,(.35+a('concentration')*.0025)*lateEnergy);
  if(detailed&&actor.user){
    const rows:[MatchEvent['type'],number,number,string][]=[
      ['pass',s.passes,s.passesCompleted,'패스'],
      ['dribble',s.dribbleAttempts??0,s.dribblesCompleted??0,'드리블'],['tackle',s.tackleAttempts??0,s.tackles,'태클'],
      ['interception',s.interceptions,s.interceptions,'패스 차단'],['aerial',s.aerialAttempts??0,s.aerialWon??0,'공중볼 경합'],
      ['handling',s.handlingAttempts??0,s.handlingSuccesses??0,'공 처리'],['sweep',s.sweepingAttempts??0,s.sweepingSuccesses??0,'뒷공간 처리'],
      ['longKick',s.longKicks??0,s.longKicksCompleted??0,'롱킥'],
    ];
    for(const [type,attempts,completed,label] of rows)for(let i=0;i<attempts;i++)emit(type,actor,integer(rng,actor.from+1,Math.max(actor.from+1,actor.to)),`${label} ${i<completed?'성공':'실패'}`);
  }
}

function assignCaptain(career:Career,team:Team,userTeam:string|undefined,scope:'club'|'national',provided?:MatchParticipant[]) {
  const leaders=career.systems?.leadership,world=career.systems?.world;
  const starters=team.actors.filter(actor=>actor.started&&actor.minutes>0);
  const user=starters.find(actor=>actor.user);
  const role=userTeam===team.club.id?(scope==='national'?leaders?.nationalRole:leaders?.clubRole):'none';
  const leadership=(id:string)=>id===career.player.id?leadershipAbility(career.player.attributes,leaders?.trait??40):world?.players[id]?.leadership??45;
  const order=(a:{id:string},b:{id:string})=>leadership(b.id)-leadership(a.id)||a.id.localeCompare(b.id);
  const fullIds=scope==='club'?world?.clubs[team.club.id]?.rosterIds:undefined;
  const fullSquad=fullIds?fullIds.map(id=>({id})):sourcePlayers(career,team.club,provided);
  // A newly arrived user does not replace an established captain simply by having high abilities.
  const regular=[...fullSquad].filter(actor=>actor.id!==career.player.id).sort(order)[0];
  let captain:Actor|undefined;
  if(user&&role==='captain')captain=user;
  else if(regular)captain=starters.find(actor=>actor.id===regular.id);
  if(!captain&&user&&role==='vice')captain=user;
  if(!captain){
    const eligibleUser=scope==='national'?(leaders?.nationalMatches??0)>=10:
      career.season.year-(leaders?.clubSinceYear??career.season.year)>=1&&(leaders?.clubMatches??0)>=10;
    captain=[...starters].filter(actor=>!actor.user||eligibleUser).sort(order)[0];
  }
  if(captain)captain.captain=true;
  // Organization follows real on-pitch leadership and minutes, including an appointed deputy.
  const quality=(actor:Actor)=>clamp(leadership(actor.id)/100,0,1)*(.55+ability(actor,'decisions')*.0025+ability(actor,'teamwork')*.002);
  const captainFactor=captain?.user&&role==='captain'?.04:.028;
  const deputy=role==='vice'?team.actors.find(actor=>actor.user&&actor!==captain):undefined;
  team.leadership=clamp((captain?quality(captain)*captainFactor*duration(captain):0)+(deputy?quality(deputy)*.016*duration(deputy):0),0,.045);
}

/** Off-ball supply and coverage use actual skills, with the same rules for NPCs and the user.
 * A stronger final pass changes the chances created, not only the name credited an assist. */
function tacticalImpact(team:Team,opponentPower:number):{supply:number;coverage:number}{
  let creationEdge=0,defensiveEdge=0,control=0;
  for(const actor of team.actors){
    if(actor.position==='GK')continue;
    const wide=['LW','RW','LM','RM','LB','RB','LWB','RWB'].includes(actor.position);
    const lateMinutes=Math.max(0,actor.to-Math.max(60,actor.from));
    const referenceEndurance=1-(1-(.48+team.power*.0052))*lateMinutes/Math.max(1,actor.minutes);
    const reference=(.15+team.power*(.021+.007+(wide?.019:.008)+.006+.006+.005))*CREATION_ROLE[actor.position]*styleFactor(actor,'pass')*referenceEndurance;
    creationEdge+=(actor.creation-reference)*duration(actor);
    const weight=actor.position==='CB'?1.1:['LB','RB','LWB','RWB'].includes(actor.position)?.85:actor.position==='CDM'?.8:MIDFIELD.has(actor.position)?.35:.12;
    const defense=ability(actor,'defending')*.32+ability(actor,'anticipation')*.23+ability(actor,'positioning')*.2+ability(actor,'concentration')*.15+ability(actor,'decisions')*.1;
    defensiveEdge+=(defense-team.power)*weight*duration(actor);
    // An outstanding carrier/playmaker keeps the ball away from weaker opponents.
    // Averaging one player into eleven used to erase this effect almost entirely.
    // Use real ball/mental skills, role and minutes for every actor, never the user ID.
    const retention=ability(actor,'ballControl')*.22+ability(actor,'dribbling')*.18+ability(actor,'passing')*.20+ability(actor,'decisions')*.16+ability(actor,'composure')*.12+ability(actor,'teamwork')*.12;
    const dominance=Math.pow(clamp((retention-opponentPower-6)/32,0,1),1.5);
    const controlRole=MIDFIELD.has(actor.position)?1:FORWARD.has(actor.position)?.85:wide?.65:.4;
    control+=dominance*controlRole*duration(actor);
  }
  const possession=clamp(control,0,1.25);
  return {supply:clamp(1+creationEdge*.11+possession*.06,.76,1.42)*(1+team.leadership*.45),coverage:clamp(1-defensiveEdge*.006-possession*.25,.60,1.25)*(1-team.leadership)};
}

/** Pure seeded match simulation. Full worlds use the same action checks with compressed event output. */
export function simulateMatch(career:Career,fixture:Fixture,options:MatchOptions={}):MatchRecord {
  const home=options.home??CLUB_INDEX.get(fixture.homeId),away=options.away??CLUB_INDEX.get(fixture.awayId);
  if(!home||!away)throw new Error('경기를 치를 두 팀의 데이터가 필요합니다.');
  const seed=`${career.seed}:match-v2:${career.season.year}:${fixture.id}`;
  const rng=seededRandom(seed),selectRng=seededRandom(`${seed}:selection`);
  const p=career.player;
  const suppliedHome=options.homePlayers?.some(row=>row.id===p.id),suppliedAway=options.awayPlayers?.some(row=>row.id===p.id);
  const userTeam=options.userParticipates===false?undefined:suppliedHome?home.id:suppliedAway?away.id:fixture.homeId===p.clubId?home.id:fixture.awayId===p.clubId?away.id:undefined;
  const ownClub=userTeam===home.id?home:away;
  const available=p.injuryWeeks<=0&&p.fitness>=25;
  const selection=options.forceSelection?{...options.forceSelection}:{from:0,to:0,started:false};
  if(!options.forceSelection&&userTeam&&available){
    const startProbability=clamp(.48+(playingAbility(p)-ownClub.power)*.025+(career.managerTrust-50)*.004+(p.form-60)*.002,.04,.96);
    selection.started=selectRng()<startProbability;
    if(selection.started){selection.from=0;selection.to=selectRng()<.36?integer(selectRng,62,84):90;}
    else if(selectRng()<clamp(.66+(playingAbility(p)-ownClub.power)*.012,.15,.9)){selection.from=integer(selectRng,55,80);selection.to=90;}
  }
  selection.from=clamp(Math.floor(selection.from),0,90);selection.to=clamp(Math.floor(selection.to),selection.from,90);
  if(!userTeam||(!available&&!options.forceSelection)){selection.from=0;selection.to=0;selection.started=false;}
  const played=selection.to>selection.from;
  let redMinute:number|undefined,injuryMinute:number|undefined,injuryWeeks=0;
  if(played&&!options.forceSelection){
    if(selectRng()<.009){redMinute=integer(selectRng,Math.max(2,selection.from+1),selection.to);selection.to=redMinute;}
    else if(selectRng()<.012+(100-p.fitness)*.00025){injuryMinute=integer(selectRng,Math.max(2,selection.from+1),selection.to);selection.to=injuryMinute;injuryWeeks=integer(selectRng,1,5);}
  }
  const teams=[makeTeam(career,home,options.homePlayers,userTeam,selection,selectRng),makeTeam(career,away,options.awayPlayers,userTeam,selection,selectRng)];
  if(redMinute){const team=teams.find(t=>t.club.id===userTeam)!;team.actors=team.actors.filter(a=>a.user||a.from!==redMinute);}
  assignCaptain(career,teams[0],userTeam,options.scope??'club',options.homePlayers);
  assignCaptain(career,teams[1],userTeam,options.scope??'club',options.awayPlayers);
  const events:MatchEvent[]=[];
  let eventIndex=0;
  const emit=(type:MatchEvent['type'],actor:Actor,minute:number,detail:string,relatedId?:string)=>{
    const id=`${fixture.id}:e${eventIndex++}`;events.push({id,minute,type,teamId:actor.teamId,playerName:actor.name,playerId:actor.id,detail,...(relatedId?{relatedId}:{})});return id;
  };
  const detailed=options.detailed??!!userTeam;
  for(let side=0;side<2;side++)for(const actor of teams[side].actors){
    // Action RNG is isolated from log verbosity and other players' action counts.
    sampleActions(actor,teams[1-side].power,seededRandom(`${seed}:${actor.id}:actions`),emit,detailed);
    if(!actor.started&&actor.minutes>0)emit('substitution',actor,actor.from,'교체 투입');
  }
  const userActor=teams.flatMap(t=>t.actors).find(actor=>actor.user);
  if(userActor&&redMinute){userActor.stats.redCards=1;emit('red',userActor,redMinute,'퇴장');}
  if(userActor&&injuryMinute)emit('injury',userActor,injuryMinute,`${injuryWeeks}주 치료가 필요한 부상`);
  if(userActor&&!redMinute&&selectRng()<.12*duration(userActor)){userActor.stats.yellowCards=1;emit('yellow',userActor,integer(selectRng,userActor.from+1,userActor.to),'경고');}
  // Successful build-up and defensive actions change the chances that reach either goal.
  // These totals already reflect each actor's actual minutes, including substitutions.
  const buildUp=teams.map(t=>t.actors.reduce((n,a)=>n+a.stats.passesCompleted*.004+(a.stats.dribblesCompleted??0)*.09+(a.stats.lateSuccesses??0)*.006,0));
  const disruption=teams.map(t=>t.actors.reduce((n,a)=>n+a.stats.tackles*.12+a.stats.interceptions*.16+(a.stats.aerialWon??0)*.04+(a.stats.crossesCaught??0)*.12+(a.stats.sweepingSuccesses??0)*.12,0));
  const tactics=teams.map((team,index)=>tacticalImpact(team,teams[1-index].power));
  const scores=[0,0];
  for(let side=0;side<2;side++){
    const team=teams[side],opposition=teams[1-side];
    const keeperAt=(minute:number)=>opposition.actors.find(a=>a.position==='GK'&&a.from<minute&&a.to>=minute)??opposition.actors.find(a=>a.from<minute&&a.to>=minute)!;
    const firstKeeper=keeperAt(1);
    const organization=firstKeeper?ability(firstKeeper,'gkDefensiveOrganization'):opposition.power;
    const powerFactor=clamp(1+(team.power-opposition.power)*.012+(side===0&&!options.neutralVenue ? .07 : 0),.45,1.8);
    const actionFactor=clamp(1+(buildUp[side]-4)*.045-(disruption[1-side]-6)*.045,.68,1.32);
    for(const shooter of team.actors){
      const a=(key:AttributeKey)=>ability(shooter,key);
      const minutes=duration(shooter);
      const opportunities=SHOTS[shooter.position]*minutes*styleFactor(shooter,'shot')*powerFactor*actionFactor*tactics[side].supply*tactics[1-side].coverage*(.43+a('positioning')*.006+a('speed')*.002+a('decisions')*.001)*(1.22-organization*.0048);
      const shotRng=seededRandom(`${seed}:${shooter.id}:shots`);
      const creatorRng=seededRandom(`${seed}:${shooter.id}:creators`);
      const count=roundedCount(opportunities*(.65+shotRng()*.7),shotRng);
      for(let index=0;index<count;index++){
        const minute=integer(shotRng,shooter.from+1,Math.max(shooter.from+1,shooter.to));
        const keeper=keeperAt(minute);if(!keeper)continue;
        const k=(key:AttributeKey)=>ability(keeper,key);
        const typeRoll=shotRng();
        const shotType=typeRoll<.02?'penalty':typeRoll<.11?'setPiece':typeRoll<.30?'header':typeRoll<.48?'oneOnOne':'open';
        const shotId=emit('shot',shooter,minute,shotType==='penalty'?'페널티킥':shotType==='setPiece'?'프리킥 슈팅':shotType==='header'?'헤더 슈팅':shotType==='oneOnOne'?'일대일 슈팅':'슈팅');
        shooter.stats.shots++;
        // A key pass is an actual final pass before this shot, never an independent estimated count.
        const creatorGate=creatorRng(),creatorPick=creatorRng();
        let creator:Actor|undefined;
        const supplied=shotType==='header'?.96:shotType==='oneOnOne'?.82:.90;
        if(shotType!=='penalty'&&shotType!=='setPiece'&&creatorGate<supplied){
          const creators=team.actors.filter(actor=>actor.id!==shooter.id&&actor.from<minute&&actor.to>=minute&&actor.stats.passesCompleted>(actor.stats.keyPasses??0));
          const weights=creators.map(actor=>actor.position==='GK'?.12:actor.creation);
          let pick=creatorPick*weights.reduce((total,weight)=>total+weight,0);
          for(let i=0;i<creators.length;i++){pick-=weights[i];if(pick<=0){creator=creators[i];break;}}
          if(creator){creator.stats.keyPasses=(creator.stats.keyPasses??0)+1;if(detailed)emit('keyPass',creator,minute,'동료의 슈팅으로 연결한 패스',shotId);}
        }
        const late=minute>60?Math.min(1,.62+a('stamina')*.0038):1;
        const aim=clamp((.12+a('shooting')*.0042+a('composure')*.0015+a('setPieces')*(shotType==='setPiece'||shotType==='penalty'?.003:.00045)+(shotType==='header'?a('heading')*.0033:0))*late,.07,.96);
        const onTarget=shotRng()<(shotType==='penalty'?Math.max(.78,aim):aim);
        if(!onTarget)continue;
        shooter.stats.shotsOnTarget++;keeper.stats.shotsFaced=(keeper.stats.shotsFaced??0)+1;
        let saveChance=.50+k('gkShotStopping')*.003+k('gkReflexes')*.0015+k('gkPositioning')*.001+k('concentration')*.0007+k('gkHandling')*.0004-a('shooting')*.001-a('composure')*.001;
        if(shotType==='oneOnOne'){keeper.stats.oneOnOneAttempts=(keeper.stats.oneOnOneAttempts??0)+1;saveChance=.10+k('gkOneOnOnes')*.0038+k('gkReflexes')*.0012+k('gkPositioning')*.001+k('decisions')*.001-a('composure')*.0016;}
        if(shotType==='penalty'){keeper.stats.penaltiesFaced=(keeper.stats.penaltiesFaced??0)+1;saveChance=.04+k('gkOneOnOnes')*.0023+k('gkReflexes')*.0008+k('gkPositioning')*.0007-a('setPieces')*.0007;}
        const saved=shotRng()<clamp(saveChance,.05,.97);
        if(saved){
          keeper.stats.saves++;
          if(shotType==='oneOnOne')keeper.stats.oneOnOneSaves=(keeper.stats.oneOnOneSaves??0)+1;
          if(shotType==='penalty')keeper.stats.penaltiesSaved=(keeper.stats.penaltiesSaved??0)+1;
          emit('save',keeper,minute,shotType==='penalty'?'페널티킥 선방':shotType==='oneOnOne'?'일대일 선방':'선방',shotId);
        }else{
          shooter.stats.goals++;scores[side]++;keeper.stats.goalsConceded++;
          const goalId=emit('goal',shooter,minute,'득점',shotId);
          if(creator){creator.stats.assists++;emit('assist',creator,minute,'득점으로 연결한 마지막 패스',goalId);}
        }
      }
    }
  }
  for(let side=0;side<2;side++)for(const actor of teams[side].actors){
    const s=actor.stats;
    if(actor.position==='GK'&&actor.minutes>=60&&s.goalsConceded===0)s.cleanSheets=1;
    const isGK=actor.position==='GK';
    const contribution=isGK?s.saves*.20+(s.oneOnOneSaves??0)*.12+(s.penaltiesSaved??0)*.65+s.cleanSheets*.45-s.goalsConceded*.38+(s.crossesCaught??0)*.035+(s.sweepingSuccesses??0)*.04:
      s.goals*.95+s.assists*.65+(s.keyPasses??0)*.07+s.tackles*.075+s.interceptions*.065+(s.dribblesCompleted??0)*.055+(s.aerialWon??0)*.025+s.shotsOnTarget*.055-(s.passes-s.passesCompleted)*.018-((s.dribbleAttempts??0)-(s.dribblesCompleted??0))*.035;
    const resultBonus=scores[side]>scores[1-side]?.22:scores[side]<scores[1-side]?-.16:.02;
    actor.rating=round(clamp(6.05+contribution+resultBonus-s.yellowCards*.15-s.redCards*1.7+(rng()-.5)*.18,3,10),1);
    s.ratingSum=actor.rating;s.ratingCount=s.apps;
  }
  const allActors=teams.flatMap(t=>t.actors).filter(actor=>actor.minutes>0);
  const mom=[...allActors].sort((a,b)=>b.rating-a.rating||a.id.localeCompare(b.id))[0];
  if(mom)mom.stats.mom=1;
  const playerStats=userActor?.stats??emptyStats();
  const userScore=userTeam===home.id?scores[0]:scores[1],opponentScore=userTeam===home.id?scores[1]:scores[0];
  const rating=userActor?.rating??0;
  const stamina=ability(p,'stamina');
  const minutes=userActor?.minutes??0;
  events.sort((a,b)=>a.minute-b.minute||Number(a.id.slice(a.id.lastIndexOf('e')+1))-Number(b.id.slice(b.id.lastIndexOf('e')+1)));
  const performers:MatchPerformance[]=allActors.map(actor=>({id:actor.id,name:actor.name,clubId:actor.clubId,teamId:actor.teamId,position:actor.position,ovr:actor.ovr,nationality:actor.nationality,attributes:actor.attributes,stats:actor.stats,rating:actor.rating,minutes:actor.minutes,started:actor.started,...(actor.captain?{captain:true}:{})}));
  return {
    id:`match:${career.season.year}:${fixture.id}`,fixtureId:fixture.id,round:fixture.round,seasonYear:career.season.year,
    homeId:home.id,awayId:away.id,homeGoals:scores[0],awayGoals:scores[1],homeName:home.name,awayName:away.name,
    events,playerClubId:userTeam??p.clubId,playerPlayed:minutes>0,playerStarted:userActor?.started??false,playerMinutes:minutes,playerRating:rating,playerStats,seed,
    metricsVersion:2,scope:options.scope??'club',competitionId:options.competitionId??home.leagueId,date:options.date,performers,momPlayerId:mom?.id,
    effects:{fitnessAfter:round(clamp(p.fitness-minutes/90*(25-stamina*.13),15,100)),moraleAfter:round(clamp(p.morale+(minutes?(userScore>opponentScore?2:userScore<opponentScore?-2:0)+(rating-6.5)*1.4:-.4),5,100)),formAfter:round(clamp(minutes?p.form*.84+rating*1.6:p.form*.98+1,20,100)),injuryWeeksAfter:injuryWeeks||p.injuryWeeks,trustAfter:round(clamp(career.managerTrust+(minutes?(rating-6.35)*1.2:-.25),0,100))},
  };
}
