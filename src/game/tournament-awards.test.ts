import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStats } from './math';
import { evaluateTournamentAwards } from './tournament-awards';
import type { Career, MatchRecord, PlayerStats, Position } from './types';
import type { MatchPerformance } from './revision-types';

function player(id:string,extra:Partial<PlayerStats>={},position:Position='ST'):MatchPerformance {
  const stats={...emptyStats(),apps:1,starts:1,minutes:90,ratingSum:7,ratingCount:1,detailedApps:1,...extra};
  return {id,name:id,clubId:id==='user'?'KR1_01':'KR1_02',position,ovr:60,stats,rating:stats.ratingSum,minutes:stats.minutes,started:true};
}
function match(stage:'qualifying'|'semifinal'|'final',players:MatchPerformance[],competitionId='WC:2026',label='own'):MatchRecord {
  return {id:`${competitionId}:${stage}:${label}`,fixtureId:`NAT|senior|${competitionId}|${stage}|${label}`,round:1,seasonYear:2026,homeId:'NAT:대한민국:senior',awayId:'NAT:일본:senior',homeGoals:1,awayGoals:0,events:[],playerClubId:'NAT:대한민국:senior',playerPlayed:players.some(p=>p.id==='user'),playerStarted:true,playerMinutes:90,playerRating:7,playerStats:players.find(p=>p.id==='user')?.stats??emptyStats(),seed:'test',scope:'national',competitionId,performers:players};
}
function career(matches:MatchRecord[],position:Position='ST'):Career {
  return {player:{id:'user',name:'user',clubId:'KR1_01',position},season:{year:2026,playerStats:{...emptyStats(),goals:999}},systems:{national:{history:[],matches,teamResults:[]}}} as unknown as Career;
}
const boots=(c:Career)=>evaluateTournamentAwards(c).filter(a=>a.id.includes(':golden-boot:'));

test('FIFA personal awards compare the whole played finals field, excluding club and qualifying goals',()=>{
  const c=career([
    match('qualifying',[player('user',{goals:50})]),
    match('semifinal',[player('user',{goals:2}),player('teammate')]),
    match('final',[player('user'),player('rival',{goals:2})]),
  ]);
  c.systems!.national.teamResults=[match('semifinal',[player('rival',{goals:3}),player('other')],'WC:2026','other')];
  assert.equal(boots(c).length,0,'a rival with five actual finals goals beats two user finals goals');
  c.systems!.national.teamResults[0].performers![0].stats.goals=0;
  assert.equal(boots(c).length,1,'the finals tally now ties at two with identical minutes');
});

test('Golden Boot tie-breaks use assists and then actual minutes, preserving exact ties',()=>{
  const c=career([match('final',[player('user',{goals:3,assists:2,minutes:90}),player('rival',{goals:3,assists:1,minutes:60})])]);
  assert.equal(boots(c).length,1);
  const rival=c.systems!.national.matches[0].performers![1].stats;
  rival.assists=2;
  assert.equal(boots(c).length,0,'fewer minutes wins when goals and assists tie');
  rival.minutes=90;
  assert.equal(boots(c).length,1);
  assert.match(boots(c)[0].description,/공동/);
});

test('unfinished finals and qualifier-only appearances create no personal tournament awards',()=>{
  const unfinished=career([match('semifinal',[player('user',{goals:9,ratingSum:10})])]);
  assert.deepEqual(evaluateTournamentAwards(unfinished),[]);
  const qualifierOnly=career([match('qualifying',[player('user',{goals:9,ratingSum:10})]),match('final',[player('rival',{goals:1})])]);
  assert.deepEqual(evaluateTournamentAwards(qualifierOnly),[]);
});

test('Golden Glove compares only actual goalkeeper performance and U20 uses its own real award names',()=>{
  const c=career([match('final',[player('user',{saves:9,shotsFaced:10,goalsConceded:1,ratingSum:9},'GK'),player('rival',{saves:1,shotsFaced:4,goalsConceded:3,ratingSum:6},'GK')],'U20WC:2027')],'GK');
  const awards=evaluateTournamentAwards(c);
  assert.equal(awards.filter(a=>a.id.includes(':golden-glove:')).length,1);
  assert.ok(awards.every(a=>a.name.includes('2027 FIFA U-20 월드컵')));
  assert.ok(awards.every(a=>a.organiser==='FIFA'&&a.criterion?.includes('4팀')));
  const user=c.systems!.national.matches[0].performers![0];user.ovr=1;
  assert.deepEqual(evaluateTournamentAwards(c),awards,'ability does not replace played tournament performance');
});

test('archived/current duplicate fixtures are counted once and old completed tournaments are not awarded again',()=>{
  const final=match('final',[player('user',{goals:2}),player('rival',{goals:1})]);
  const c=career([final]);
  const once=evaluateTournamentAwards(c);
  c.systems!.national.history=[{year:2026,squad:'senior',competitionId:'WC:2026',competitionName:'2026 FIFA 월드컵',stats:final.playerStats,matches:[structuredClone(final)],result:'우승',qualified:true}];
  const snapshot=JSON.stringify(c);
  assert.deepEqual(evaluateTournamentAwards(c),once);
  assert.equal(JSON.stringify(c),snapshot,'award evaluation is pure');
  c.season.year=2027;
  assert.deepEqual(evaluateTournamentAwards(c),[]);
});
