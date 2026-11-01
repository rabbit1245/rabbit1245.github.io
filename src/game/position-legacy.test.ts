import {beginGrowthSeason} from './growth';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,changePosition,overall,advanceCareer,setPlaySkill} from './engine';
import {FIELD_ATTRIBUTES,GK_ATTRIBUTES,POSITION_LABELS,PLAY_STYLES,attributeWeights,attributeImportance} from './attributes';
import {positionChangeLines} from './position-changes';
import {evaluateRetiredNumbers,retiredNumberStandard,superBallonResult,evaluateSuperBallon,retirementAwardName} from './legacy-honours';
import {validateCareer,exportCareer,verifySaveText} from './storage';
import {executeCommand} from './commands';
import {commandChange,applyCareerPatches} from './command-patches';
import {emptyStats} from './math';
import {buildCareerText} from './career-text';
import type {Career,Position,MatchRecord} from './types';
import type {BallonDorYear} from './revision-types';

function fresh(position:Position='ST',clubId='ES1_01'){
 const c=createCareer({name:'포지션과 구단 전설 검수',nationality:'대한민국',age:24,height:180,weight:76,foot:'right',position,talent:'SSS',style:PLAY_STYLES[position][0],clubId,squad:'senior',difficulty:'realistic',seed:'position-legacy-2117',training:[]});
 for(const key of position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES)c.player.attributes[key]=key==='defending'?95:key==='shooting'?55:80;c.player.ovr=overall(c.player);c.season.ovrStart=c.player.ovr;c.season.attributeStart={...c.player.attributes};beginGrowthSeason(c);return c;
}
test('OVR arrows are monotonically tied to the actual positional/type weights across all positions and styles',()=>{
 for(const position of Object.keys(POSITION_LABELS) as Position[])for(const style of PLAY_STYLES[position]){
  const w=attributeWeights(position,style),importance=attributeImportance(position,style),sorted=Object.entries(w).sort((a,b)=>a[1]!-b[1]!);
  assert.ok(Object.values(importance).includes(3));for(let i=1;i<sorted.length;i++)assert.ok(importance[sorted[i][0] as keyof typeof importance]!>=importance[sorted[i-1][0] as keyof typeof importance]!);
 }
 assert.notEqual(attributeImportance('ST','포처').defending,attributeImportance('CB','스토퍼').defending);
});
test('changing position recalculates OVR without changing attributes, skill selections, contracts or archived results',async()=>{
 let c=fresh();c=setPlaySkill(c,'defending',true);const before=JSON.stringify(c),next=changePosition(c,'CB','스토퍼');
 assert.deepEqual(next.player.attributes,c.player.attributes);assert.deepEqual(next.player.playSkills,c.player.playSkills);assert.equal(next.player.ovr,overall(next.player));assert.ok(next.player.ovr>c.player.ovr);
 assert.deepEqual(next.systems!.economics,c.systems!.economics);assert.equal(next.systems!.world,c.systems!.world);assert.equal(JSON.stringify(c),before);
 assert.ok(next.player.secondaryPositions.includes('ST'));assert.equal(next.systems!.positionChanges!.length,1);assert.match(positionChangeLines(next)[0],/ST.*→ CB.*OVR/);
 validateCareer(next);const loaded=await verifySaveText(await exportCareer(next));assert.deepEqual(loaded.player,next.player);assert.deepEqual(loaded.systems!.positionChanges,next.systems!.positionChanges);
 assert.match(buildCareerText(loaded),/포지션 변경: .*스트라이커.*센터백/);
});
test('position commands retain the bounded journal path and repeated command IDs cannot duplicate history',()=>{
 const c=fresh(),command={type:'changePosition',position:'CM',style:'박스투박스'} as const,next=executeCommand(c,command,'position-once'),patches=commandChange(c,next);
 assert.ok(patches);assert.equal(JSON.stringify(applyCareerPatches(c,patches)),JSON.stringify(next));assert.equal(executeCommand(next,command,'position-once'),next);
 const again=changePosition(next,'CM','박스투박스');assert.equal(again.systems!.positionChanges!.length,1);assert.equal(next.systems!.positionChanges!.length,1);
});
test('invalid/retired position changes are rejected and an old save acquires no invented position history',()=>{
 const c=fresh();assert.throws(()=>changePosition(c,'GK','슛 스토퍼'),/전용 능력치/);assert.throws(()=>changePosition(c,'CB','포처'),/유형/);
 assert.throws(()=>changePosition({...c,stage:'retired'},'CM','박스투박스'),/현역/);assert.equal(validateCareer(c).systems!.positionChanges,undefined);
 const broken=changePosition(c,'CB','스토퍼');broken.systems!.positionChanges![0].toStyle='포처';assert.throws(()=>validateCareer(broken),/선수 유형/);
});
test('a valid older custom style is preserved as historical text when changing to a current position/type',()=>{
 const c=fresh();c.player.style='기존 커스텀 선수 유형';validateCareer(c);
 const next=changePosition(c,'CB','스토퍼');validateCareer(next);assert.equal(next.systems!.positionChanges![0].fromStyle,c.player.style);
});
test('the next actual game uses the new position, while the original career and earlier game stay unchanged',()=>{
 const c=advanceCareer(fresh('ST','KR2_03'),1),old=JSON.stringify(c.season.matches),changed=changePosition(c,'CB','스토퍼'),played=advanceCareer(changed,1);
 assert.equal(JSON.stringify(c.season.matches),old);const game=played.season.matches.find(m=>m.round===2)!,own=game.performers?.find(r=>r.id===c.player.id);assert.ok(own);assert.equal(own.position,'CB');validateCareer(played);
});
function legends(c:Career,clubId:string,years=12){
 // Controlled record evidence, not a save-valid career or simulated matches.
 const end=c.season.year;c.history=[];
 for(let i=0;i<years;i++){const year=end-years+i+1,stats={...emptyStats(),apps:50,starts:50,minutes:4500,ratingCount:50,ratingSum:400};
  c.history.push({year,clubId,clubName:clubId,leagueId:c.season.leagueId,competitionName:'검수 리그',age:24+i,position:'CB',squad:'senior',rank:1,ovrStart:92,ovrEnd:92,stats,matches:Array.from({length:50},(_,j)=>({fixtureId:`legend:${clubId}:${year}:${j}`,seasonYear:year,scope:'club',playerClubId:clubId,playerStats:{...emptyStats(),apps:1,minutes:90,ratingCount:1,ratingSum:8}})) as MatchRecord[],attributeGrowth:{},income:0,awards:[],completed:true});
  c.awards.push({id:`title:${clubId}:${year}`,name:'검수 리그 우승 메달',year,clubId,category:'team',description:'검수 근거'});
 }
 c.systems!.leadership.terms.push({scope:'club',teamId:clubId,role:'captain',startYear:end-years+1,apps:years*50,reason:'검수 주장'});
}
test('club historical stature makes a Madrid retired number harder than an obscure club, without using current inflated power',()=>{
 const small=retiredNumberStandard('KR2_03'),big=retiredNumberStandard('ES1_01');assert.ok(big.minYears>small.minYears);assert.ok(big.minApps>small.minApps);assert.ok(big.threshold>small.threshold);
 const c=fresh();c.systems!.world.clubs['KR2_03'].power=99;assert.deepEqual(retiredNumberStandard('KR2_03'),small);assert.deepEqual(evaluateRetiredNumbers(c),[]);
});
test('a historic club award is one per club across transfers/years; another club may also honour the player',()=>{
 const c=fresh();legends(c,'ES1_01');const first=evaluateRetiredNumbers(c);assert.equal(first.length,1);assert.equal(first[0].clubId,'ES1_01');c.awards.push(...first);c.season.year++;assert.deepEqual(evaluateRetiredNumbers(c),[]);
 legends(c,'EN1_14');const next=evaluateRetiredNumbers(c);assert.equal(next.length,1);assert.equal(next[0].clubId,'EN1_14');assert.equal(c.awards.filter(a=>a.category==='club-legacy').length,1);
});
test('a short glorious spell cannot bypass a major club legacy threshold and low performance alone is insufficient',()=>{
 const c=fresh();legends(c,'ES1_01',3);assert.deepEqual(evaluateRetiredNumbers(c),[]);
 legends(c,'ES1_01');for(const h of c.history)for(const m of h.matches)m.playerStats.ratingSum=6;assert.deepEqual(evaluateRetiredNumbers(c),[]);
});
function rankings(c:Career){c.season.year=2030;c.systems!.rankings=[];for(let year=2026;year<=2030;year++){
 const rows=[{playerId:c.player.id,name:c.player.name,clubId:c.player.clubId,position:'CB' as const,score:110,rank:1,stats:emptyStats(),nationalStats:emptyStats()},{playerId:'rival',name:'대조 공격수',clubId:'ES1_02',position:'ST' as const,score:100,rank:2,stats:emptyStats(),nationalStats:emptyStats()}];
 c.systems!.rankings.push({year,candidates:rows,playerRank:1,winnerId:c.player.id,world11:[],awards:[],diagnostics:[]} satisfies BallonDorYear);
}}
test('Super Ballon is judged every fifth calendar year from all five finalized annual ledgers; no missing-year fabrication',()=>{
 const c=fresh();rankings(c);let result=superBallonResult(c)!;assert.equal(result.complete,true);assert.equal(result.rows[0].playerId,c.player.id);assert.equal(result.rows[0].points,500);
 const awards=evaluateSuperBallon(c);assert.equal(awards.length,1);assert.equal(retirementAwardName(awards[0]),'슈퍼 발롱도르(최근 5년 내 성적으로 집계 수상)');c.awards.push(...awards);assert.deepEqual(evaluateSuperBallon(c),[]);
 c.systems!.rankings.pop();assert.equal(superBallonResult(c)!.complete,false);assert.deepEqual(evaluateSuperBallon(c),[]);c.season.year=2031;assert.equal(superBallonResult(c),undefined);
});
test('five-year evaluation rewards sustained results over one annual spike and respects historical position-aware scores',()=>{
 const c=fresh();rankings(c);const prior=JSON.stringify(c.systems!.rankings);
 for(const r of c.systems!.rankings)if(r.year<2030){r.candidates=[{...r.candidates[1],rank:1},{...r.candidates[0],score:1,rank:2}];}
 const result=superBallonResult(c)!;assert.equal(result.rows[0].playerId,'rival');assert.deepEqual(evaluateSuperBallon(c),[]);assert.notEqual(JSON.stringify(c.systems!.rankings),prior);
 const text=buildCareerText({...c,awards:[{id:'2030:super-ballon:x',name:'슈퍼 발롱도르',year:2030,clubId:c.player.clubId,category:'world',description:'검수'}]});assert.match(text,/슈퍼 발롱도르\(최근 5년 내 성적으로 집계 수상\)/);
});
