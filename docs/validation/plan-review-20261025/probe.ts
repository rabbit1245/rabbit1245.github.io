import {writeFileSync} from 'node:fs';
import {createCareer} from '../../../src/game/engine.ts';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,PLAY_STYLES,POSITION_LABELS,attributeWeights,overall} from '../../../src/game/attributes.ts';
import {trainRound,applyMatchExperience} from '../../../src/game/growth.ts';
import {simulateMatch} from '../../../src/game/match-engine.ts';
import {validateCareer} from '../../../src/game/storage.ts';
import {CLUBS} from '../../../src/game/data.ts';
import {emptyStats} from '../../../src/game/math.ts';
import type {Career,Position,AttributeKey,Club,Fixture} from '../../../src/game/types.ts';
import type {MatchOptions,MatchParticipant} from '../../../src/game/revision-types.ts';

const base=createCareer({name:'검토 전용',nationality:'포르투갈',age:20,height:180,weight:75,foot:'right',position:'ST',talent:'SSS',style:PLAY_STYLES.ST[0],clubId:CLUBS.find(c=>c.name==='인테르')!.id,squad:'senior',difficulty:'realistic',seed:'review-only'});
const positions=Object.keys(POSITION_LABELS) as Position[];
const attrs=(p:Position)=>p==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
const sourceChecks={fieldMappings:FIELD_ATTRIBUTES.length,gkMappings:GK_ATTRIBUTES.length,uniqueAttributeKeys:new Set([...FIELD_ATTRIBUTES,...GK_ATTRIBUTES]).size};
const formulaCases=positions.flatMap(position=>PLAY_STYLES[position].map(style=>{
 const weights=Object.entries(attributeWeights(position,style)) as [AttributeKey,number][];
 weights.sort((a,b)=>b[1]-a[1]);const selected=weights.slice(0,5).map(([key])=>key);
 const proposed=(other:number)=>{
  const attributes=Object.fromEntries(attrs(position).map(k=>[k,selected.includes(k)?110:other]));
  const unroundedBase=weights.reduce((sum,[k,w])=>sum+Math.min(100,attributes[k])*w,0);
  return {rawBase:unroundedBase,rawOvr:Math.min(120,unroundedBase+20),displayOvr:Math.round(Math.min(120,unroundedBase+20))};
 };
 return {position,style,selected,others90:proposed(90),others95:proposed(95),others100:proposed(100),currentOverallAll110:overall({position,style,attributes:Object.fromEntries(attrs(position).map(k=>[k,110]))})};
}));
function growthCase(locked=false):Career{
 const c={...base,player:{...base.player,ovr:100,potential:100,attributes:Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,100]))},systems:{...base.systems!,attributeLocks:locked?[...FIELD_ATTRIBUTES]:[],growthLedger:undefined},training:['shooting','positioning','composure'] as AttributeKey[],intensity:'intense' as const,season:{...base.season,week:1,attributeStart:Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,100])),playerStats:emptyStats()}};
 trainRound(c);applyMatchExperience(c,{...emptyStats(),apps:1,starts:1,minutes:90,ratingCount:1,ratingSum:9,goals:2,shotsOnTarget:4});return c;
}
const growth=growthCase();
const home:Club={id:'review-home',name:'검토 홈',nativeName:'검토 홈',country:'대한민국',leagueId:'TEST',power:65,color:'#ffffff'};
const away:Club={...home,id:'review-away',name:'검토 원정'};
const slots:Position[]=['GK','CB','CB','LB','RB','CDM','CM','CAM','LW','RW','ST','CM','GK'];
const roster=(clubId:string):MatchParticipant[]=>slots.map((position,i)=>({id:clubId+i,name:'검토 선수 '+i,position,clubId,ovr:65}));
const options:MatchOptions={home,away,homePlayers:roster(home.id),awayPlayers:roster(away.id),forceSelection:{from:0,to:90,started:true},detailed:false};
const fixture:Fixture={id:'review-fixture',homeId:home.id,awayId:away.id,round:1,played:false};
let compared=0,identical=0;
for(const position of positions)for(let seed=0;seed<20;seed++){
 const match=(value:number)=>{
  const c:Career={...base,seed:'overcap-review-'+seed,player:{...base.player,position,style:PLAY_STYLES[position][0],clubId:home.id,ovr:100,attributes:Object.fromEntries(attrs(position).map(k=>[k,value]))},systems:undefined,season:{...base.season,week:1}};
  const m=simulateMatch(c,fixture,options);return {goals:[m.homeGoals,m.awayGoals],stats:m.playerStats,rating:m.playerRating,effects:m.effects,events:m.events};
 };
 compared++;if(JSON.stringify(match(100))===JSON.stringify(match(110)))identical++;
}
const bad=structuredClone(base);bad.player.attributes.shooting=110;
let save110Error='';try{validateCareer(bad);}catch(e){save110Error=String(e);}
const result={scope:'Read-only source probes, controlled synthetic fixtures; no game source or public artifact changed. Proposed formula is not implemented.',sourceChecks,formulaCases,growthAt100:{ovr:growth.player.ovr,potential:growth.player.potential,shooting:growth.player.attributes.shooting,positioning:growth.player.attributes.positioning,composure:growth.player.attributes.composure},match100vs110:{compared,identical,condition:'same OVR=100, same team power, same seed; every user attribute 100 versus 110; test deliberately bypasses current save ranges'},save110Error};
writeFileSync(new URL('./probe.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({sourceChecks,positionStyleCases:formulaCases.length,currentOverallAll110:[...new Set(formulaCases.map(r=>r.currentOverallAll110))],proposedMaxWithOthers100:[...new Set(formulaCases.map(r=>r.others100.displayOvr))],proposedOthers90Range:[Math.min(...formulaCases.map(r=>r.others90.displayOvr)),Math.max(...formulaCases.map(r=>r.others90.displayOvr))],proposedOthers95Range:[Math.min(...formulaCases.map(r=>r.others95.displayOvr)),Math.max(...formulaCases.map(r=>r.others95.displayOvr))],growthAt100:result.growthAt100,match100vs110:result.match100vs110,save110Error},null,2));
