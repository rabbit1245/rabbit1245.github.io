import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createCareer,calculateTable} from './engine';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from './attributes';
import {CLUBS} from './data';
import {createNational,nationalSquadPlayers,nationalRosterPower} from './national';
import {getCaptainAssessment} from './captain';
import {worldPlayerAbility,getClubRatingOffset,transitionWorldSeason,getClubWorldPower} from './world';
import {evaluateAwards} from './career-systems';
import {buildCareerText} from './career-text';
import {emptyStats,sumStats} from './math';
import {nationalityForPlayer} from './national-data';
import type {Career,MatchRecord,PlayerStats,Position} from './types';
import type {ClubTournament,CompetitorSeason} from './revision-types';
const inter=CLUBS.find(c=>c.name==='인테르')!.id;
const fresh=()=>createCareer({name:'쵸비 검증',nationality:'포르투갈',age:25,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:PLAY_STYLES.ST[0],clubId:inter,squad:'senior',difficulty:'realistic',seed:'realism-followup'});
const stat=(v:Partial<PlayerStats>):PlayerStats=>({...emptyStats(),...v});

test('inflated internal NPC ratings never give a different club/national ability or false captain XI average',()=>{
 const c=fresh(),world=c.systems!.world,portugal=Object.values(world.players).filter(p=>p.nationality==='포르투갈'&&p.age<=40);
 for(const clubId of new Set(portugal.map(p=>p.clubId)))for(const id of world.clubs[clubId].rosterIds)if(id!==c.player.id)world.players[id].ovr+=12;
 c.player.ovr=90;c.player.attributes=Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,90]));
 c.season.week=20;c.season.playerStats=stat({apps:20,starts:20,minutes:1800,goals:15,assists:5,ratingCount:20,ratingSum:150});
 c.systems!.national=createNational(c);const roster=nationalSquadPlayers(c,'포르투갈','senior');
 assert.ok(roster.some(p=>p.id===c.player.id),'a healthy in-form world-class striker competes on the same ability scale');
 assert.equal(roster.length,26);assert.ok(roster.filter(p=>['ST','CF','SS'].includes(p.position)).length>=2,'there is centre-forward bench coverage');
 assert.ok(roster.filter(p=>p.position==='LW').length>=2);assert.ok(roster.filter(p=>p.position==='RW').length>=2);
 const offsets=new Map<string,number>();for(const p of roster)if(world.players[p.id])assert.equal(p.ovr,worldPlayerAbility(c,world.players[p.id],offsets));
 assert.equal(nationalRosterPower(c,'포르투갈','senior'),roster.slice(0,11).reduce((n,p)=>n+p.ovr,0)/11);
 const assessment=getCaptainAssessment(c,'national');assert.ok(Math.abs(assessment.squadOvr-nationalRosterPower(c,'포르투갈','senior'))<=.051);
 assert.ok(portugal.some(p=>getClubRatingOffset(c,p.clubId)<-8),'the fixture really has inflated raw records');
});

test('26-man national squads still exclude injuries and preserve real forward competition',()=>{
 const c=fresh();c.player.ovr=35;c.systems!.national=createNational(c);assert.ok(!nationalSquadPlayers(c,'포르투갈','senior').some(p=>p.id===c.player.id));
 c.player.ovr=90;c.player.injuryWeeks=4;assert.ok(!nationalSquadPlayers(c,'포르투갈','senior').some(p=>p.id===c.player.id));
});

let completed:Career;
function source(){return completed??=JSON.parse(gunzipSync(readFileSync(new URL('../../tests/fixtures/v272-offseason.json.gz',import.meta.url))).toString()).career;}
function treble(position:Position='ST',rating=7.4,titles=true):Career{
 const old=source(),year=old.season.year,comp=old.systems!.world.competitions.IT1;
 const c:Career={...old,stage:'offseason',awards:[],history:[],player:{...old.player,name:'쵸비 검증',clubId:inter,position,style:PLAY_STYLES[position][0],ovr:90,squad:'senior'},season:{...old.season,leagueId:'IT1',totalWeeks:comp.totalRounds,week:comp.totalRounds,completed:true,playerStats:stat({apps:34,starts:32,minutes:2900,goals:17,assists:10,ratingCount:34,ratingSum:rating*34,mom:7,shots:105,shotsOnTarget:52,passes:1100,passesCompleted:935,keyPasses:67,dribbleAttempts:120,dribblesCompleted:78,tackles:26,interceptions:21})},systems:{...old.systems!,rankings:[],national:{...old.systems!.national,matches:[],history:[],teamResults:[],tournamentStats:{}},world:{...old.systems!.world,competitions:{...old.systems!.world.competitions},playerStats:{...old.systems!.world.playerStats}},clubCompetitions:{version:1,year,current:[],history:[]}}};
 const table=comp.table.map(r=>r.clubId===inter?{...r,played:38,won:29,drawn:6,lost:3,points:93}:r).sort((a,b)=>b.points-a.points);
 c.systems!.world.competitions.IT1={...comp,round:comp.totalRounds,table};c.season.table=table;
 const own:CompetitorSeason={playerId:c.player.id,name:c.player.name,clubId:inter,leagueId:'IT1',position,nationality:c.player.nationality,ovr:90,stats:c.season.playerStats};c.systems!.world.playerStats[c.player.id]=own;
 for(const [code,name,kind,apps,goals,assists]of [['UCL','UEFA 챔피언스리그','continental',12,4,3],['COPPA','코파 이탈리아','cup',5,2,2]] as const){
  const id=`${code}:${year}`,matches:MatchRecord[]=Array.from({length:apps},(_,i)=>({id:`${id}:m${i}`,fixtureId:`${id}:m${i}`,seasonYear:year,playerClubId:inter,homeId:inter,awayId:'IT1_02',playerPlayed:true,playerStarted:true,playerMinutes:90,round:i+1,homeGoals:2,awayGoals:0,playerRating:rating,seed:'declared-fixture',events:[],playerStats:stat({apps:1,starts:1,minutes:90,ratingCount:1,ratingSum:rating,goals:i<goals?1:0,assists:i<assists?1:0})}) as MatchRecord);
  const cup:ClubTournament={id,name,year,kind,phase:'completed',entrants:[inter,'IT1_02'],winnerId:titles?inter:'IT1_02',matches,playerStats:{[c.player.id]:{...own,stats:sumStats(matches.map(m=>m.playerStats))}},active:[],byes:[],fixtures:[],table:[],stage:'우승 확정',step:1,leagueRounds:0,basis:'Explicit regression scenario, not the user save',rules:'regression fixture',startedAtRound:0};
  c.systems!.clubCompetitions!.current.push(cup);
 }
 return c;
}

test('17 league goals and 10 assists by a major contributor to an Inter treble compete for Ballon shortlist and Serie A XI',()=>{
 const c=treble('RW');const awards=evaluateAwards(c),ranking=c.systems!.rankings[0];
 assert.notEqual(ranking.playerRank,null,JSON.stringify(ranking.diagnostics?.find(d=>d.name==='발롱도르')));
 assert.ok(awards.some(a=>a.name==='세리에 A 올해의 팀 · AIC'),JSON.stringify(ranking.diagnostics));
 assert.ok(ranking.diagnostics?.some(d=>d.name==='세리에 A 시즌 MVP'));
 assert.ok(ranking.diagnostics?.find(d=>d.name==='발롱도르')?.detail.includes('우승/대회 기여'));
 const lower=treble('RW',7.4,false);evaluateAwards(lower);const score=(x:Career)=>Number(x.systems!.rankings[0].diagnostics!.find(d=>d.name==='발롱도르')!.detail.match(/경기력 점수 ([\d.]+)/)![1]);assert.ok(score(c)>score(lower));
 const weaker=treble('RW');weaker.player.ovr=30;evaluateAwards(weaker);assert.ok(score(c)>score(weaker),'the new subjective award model includes ability while still requiring real performance');
 const previous=JSON.stringify(c.systems!.rankings);evaluateAwards(c);assert.equal(JSON.stringify(c.systems!.rankings),previous,'old adjudicated seasons remain idempotent');
});

test('weak or absent performances do not earn awards just by joining a treble winner',()=>{
 const c=treble();c.season.playerStats=emptyStats();c.systems!.world.playerStats[c.player.id].stats=c.season.playerStats;
 for(const t of c.systems!.clubCompetitions!.current){t.matches=[];delete t.playerStats![c.player.id];}
 assert.ok(!evaluateAwards(c).some(a=>a.category==='world'||a.id.includes(':aic-team:')));
});

test('career identity omits one ambiguous overall while each annual ability record remains intact',()=>{
 const c=source(),before=JSON.stringify(c),text=buildCareerText(c),basic=text.slice(0,text.indexOf('B. 통산'));
 assert.doesNotMatch(basic,/능력점수:/);assert.match(text,/능력점수:/);assert.equal(JSON.stringify(c),before);
});

test('real retained nationalities are independent of whether the old club mapper recognised the club',()=>{assert.equal(nationalityForPlayer('fc25_229188','포르투갈'),'그리스');assert.equal(nationalityForPlayer('fc25_224458','영국'),'포르투갈');});
