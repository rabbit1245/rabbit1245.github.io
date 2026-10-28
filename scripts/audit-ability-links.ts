import {mkdir,writeFile} from 'node:fs/promises';
import {createCareer,overall,makeFixtures,calculateTable} from '../src/game/engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,POSITION_ATTRIBUTES,PLAY_STYLES,playingAbility} from '../src/game/attributes';
import {simulateMatch} from '../src/game/match-engine';
import {getWorldClubPlayers,getClubWorldPower} from '../src/game/world';
import {getClub} from '../src/game/data';
import {emptyStats,addStats} from '../src/game/math';
import type {Career,Position,PlayerStats} from '../src/game/types';
const tries=Number(process.env.KBALL_AUDIT_MATCHES||300),out=process.env.KBALL_AUDIT_OUT||'test-results/release-2.10.1/before.json';
function profile(position:Position,level:number,clubId='EN1_12'){
 const c=createCareer({name:'능력 연동 검수',nationality:'포르투갈',age:27,height:184,weight:80,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId,squad:'senior',difficulty:'realistic',seed:'ability-audit-211',training:[]});
 for(const k of position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES)c.player.attributes[k]=Math.min(level,100);
 if(level>100){c.player.playSkills=POSITION_ATTRIBUTES[position].slice(0,5);for(const k of c.player.playSkills)c.player.attributes[k]=100+(level-100)/2;}
 c.player.ovr=overall(c.player);return c;
}
function options(c:Career,opponentId='EN1_13',forced=true){const h={...getClub(c.player.clubId),power:getClubWorldPower(c,c.player.clubId)},a={...getClub(opponentId),power:getClubWorldPower(c,opponentId)};return {home:h,away:a,homePlayers:getWorldClubPlayers(c,h.id),awayPlayers:getWorldClubPlayers(c,a.id),detailed:false,...(forced?{forceSelection:{from:0,to:90,started:true}}:{})};}
function probe(c:Career,opponent='EN1_13',forced=true){const originalSeed=c.seed;const total=emptyStats(),opts=options(c,opponent,forced);let goals=0,against=0,points=0;for(let i=0;i<tries;i++){c.seed=`ability-audit-pair-${i}`;const m=simulateMatch(c,{id:'ability-audit',homeId:c.player.clubId,awayId:opponent,round:1,played:false},opts);addStats(total,m.playerStats);goals+=m.homeGoals;against+=m.awayGoals;points+=m.homeGoals>m.awayGoals?3:m.homeGoals===m.awayGoals?1:0;}c.seed=originalSeed;return {ovr:c.player.ovr,playingAbility:playingAbility(c.player),per38:Object.fromEntries(['goals','assists','shots','keyPasses','pressingWins','progressivePasses','headerGoals','tackles','interceptions','saves','punches'].map(k=>[k,Number(((total[k as keyof PlayerStats]??0)*38/tries).toFixed(2))])),stats:total,apps:total.apps,minutes:total.minutes,teamGF:Number((goals*38/tries).toFixed(2)),teamGA:Number((against*38/tries).toFixed(2)),points38:Number((points*38/tries).toFixed(2))};}
async function main(){const tiers:any={},links:any={};for(const p of ['ST','LW','CAM','RWB','CB','GK'] as Position[]){tiers[p]=[];for(const n of [80,90,95,100,110]){const c=profile(p,n);tiers[p].push({tier:n,...probe(c)});}console.log(p,JSON.stringify(tiers[p].map((r:any)=>({ovr:r.ovr,...r.per38,teamGF:r.teamGF,teamGA:r.teamGA,points38:r.points38}))));}
 for(const [p,keys]of [['CM',FIELD_ATTRIBUTES],['GK',GK_ATTRIBUTES]] as const){links[p]={};for(const k of keys){const base=profile(p,90),a=structuredClone(base),b=structuredClone(base);a.player.attributes[k]=90;b.player.attributes[k]=100;links[p][k]={low:probe(a),high:probe(b)};}}
 const absent:any={};for(const p of ['ST','LW','RWB','GK'] as Position[]){const c=profile(p,95);absent[p]={automatic:probe(c,'EN1_13',false),forced:probe(c)};}
 const base=profile('ST',90),w=base.systems!.world,comp=w.competitions.EN1,npc:any=[];for(let run=0;run<3;run++){const fixtures=makeFixtures(comp.table.map(r=>r.clubId),2026);let goals=0;for(const f of fixtures){const h={...getClub(f.homeId),power:getClubWorldPower(base,f.homeId)},a={...getClub(f.awayId),power:getClubWorldPower(base,f.awayId)};base.seed=`npc-league-audit-${run}`;const m=simulateMatch(base,f,{home:h,away:a,homePlayers:getWorldClubPlayers(base,h.id),awayPlayers:getWorldClubPlayers(base,a.id),userParticipates:false,detailed:false,recordActionEvents:false});f.played=true;f.homeGoals=m.homeGoals;f.awayGoals=m.awayGoals;goals+=m.homeGoals+m.awayGoals;}const table=calculateTable(fixtures,comp.table.map(r=>r.clubId));npc.push({goalsPerGame:goals/fixtures.length,winner:table[0].clubId,points:table[0].points});}
 const report={matchesPerPair:tries,tiers,links,selection:absent,npc};await mkdir('test-results/release-2.10.1',{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log('NPC',JSON.stringify(npc));}
main().catch(e=>{console.error(e);process.exitCode=1;});
