import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUBS, LEAGUES, getClub } from './data';
import { calculateTable, createCareer } from './engine';
import { emptyStats } from './math';
import { LEAGUE_MODEL_POLICY, getLeagueRule } from './league-rules';
import { simulateMatch } from './match-engine';
import { createWorld, getClubWorldPower, getSeasonClubIds, getWorldClubPlayers, getYouthClubPlayers, processWorldRound, transitionWorldSeason } from './world';
import type { Career, MatchRecord } from './types';
import type { CareerSystems } from './revision-types';

function fresh(clubId='EN2_01'): Career {
  const valid=CLUBS.find(club=>club.id===clubId)??CLUBS.find(club=>club.leagueId==='EN2')!;
  const career=createCareer({name:'세계 검증',nationality:'대한민국',age:20,height:178,weight:72,foot:'right',position:'ST',talent:'A',style:'포처',clubId:valid.id,squad:'senior',difficulty:'realistic',seed:'persistent-world-test'});
  // A minimal host also exercises world creation before the enclosing systems object exists.
  delete career.systems;
  const world=createWorld(career);
  career.systems={world,events:[]} as unknown as CareerSystems;
  return career;
}

test('the persistent world contains every retained club, independently generated fixtures and real squad strength',()=>{
  const career=fresh(), world=career.systems!.world;
  assert.equal(Object.keys(world.clubs).length,913);
  assert.equal(Object.keys(world.competitions).length,50);
  assert.ok(Object.keys(world.players).length>17_000);
  for (const league of LEAGUES) {
    const ids=getSeasonClubIds(career,league.id), comp=world.competitions[league.id];
    assert.equal(comp.fixtures.length,ids.length*(ids.length-1));
    assert.equal(comp.table.length,ids.length);
    assert.ok(comp.fixtures.every(f=>ids.includes(f.homeId)&&ids.includes(f.awayId)));
  }
  assert.deepEqual(world.competitions[career.season.leagueId].fixtures,career.season.fixtures);
  assert.notEqual(world.competitions[career.season.leagueId].fixtures,career.season.fixtures);
  const power=getClubWorldPower(career,career.player.clubId);
  for (const id of world.clubs[career.player.clubId].rosterIds) if(id!==career.player.id) world.players[id].ovr=90;
  assert.equal(getClubWorldPower(career,career.player.clubId),power,'NPC rating inflation cannot overwrite the club baseline');
  career.player.ovr=99;
  assert.ok(getWorldClubPlayers(career,career.player.clubId).some(p=>p.id===career.player.id&&p.ovr===99));
});

test('one world round reconciles actual scores and both teams individual statistics and is idempotent',()=>{
  const career=fresh(), world=career.systems!.world;
  // Isolate two real competitions so this contract test stays small.
  const active=world.competitions[career.season.leagueId], second=world.competitions.KR1;
  world.competitions={[active.leagueId]:active,KR1:second};
  const matches:MatchRecord[]=[];
  for (const fixture of career.season.fixtures.filter(f=>f.round===1)) {
    const match=simulateMatch(career,fixture,{home:{...getClub(fixture.homeId),power:getClubWorldPower(career,fixture.homeId)},away:{...getClub(fixture.awayId),power:getClubWorldPower(career,fixture.awayId)},homePlayers:getWorldClubPlayers(career,fixture.homeId),awayPlayers:getWorldClubPlayers(career,fixture.awayId),userParticipates:false,detailed:false});
    matches.push(match);fixture.played=true;fixture.homeGoals=match.homeGoals;fixture.awayGoals=match.awayGoals;
  }
  career.season.week=1;
  career.season.totalWeeks=22; // Align the second competition's progress for a full source round.
  career.season.table=calculateTable(career.season.fixtures,career.season.table.map(row=>row.clubId));
  processWorldRound(career,matches);
  assert.deepEqual(active.fixtures,career.season.fixtures);
  assert.equal(second.round,1);
  assert.deepEqual(second.table,calculateTable(second.fixtures,second.table.map(row=>row.clubId)));
  for (const match of matches) for (const performer of match.performers??[]) {
    const stats=world.playerStats[performer.id]?.stats;
    assert.equal(stats?.goals,performer.stats.goals);
    assert.equal(stats?.assists,performer.stats.assists);
    assert.equal(stats?.ratingCount,performer.stats.ratingCount);
    assert.equal(stats?.cleanSheets,performer.stats.cleanSheets);
  }
  const goals=Object.values(world.playerStats).reduce((n,p)=>n+p.stats.goals,0);
  const fixtureGoals=Object.values(world.competitions).flatMap(c=>c.fixtures).filter(f=>f.played).reduce((n,f)=>n+(f.homeGoals??0)+(f.awayGoals??0),0);
  assert.equal(goals,fixtureGoals);
  const statsSnapshot=JSON.stringify(world.playerStats);
  processWorldRound(career,matches);
  assert.equal(JSON.stringify(world.playerStats),statsSnapshot);
});

test('promotion changes real membership, next opponents and fixtures while retaining every league capacity',()=>{
  const career=fresh(), world=career.systems!.world;
  const counts=Object.fromEntries(LEAGUES.map(league=>[league.id,getSeasonClubIds(career,league.id).length]));
  const oldRoster=[...world.clubs[career.player.clubId].rosterIds];
  const oldLeague=world.clubs[career.player.clubId].leagueId;
  const oldOpponents=getSeasonClubIds(career,oldLeague);
  const table=world.competitions[oldLeague].table;
  table.sort((a,b)=>a.clubId===career.player.clubId?-1:b.clubId===career.player.clubId?1:0);
  for (const state of Object.values(world.competitions)) state.table.forEach((row,index)=>{row.played=state.totalRounds;row.points=(state.table.length-index)*3;});
  transitionWorldSeason(career);
  assert.equal(world.year,career.season.year+1);
  assert.equal(world.clubs[career.player.clubId].leagueId,'EN1');
  const nextIds=getSeasonClubIds(career,'EN1');
  assert.ok(nextIds.includes(career.player.clubId));
  assert.ok(nextIds.some(id=>!oldOpponents.includes(id)));
  const fixtures=world.competitions.EN1.fixtures.filter(f=>f.homeId===career.player.clubId||f.awayId===career.player.clubId);
  assert.equal(fixtures.length,2*(nextIds.length-1));
  assert.ok(fixtures.every(f=>nextIds.includes(f.homeId)&&nextIds.includes(f.awayId)));
  assert.ok(oldRoster.filter(id=>world.players[id]).length>=oldRoster.length-5,'normal offseason preserves most of the squad');
  assert.ok(world.movements.some(m=>m.clubId===career.player.clubId&&m.toLeagueId==='EN1'));
  for (const league of LEAGUES) assert.equal(getSeasonClubIds(career,league.id).length,counts[league.id],league.id);
  assert.equal(Object.keys(world.clubs).length,913);
  assert.deepEqual(world.playerStats,{});
  const snapshot=JSON.stringify(world);
  transitionWorldSeason(career);
  assert.equal(JSON.stringify(world),snapshot,'a transition cannot execute twice against the same current season');
});

test('closed US leagues and unverified Korea K2/K3 and Dutch 2/3 connections never swap members',()=>{
  const career=fresh(), before=Object.fromEntries(['US1','US2','US3A','US3B','KR3','NL3'].map(id=>[id,getSeasonClubIds(career,id)]));
  transitionWorldSeason(career);
  for (const [id,ids] of Object.entries(before)) assert.deepEqual(getSeasonClubIds(career,id),ids,id);
  assert.equal(getLeagueRule('US1').automatic,false);
  assert.equal(getLeagueRule('KR3').automatic,false);
  assert.equal(getLeagueRule('KR2').relegation,0);
  assert.equal(getLeagueRule('KR1').startMonth,1);
  assert.equal(getLeagueRule('BR1').startMonth,1);
  assert.equal(getLeagueRule('EN1').startMonth,7);
  assert.match(getLeagueRule('JP1').note,/2026.*전환/);
  assert.match(LEAGUE_MODEL_POLICY,/검증/);
});

test('squad age, retirements and finances explain next-season power without an annual random reset',()=>{
  const career=fresh(), world=career.systems!.world;
  const club=world.clubs[career.player.clubId], initialPower=getClubWorldPower(career,club.id);
  const originalId=club.rosterIds.find(id=>id!==career.player.id)!;
  const originalAge=world.players[originalId].age;
  const oldRevenue=club.revenue;
  // A young squad with no retirees must keep stable strength while its members develop.
  for (const id of club.rosterIds) if (id!==career.player.id) {world.players[id].age=23;world.players[id].potential=world.players[id].ovr;}
  transitionWorldSeason(career);
  assert.ok(Math.abs(getClubWorldPower(career,club.id)-initialPower)<1,'no unrelated yearly power shock');
  assert.equal(world.players[originalId]?.age,24);
  assert.ok(club.changes.some(reason=>reason.includes('전력')));
  assert.ok(club.wageBudget>0&&club.budget>=0&&club.revenue>0);
  assert.ok(club.revenue!==oldRevenue || club.leagueId===getClub(club.id).leagueId);
  assert.ok(originalAge>0);
  // Existing non-user injuries reduce the XI available to the next actual match.
  const before=getClubWorldPower(career,club.id);
  for (const id of club.rosterIds) if(id!==career.player.id)world.players[id].injuryWeeks=8;
  assert.ok(getClubWorldPower(career,club.id)<before-5);
  assert.deepEqual(getWorldClubPlayers(career,club.id).map(p=>p.id),[career.player.id]);
});

test('a legacy season imports its known personal match only and does not fabricate NPC history',()=>{
  const career=fresh(), stats=emptyStats();stats.apps=1;stats.minutes=90;stats.goals=1;stats.ratingCount=1;stats.ratingSum=7;
  const fixture=career.season.fixtures[0];
  fixture.played=true;fixture.homeGoals=1;fixture.awayGoals=0;
  career.season.week=1;
  career.season.matches=[{id:'old',fixtureId:fixture.id,round:1,seasonYear:2026,homeId:fixture.homeId,awayId:fixture.awayId,homeGoals:1,awayGoals:0,events:[],playerClubId:career.player.clubId,playerPlayed:true,playerStarted:true,playerMinutes:90,playerRating:7,playerStats:stats,seed:'old'}];
  delete career.systems;
  const world=createWorld(career);
  assert.equal(Object.keys(world.playerStats).length,1);
  assert.equal(world.playerStats[career.player.id].stats.goals,1);
  assert.equal(world.competitions[career.season.leagueId].round,1);
  assert.equal(world.competitions[career.season.leagueId].fixtures.find(f=>f.id===fixture.id)?.played,true);
  const previousClub=career.player.clubId;
  career.player.clubId=CLUBS.find(c=>c.id!==previousClub)!.id;
  const signedWorld=createWorld(career);
  assert.equal(signedWorld.playerStats[career.player.id].clubId,previousClub,'an old season ledger keeps the club actually represented before an offseason transfer');
});

test('youth fixtures remain separate from the senior table, player statistics and promotion results',()=>{
  const career=fresh();career.player.squad='youth';career.player.age=17;
  const fixture=career.season.fixtures.find(f=>f.round===1&&(f.homeId===career.player.clubId||f.awayId===career.player.clubId))!;
  // An unmistakable academy result must never enter the senior world, including on migration.
  fixture.played=true;fixture.homeGoals=99;fixture.awayGoals=0;career.season.week=1;
  career.season.table=calculateTable(career.season.fixtures,career.season.table.map(r=>r.clubId));
  const academyStats=emptyStats();academyStats.apps=1;academyStats.minutes=90;academyStats.goals=99;
  const academyMatch:MatchRecord={id:'academy-only',fixtureId:fixture.id,round:1,seasonYear:career.season.year,homeId:fixture.homeId,awayId:fixture.awayId,homeGoals:99,awayGoals:0,events:[],playerClubId:career.player.clubId,playerPlayed:true,playerStarted:true,playerMinutes:90,playerRating:10,playerStats:academyStats,seed:'academy-only'};
  career.season.matches=[academyMatch];career.season.playerStats={...academyStats};
  delete career.systems;
  const world=createWorld(career), senior=world.competitions[career.season.leagueId];
  career.systems={world,events:[]} as unknown as CareerSystems;
  world.competitions={[senior.leagueId]:senior};
  assert.equal(senior.round,0);
  assert.equal(senior.fixtures.find(f=>f.id===fixture.id)!.played,false);
  assert.deepEqual(world.playerStats,{});
  assert.ok(!getWorldClubPlayers(career,career.player.clubId).some(p=>p.id===career.player.id));
  processWorldRound(career,[academyMatch]);
  const adult=senior.fixtures.find(f=>f.id===fixture.id)!;
  assert.equal(senior.round,1);assert.equal(adult.played,true);
  assert.ok(adult.homeGoals!<99,'the senior fixture must be independently simulated');
  assert.equal(world.playerStats[career.player.id],undefined,'academy player does not compete for senior league awards');
  assert.deepEqual(senior.table,calculateTable(senior.fixtures,senior.table.map(r=>r.clubId)));
  assert.equal(career.season.fixtures.find(f=>f.id===fixture.id)!.homeGoals,99,'academy ledger remains intact');
  const scored=Object.values(world.playerStats).reduce((n,p)=>n+p.stats.goals,0);
  const goals=senior.fixtures.filter(f=>f.played).reduce((n,f)=>n+f.homeGoals!+f.awayGoals!,0);
  assert.equal(scored,goals);
  const snapshot=JSON.stringify(world);
  processWorldRound(career,[academyMatch]);
  assert.equal(JSON.stringify(world),snapshot,'the independent senior round remains idempotent');
});

test('academy squads retain eligible young players and visibly replace only missing positional depth',()=>{
  const career=fresh();career.player.squad='youth';career.player.age=17;
  const world=career.systems!.world, club=world.clubs[career.player.clubId];
  const retained=club.rosterIds.find(id=>id!==career.player.id)!;
  world.players[retained].age=19;world.players[retained].injuryWeeks=0;
  const injured=club.rosterIds.find(id=>id!==career.player.id&&id!==retained)!;
  world.players[injured].age=19;world.players[injured].injuryWeeks=5;
  const first=getYouthClubPlayers(career,club.id);
  assert.ok(first.some(p=>p.id===retained));assert.ok(!first.some(p=>p.id===injured));
  assert.ok(first.some(p=>p.id===career.player.id));
  assert.deepEqual(getYouthClubPlayers(career,club.id),first,'a repeated view does not reroll academy players');
  for(const p of first){
    if(world.players[p.id])assert.ok(world.players[p.id].age<=20&&world.players[p.id].injuryWeeks===0,p.id);
    else{assert.match(p.id,/^academy:/);assert.match(p.name,/\(가상\)/);}
  }
  for(const position of ['GK','CB','LB','RB','CDM','CM','CAM','LW','RW','ST'])assert.ok(first.some(p=>p.position===position),position);
  assert.ok(first.filter(p=>p.position==='GK').length>=2);
  assert.ok(first.length>=18);
});
