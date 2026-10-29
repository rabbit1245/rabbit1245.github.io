import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,overall} from './engine';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {simulateMatch} from './match-engine';
import {emptyStats} from './math';
import {getClub} from './data';
import {getClubWorldPower,getWorldClubPlayers} from './world';
import {effectiveDevelopmentGain} from './club-balance';
import {globalVoting,additionalGlobalHonours,type VotingTeamContext} from './global-honours';
import type {Position} from './types';
import type {CompetitorSeason} from './revision-types';

function fresh(position:Position='CB'){
 const c=createCareer({name:'수비수 균형 검수',nationality:'네덜란드',age:26,height:187,weight:82,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId:'EN1_06',squad:'senior',difficulty:'realistic',seed:'defender-balance-regression',training:[]});
 for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=92;c.player.ovr=overall(c.player);return c;
}

test('field-player clean spells use actual on-pitch goals and 60-minute eligibility, including early substitutions',()=>{
 let clean=0,conceding=0,lateOnly=0;
 for(const position of ['CB','RWB','RW','CM'] as const){
  const c=fresh(position),f=c.season.fixtures.find(f=>f.homeId===c.player.clubId)!;
  const options={home:{...getClub(f.homeId),power:80},away:{...getClub(f.awayId),power:80},homePlayers:getWorldClubPlayers(c,f.homeId),awayPlayers:getWorldClubPlayers(c,f.awayId),detailed:false};
  for(const end of [59,65,90])for(let seed=0;seed<100;seed++){
   c.seed=`defender-clean-spell-${seed}`;
   const m=simulateMatch(c,f,{...options,forceSelection:{from:0,to:end,started:true}}),opponentGoals=m.events.filter(e=>e.type==='goal'&&e.teamId===f.awayId),onPitch=opponentGoals.some(e=>e.minute<=m.playerMinutes);
   assert.equal(m.playerStats.cleanSheets,Number(m.playerMinutes>=60&&!onPitch));
   assert.equal(m.playerStats.cleanSheets,m.performers!.find(p=>p.id===c.player.id)!.stats.cleanSheets);
   if(m.playerStats.cleanSheets)clean++;if(onPitch)conceding++;if(m.playerStats.cleanSheets&&opponentGoals.length)lateOnly++;
  }
 }
 assert.ok(clean>0&&conceding>0&&lateOnly>0,'exercise clean games, conceded games and goals after withdrawal');
});

test('position-normalised global judging admits strong defensive seasons without a guaranteed shortlist or trophy bonus for non-participants',()=>{
 const c=fresh(),rows:CompetitorSeason[]=[],ctx:VotingTeamContext={leagueWinners:new Map(),cups:[],leagueTitles:new Map(),cupTitles:new Map(),teamScore:new Map()};
 for(const position of ['CB','ST'] as const)for(let i=0;i<40;i++)rows.push({playerId:`${position}-${i}`,name:`${position}-${i}`,clubId:'EN1_06',leagueId:'EN1',position,nationality:'네덜란드',ovr:85,stats:{...emptyStats(),apps:34,minutes:2900,ratingCount:34,ratingSum:34*7.5}});
 const defender={...rows[0],playerId:c.player.id,ovr:92};rows.push(defender);
 const observed=(r:CompetitorSeason)=>r.playerId===c.player.id?100:r.position==='CB'?65:110;
 const neutral=globalVoting(c,rows,observed,ctx),striker=rows.find(r=>r.position==='ST')!;
 assert.ok(neutral.score(defender)>neutral.score(striker),'an exceptional defender can outscore an ordinary attacking season');
 const weaker=globalVoting(c,rows,r=>r.playerId===c.player.id?15:observed(r),ctx);
 assert.ok(weaker.score(defender)<weaker.score(striker),'ability and positional normalisation alone cannot replace output');
 const priorScore=neutral.score(defender);ctx.cupTitles.set(c.player.id,16);ctx.leagueTitles.set(defender.clubId,8);
 assert.ok(globalVoting(c,rows,observed,ctx).score(defender)>priorScore,'earned major titles still increase the vote');
 const absent={...defender,stats:emptyStats()};assert.deepEqual(additionalGlobalHonours(c,[absent],[absent],globalVoting(c,[absent],()=>0,ctx),()=>[]).awards,[],'a non-participant cannot win merely because the team won');
 const strikerElite={...striker,playerId:'elite-striker',ovr:92},pool=[...rows,strikerElite],sameTier=(r:CompetitorSeason)=>r.playerId===c.player.id?78:r.playerId==='elite-striker'?88:r.position==='CB'?57:64;
 const calibrated=globalVoting(c,pool,sameTier,{...ctx,cupTitles:new Map(),leagueTitles:new Map()});
 assert.ok(Math.abs(calibrated.score(defender)-calibrated.score(strikerElite))<2,'similarly exceptional role output on the observed match-score scale receives comparable personal votes');
});

test('paid club development remains effective but elite strength has diminishing returns without rewriting capital or history',()=>{
 assert.equal(effectiveDevelopmentGain(60,20),20,'building a small club is preserved below the elite range');
 assert.equal(effectiveDevelopmentGain(80,6),6);assert.equal(effectiveDevelopmentGain(80,-2),-2);
 assert.ok(effectiveDevelopmentGain(85,20)>effectiveDevelopmentGain(85,10));assert.ok(effectiveDevelopmentGain(85,20)<5.5,'stacked gains cannot make an entire elite squad 99');
 const c=fresh(),club=c.systems!.world.clubs[c.player.clubId],before=getClubWorldPower(c,c.player.clubId);club.development!.investmentPower=14;club.development!.prestige=95;
 const stored=JSON.stringify(club.development),after=getClubWorldPower(c,c.player.clubId);
 assert.ok(after>before+4&&after<95);assert.equal(JSON.stringify(club.development),stored,'paid investment, prestige and archived performance remain intact');
 assert.ok(getWorldClubPlayers(c,c.player.clubId).some(p=>p.id!==c.player.id&&p.ovr<90),'teammates do not all turn into historical superstars');
});
