import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,emptyStats} from './engine';
import {PLAY_STYLES} from './attributes';
import {competitionGamesLabel,getCompetitionSeasons,getSeasonCompetitions} from './season-competitions';
import {tournamentResult} from './club-competitions';
import {buildCareerText} from './career-text';
import {CLUBS} from './data';
import type {ClubTournament,CupFixture} from './revision-types';
import type {MatchRecord} from './types';
const base=createCareer({name:'참여 대회 검증',nationality:'대한민국',age:19,height:178,weight:72,foot:'right',position:'CAM',talent:'A',style:PLAY_STYLES.CAM[0],clubId:'KR1_01',squad:'youth',difficulty:'realistic',seed:'competitions-v22'});
const make=()=>structuredClone(base);
const international=(id:string,apps=1):MatchRecord=>({id,fixtureId:`U20WC:2026|qualifying|${id}`,round:1,seasonYear:2026,homeId:'NAT:대한민국:U20',awayId:'NAT:일본:U20',homeGoals:1,awayGoals:0,events:[],playerClubId:'NAT:대한민국:U20',playerPlayed:apps>0,playerStarted:apps>0,playerMinutes:apps?90:0,playerRating:apps?7:0,playerStats:{...emptyStats(),apps,minutes:apps?90:0},seed:'fixture',scope:'national',competitionId:'U20WC:2026',date:'2026-06-05'});
test('a youth player sees the real U19 stage and no predicted senior or international cups',()=>{
 const c=make(),rows=getSeasonCompetitions(c);assert.match(rows[0].name,/U19/);assert.equal(rows[0].squad,'youth');
 assert.equal(rows[1].competitionId,undefined);assert.equal(rows[1].apps,0);assert.equal(rows.length,2);
});
test('actual national appearances are deduplicated, age-scoped and retain the qualifying stage',()=>{
 const c=make(),m=international('actual');c.systems!.national.matches=[m];c.systems!.national.history=[{year:2026,squad:'U20',competitionId:'U20WC:2026',competitionName:'2026 FIFA U-20 월드컵',stats:m.playerStats,matches:[structuredClone(m)],result:'예선',qualified:false}];
 const n=getSeasonCompetitions(c).find(row=>row.scope==='national')!;
 assert.equal(n.apps,1);assert.equal(n.minutes,90);assert.equal(n.squad,'U20');assert.match(n.name,/예선/);assert.doesNotMatch(n.name,/본선/);
 c.season.year++;assert.equal(getSeasonCompetitions(c).filter(row=>row.scope==='national'&&row.competitionId).length,0,'last year is not participation in a new season');
});
test('a stale called flag cannot fabricate participation for a new season or age group',()=>{
 const c=make();c.systems!.national.status='called';c.systems!.national.processedThrough='2025-11-18';c.systems!.national.processedWindows=['callup:2025-11:U20'];
 assert.equal(getSeasonCompetitions(c)[1].competitionId,undefined);
 c.player.age=21;assert.equal(getSeasonCompetitions(c)[1].squad,'senior');assert.equal(getSeasonCompetitions(c)[1].competitionId,undefined);
});
test('a verified current-season callup shows selection without inventing an appearance',()=>{
 const c=make(),n=c.systems!.national;n.status='called';n.processedThrough='2026-06-05';n.processedWindows=['callup:2026-06:U20'];
 const row=getSeasonCompetitions(c)[1];assert.equal(row.status,'called');assert.equal(row.apps,0);assert.ok(row.competitionId);assert.match(row.statusLabel,/출전 대기/);
});
test('offseason transfers do not relabel the club competition just completed',()=>{
 const c=make();c.stage='offseason';c.season.completed=true;
 c.season.matches=[{...international('club'),scope:'club',homeId:'KR1_01',awayId:'KR1_02',playerClubId:'KR1_01',competitionId:'KR1'}];
 c.player.clubId='EN1_01';const row=getSeasonCompetitions(c)[0];assert.equal(row.teamId,'KR1_01');assert.equal(row.competitionId,'KR1');assert.equal(row.status,'completed');
 c.season={...c.season,year:2027,leagueId:'EN1',competitionName:'프리미어리그',matches:[],week:0,completed:false,playerStats:emptyStats()};c.stage='season';c.player.squad='senior';
 const next=getSeasonCompetitions(c)[0];assert.equal(next.teamId,'EN1_01');assert.equal(next.competitionId,'EN1');assert.doesNotMatch(next.name,/U19/);
});

test('club cup results show the final league-phase place, then the actual knockout stage when applicable',()=>{
 const c=make(),teamId=c.player.clubId;
 c.player.squad='senior';c.season.competitionName='K리그1';
 const others=CLUBS.filter(club=>club.leagueId.startsWith('EN')).slice(0,35).map(club=>club.id);
 const teams=[...others.slice(0,28),teamId,...others.slice(28)];
 const empty={played:8,won:0,drawn:0,lost:8,goalsFor:0,goalsAgainst:8,points:0};
 const fixtures:CupFixture[]=others.slice(0,8).map((club,i)=>({id:`phase-${i}`,round:i+1,step:i+1,homeId:teamId,awayId:club,played:true,homeGoals:0,awayGoals:1,stage:'리그 페이즈',leg:1,tieId:`league-${i}`}));
 const cup:ClubTournament={id:'UCL:2026',name:'UEFA 챔피언스리그',year:2026,kind:'continental',basis:'시드',rules:'36팀',entrants:teams,phase:'completed',step:17,leagueRounds:8,stage:'우승 확정',active:[others[0]],byes:[],winnerId:others[0],fixtures,table:teams.map(clubId=>({clubId,...empty})),matches:fixtures.slice(0,6).map(f=>({...international(f.id),id:f.id,fixtureId:f.id,homeId:f.homeId,awayId:f.awayId,playerClubId:teamId,competitionId:'UCL:2026',scope:'club'})),startedAtRound:0};
 c.systems!.clubCompetitions!.current=[cup];
 let row=getSeasonCompetitions(c).find(row=>row.competitionId===cup.id)!;
 assert.equal(row.statusLabel,'리그 페이즈 29위 탈락');
 assert.equal(competitionGamesLabel(row),'내 출전 6경기 · 팀 8경기');
 cup.fixtures.push({...fixtures[0],id:'r16',stage:'16강',step:10,tieId:'r16',winnerId:others[0]});
 row=getSeasonCompetitions(c).find(row=>row.competitionId===cup.id)!;
 assert.equal(row.statusLabel,'16강 탈락');
 assert.equal(row.teamGames,9);
 cup.phase='knockout';cup.active=[teamId];cup.stage='8강';
 cup.fixtures.push({...fixtures[0],id:'q1',stage:'8강',step:12,tieId:'q',leg:1},{...fixtures[0],id:'q2',stage:'8강',step:13,tieId:'q',leg:2,played:false});
 assert.equal(tournamentResult(cup,teamId),'8강 진행 중');
 cup.phase='completed';cup.active=[];cup.fixtures.splice(-3,3);
 const regional=[...others.slice(0,8),teamId,...others.slice(8,23)];
 const afc={...cup,id:'AFC_ELITE:2026',entrants:regional,table:regional.slice().reverse().map(clubId=>({clubId,...empty}))};
 assert.equal(tournamentResult(afc,teamId),'동부 리그 페이즈 4위 탈락');
});

test('national qualifier and finals rows keep separate counts and a missed penalty-shootout elimination',()=>{
 const c=make(),n=c.systems!.national;
 const q=international('qualifier');
 const group={...international('group'),fixtureId:'NAT|U20|U20WC:2026|group|g:0:0:0'};
 const exit={...international('r16',0),fixtureId:'NAT|U20|U20WC:2026|round16|ko:16:0',homeGoals:1,awayGoals:1,shootout:{home:3,away:4,winnerId:group.awayId,attempts:[]}};
 n.matches=[q,group,exit];
 n.history=[{year:2026,squad:'U20',competitionId:q.competitionId!,competitionName:'2026 FIFA U-20 월드컵',stats:q.playerStats,matches:[structuredClone(q)],result:'예선 참가',qualified:false}];
 c.stage='retired';c.retiredYear=2026;
 const rows=getSeasonCompetitions(c).filter(row=>row.scope==='national');
 assert.deepEqual(rows.map(row=>[row.nationalPhase,row.apps,row.teamGames]),[['qualifying',1,1],['finals',1,2]]);
 assert.equal(rows[0].statusLabel,'예선 통과 · 본선 진출');
 assert.equal(rows[1].statusLabel,'16강 탈락');
 const text=buildCareerText(c);
 assert.match(text,/본선.*내 출전 1경기 · 팀 2경기 · 16강 탈락/);
});

test('a completed national group uses its actual rank, with later results kept out of earlier seasons',()=>{
 const c=make(),n=c.systems!.national,id='OFC:2027',own='뉴질랜드';
 const groups=[[own,'피지','솔로몬 제도','타히티'],['바누아투','파푸아뉴기니','뉴칼레도니아','사모아']];
 n.country=own;n.finalDraws={[`U20|${id}`]:{size:8,groups}};
 const games=groups.flatMap((teams,g)=>teams.flatMap((home,i)=>teams.slice(i+1).map((away,j)=>{
  const label=`g:${g}:${i}:${j}`,involvesPlayer=home===own,year=involvesPlayer&&j===0?2026:2027;
  const match=international(label,involvesPlayer?1:0);
  return {...match,fixtureId:`NAT|U20|${id}|group|${label}`,seasonYear:year,competitionId:id,
   homeId:`NAT:${home}:U20`,awayId:`NAT:${away}:U20`,playerClubId:`NAT:${home}:U20`,homeGoals:0,awayGoals:2};
 })));
 n.matches=games.filter(match=>match.playerClubId===`NAT:${own}:U20`);
 n.teamResults=games.filter(match=>match.playerClubId!==`NAT:${own}:U20`);
 c.season.year=2027;
 const years=getCompetitionSeasons(c,[2026,2027]);
 const first=years.get(2026)!.find(row=>row.nationalPhase==='finals')!,last=years.get(2027)!.find(row=>row.nationalPhase==='finals')!;
 assert.match(first.statusLabel,/현재/);assert.equal(first.apps,1);assert.equal(first.teamGames,1);
 assert.equal(last.statusLabel,'조별리그 4위 탈락');assert.equal(last.apps,2);assert.equal(last.teamGames,2);
});
