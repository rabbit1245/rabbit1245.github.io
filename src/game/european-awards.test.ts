import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer } from './engine';
import { leagueAwardRules } from './award-rules';
import { evaluateAwards } from './career-systems';
import { clubAwardRules, evaluateClubAwards } from './club-awards';
import { selectEleven, awardPositionGroup } from './award-selection';
import { emptyStats } from './math';
import type { Career, Position } from './types';
import type { ClubTournament, CompetitorSeason } from './revision-types';

const positions:Position[]=['GK','LB','CB','CB','RB','CDM','CM','CAM','LW','ST','RW'];
function fixture(code='UCL',position:Position='ST') {
  const c={player:{id:'user',clubId:'EN1_12',position,squad:'senior',ovr:1},season:{year:2026,playerStats:{...emptyStats(),goals:999}},awards:[],history:[],systems:{}} as unknown as Career;
  let own=false;
  const rows:CompetitorSeason[]=positions.map((p,i)=>{
    const user=p===position&&!own;if(user)own=true;
    return {playerId:user?'user':`other-${i}`,name:user?'user':`other-${i}`,position:p,clubId:user?'EN1_12':'EN1_13',leagueId:'EN1',nationality:'영국',ovr:user?1:120,
      stats:{...emptyStats(),apps:10,starts:10,minutes:900,ratingCount:10,ratingSum:user?98:68,goals:user&&p==='ST'?12:1,assists:2,passes:500,passesCompleted:450,tackles:20,interceptions:20,saves:p==='GK'?40:0,shotsFaced:p==='GK'?45:0,goalsConceded:p==='GK'?5:0,cleanSheets:5}};
  });
  const t={id:`${code}:2026`,name:`UEFA ${code}`,year:2026,kind:'continental',phase:'completed',winnerId:'EN1_13',entrants:['EN1_12','EN1_13'],fixtures:[],matches:[],table:[],playerStats:Object.fromEntries(rows.map(r=>[r.playerId,r]))} as unknown as ClubTournament;
  return {c,t,own:t.playerStats!.user};
}

test('the missing European awards are nine distinct additions without duplicate league MVPs or teams',()=>{
  for(const id of ['ES1','DE1','FR1']){
    const rules=leagueAwardRules(id,id);assert.equal(rules.filter(r=>r.metric==='performance').length,1);assert.equal(rules.filter(r=>r.metric==='eleven').length,1);assert.equal(new Set(rules.map(r=>r.id)).size,rules.length);
  }
  for(const id of ['EN1','IT1','KR1'])assert.equal(leagueAwardRules(id,id).filter(r=>r.metric==='performance').length,1);
  for(const code of ['UCL','UEL','UECL'])assert.deepEqual(clubAwardRules(fixture(code).t).map(r=>r.metric),['performance','goals','eleven']);
});

for(const code of ['UCL','UEL','UECL'])test(`${code} awards use only its all-participant cup ledger, including eliminated players`,()=>{
  const {c,t}=fixture(code),before=JSON.stringify({c,t});
  const awards=evaluateClubAwards(c,t).awards;
  assert.deepEqual(awards.map(a=>a.id),['player-season','top-scorer','season-eleven'].map(k=>`${t.id}:${k}:user`));
  assert.ok(awards.every(a=>a.clubId==='EN1_12'&&a.organiser==='UEFA'&&a.verification==='game-model'&&a.criterion&&a.evaluationPeriod));
  assert.ok(awards.every(a=>!a.description.includes('999')));assert.equal(JSON.stringify({c,t}),before,'pure evaluation cannot rewrite a ledger');
  c.player.ovr=120;c.player.clubId='FA';c.season.playerStats.goals=0;
  assert.deepEqual(evaluateClubAwards(c,t).awards,awards,'ability and current FA status do not change actual cup achievements');
  c.awards=awards;assert.ok(evaluateClubAwards(c,t).diagnostics.every(d=>d.result==='수상'));
});

test('UEFA top scoring shares a goals tie without ability, assists, minutes, popularity or shootout tie-breaks',()=>{
  const {c,t}=fixture(),r=t.playerStats!['other-8'];r.stats.goals=12;r.stats.assists=99;r.stats.minutes=90;
  const scorer=()=>evaluateClubAwards(c,t).awards.find(a=>a.id.includes(':top-scorer:'));
  assert.match(scorer()!.description,/공동/);assert.match(scorer()!.description,/12골/);
  r.stats.goals=13;assert.equal(scorer(),undefined);
  r.stats.goals=0;t.playerStats!.user.stats.goals=0;assert.equal(scorer(),undefined,'a zero-goal season has no top scorer');
});

test('unfinished, old, absent, youth and unplayed cup records never create new awards',()=>{
  for(const change of [({t}:ReturnType<typeof fixture>)=>{t.phase='knockout';},({t}:ReturnType<typeof fixture>)=>{t.year=2025;},({t}:ReturnType<typeof fixture>)=>{delete t.playerStats;},({c}:ReturnType<typeof fixture>)=>{c.player.squad='youth';},({own}:ReturnType<typeof fixture>)=>{own.stats.apps=0;own.stats.minutes=0;}]){
    const f=fixture();change(f);assert.deepEqual(evaluateClubAwards(f.c,f.t).awards,[]);
  }
  for(const format of ['super','intercontinental'] as const){const {c,t}=fixture();t.format=format;assert.deepEqual(evaluateClubAwards(c,t),{awards:[],diagnostics:[]});}
});

test('one prolific cameo can earn the objective scorer award but not MVP or a season eleven place',()=>{
  const {c,t,own}=fixture();own.stats.apps=1;own.stats.minutes=10;
  assert.deepEqual(evaluateClubAwards(c,t).awards.map(a=>a.id),[`${t.id}:top-scorer:user`]);
  const {awards,diagnostics}=evaluateClubAwards(c,t);assert.equal(awards.length,1);assert.ok(diagnostics.filter(d=>!d.name.includes('득점왕')).every(d=>!d.eligible));
});

test('the season eleven requires all eleven slots and compares goalkeepers, defenders, midfielders and forwards separately',()=>{
  for(const position of ['GK','CB','CM','ST'] as const){
    const {c,t}=fixture('UCL',position),award=evaluateClubAwards(c,t).awards.find(a=>a.id.includes(':season-eleven:'));
    assert.ok(award);assert.equal(award.position,position);
    const ranked=Object.values(t.playerStats!),eleven=selectEleven(ranked,4,3,3);
    assert.equal(new Set(eleven.map(r=>r.playerId)).size,11);
    assert.deepEqual(['GK','DEF','MID','FWD'].map(g=>eleven.filter(r=>awardPositionGroup(r.position)===g).length),[1,4,3,3]);
  }
  const {c,t}=fixture();delete t.playerStats!['other-0'];assert.ok(!evaluateClubAwards(c,t).awards.some(a=>a.id.includes(':season-eleven:')),'missing goalkeeper cannot produce a fictional XI');
});

test('non-European continental MVP and the existing club World Cup Golden Ball are preserved without invented new awards',()=>{
  for(const code of ['AFC_ELITE','CLUB_WORLD_CUP']){
    const {c,t}=fixture(code);assert.equal(clubAwardRules(t).length,1);assert.equal(evaluateClubAwards(c,t).awards[0].id,`${t.id}:player-season:user`);
    if(code==='CLUB_WORLD_CUP')assert.equal(evaluateClubAwards(c,t).awards[0].name,'FIFA 클럽 월드컵 골든볼');
  }
});

function leagueFixture(clubId:string){
  const c=createCareer({name:'유럽 수상',nationality:'대한민국',age:25,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:'포처',clubId,squad:'senior',difficulty:'realistic',seed:`awards-${clubId}`,training:[]});
  // A compact adjudication fixture; full real-match/save coverage is run separately.
  delete c.systems!.employment;c.stage='offseason';c.season.completed=true;c.season.week=c.season.totalWeeks;
  c.season.playerStats={...emptyStats(),apps:30,starts:30,minutes:2700,goals:36,assists:20,ratingCount:30,ratingSum:285};
  c.systems!.world.playerStats.rival={playerId:'rival',name:'rival',clubId,leagueId:c.season.leagueId,position:'ST',nationality:'대한민국',ovr:120,stats:{...emptyStats(),apps:30,starts:30,minutes:2700,goals:10,ratingCount:30,ratingSum:195}};
  return c;
}

for(const [club,name]of [['ES1_01','라리가 시즌 최우수 선수'],['DE1_01','분데스리가 시즌 최우수 선수'],['FR1_01','UNFP 리그 1 올해의 선수']])test(`${name} is adjudicated once through season awards, with league-only eligibility`,()=>{
  const c=leagueFixture(club),won=evaluateAwards(c),mvp=won.filter(a=>a.name===name);
  assert.equal(mvp.length,1);assert.equal(mvp[0].category,'league');assert.equal(mvp[0].verification,'game-model');
  assert.ok(c.systems!.rankings[0].diagnostics!.some(d=>d.name===name&&d.result==='수상'));assert.deepEqual(evaluateAwards(c),won);assert.equal(c.awards.filter(a=>a.name===name).length,1);
  const cameo=leagueFixture(club);cameo.season.playerStats.apps=1;cameo.season.playerStats.minutes=30;assert.ok(!evaluateAwards(cameo).some(a=>a.name===name),'high ability or totals without minimum league participation do not suffice');
  const cupsOnly=leagueFixture(club);cupsOnly.season.playerStats=emptyStats();cupsOnly.systems!.clubCompetitions!.current[0].playerStats={user:{...cupsOnly.systems!.world.playerStats.rival,playerId:cupsOnly.player.id,stats:{...c.season.playerStats,goals:999}}};assert.ok(!evaluateAwards(cupsOnly).some(a=>a.name===name));
});
