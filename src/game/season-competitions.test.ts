import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,emptyStats} from './engine';
import {PLAY_STYLES} from './attributes';
import {getSeasonCompetitions} from './season-competitions';
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
