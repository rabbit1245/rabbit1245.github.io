import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,retireCareer} from './engine';
import {PLAY_STYLES} from './attributes';
import {buildCareerText,careerTextFilename,careerTextChunks,STAT_TEXT,careerStatsLines,careerSeasonRecords,careerFinals,careerRecordTotals} from './career-text';
import {validateCareer,exportCareer,importCareer} from './storage';
import {emptyStats,sumStats,ALL_STATS} from './math';
import {captureSeasonDetails} from './season-details';
import type {Career,MatchRecord,SeasonSummary} from './types';
import type {ClubTournament,CupFixture} from './revision-types';
const options={name:'한글 선수',nationality:'대한민국',age:20,height:180,weight:75,foot:'right' as const,position:'ST' as const,talent:'S' as const,style:PLAY_STYLES.ST[0],clubId:'KR2_01',squad:'senior' as const,difficulty:'realistic' as const,seed:'career-text-complete'};
const base=createCareer(options),fresh=()=>structuredClone(base);
function match(c:Career,id:string,patch:Partial<MatchRecord>={}):MatchRecord{
 const other=c.season.table.find(t=>t.clubId!==c.player.clubId)!.clubId;
 return {id,fixtureId:id,round:1,seasonYear:c.season.year,homeId:c.player.clubId,awayId:other,homeGoals:1,awayGoals:0,events:[{id:'event',minute:73,type:'goal',teamId:c.player.clubId,playerName:c.player.name,detail:'분단위 로그 제외 검증 문구'}],playerClubId:c.player.clubId,playerPlayed:true,playerStarted:true,playerMinutes:90,playerRating:8,playerStats:{...emptyStats(),apps:1,starts:1,minutes:90,goals:1,shots:4,shotsOnTarget:2,passes:20,passesCompleted:15,ratingSum:8,ratingCount:1,detailedApps:1},seed:'final-test',metricsVersion:2,effects:{fitnessAfter:60,moraleAfter:60,formAfter:60,injuryWeeksAfter:0,trustAfter:60},...patch};
}
function cup(c:Career,matches:MatchRecord[],patch:Partial<ClubTournament>={}):ClubTournament{
 const fixtures:CupFixture[]=matches.map((m,i)=>({id:m.fixtureId,round:1,homeId:m.homeId,awayId:m.awayId,played:true,homeGoals:m.homeGoals,awayGoals:m.awayGoals,stage:'결승',step:1,leg:i+1,tieId:'final',...(m.shootout?{shootout:m.shootout,winnerId:m.shootout.winnerId}:{})}));
 return {id:'TEST-CUP',name:'검증 컵',year:c.season.year,kind:'cup',entrants:[matches[0].homeId,matches[0].awayId],basis:'검증',rules:'단판',phase:'completed',step:1,leagueRounds:0,stage:'우승 확정',active:[],byes:[],fixtures,matches,table:[],startedAtRound:1,...patch};
}
function archive(c:Career,year:number):SeasonSummary{
 return {year,clubId:c.player.clubId,clubName:'당시 소속팀',leagueId:c.season.leagueId,competitionName:c.season.competitionName,age:19,position:c.player.position,squad:c.player.squad,rank:4,ovrStart:70,ovrEnd:75,stats:{...emptyStats(),apps:2,minutes:180,goals:2},awards:[],matches:[],attributeGrowth:{},income:0,completed:true};
}
test('retirement TXT contains only requested records, Korean labels and no event timelines or diagnostics',()=>{
 const c=retireCareer(fresh()),before=JSON.stringify(c),text=buildCareerText(c);
 assert.equal(text.charCodeAt(0),0xfeff);assert.match(careerTextFilename(c),/^K볼_한글 선수_은퇴커리어\.txt$/);
 for(const section of ['A. 선수 기본 정보','B. 통산 총합 스탯 · 팀 수상','C. 연도별 기록'])assert.ok(text.includes(section),section);
 for(const key of ALL_STATS.filter(k=>!['ratingSum','ratingCount','detailedApps'].includes(k)))assert.ok(text.includes(STAT_TEXT[key]),key);
 for(const label of ['이름:','국적:','신체정보:','팀:','능력점수:','포지션:','세부 역할:','부 포지션:','은퇴나이:','소속팀:','몸값:','주급:','주장/부주장 여부:','부상 유무:','팀 수상:','대회별 팀 성적:','개인 수상:','결승 기록:'])assert.ok(text.includes(label),label);
 assert.match(text,/오른발/);assert.match(text,/선방률/);assert.match(text,new RegExp(`\\[${c.season.year}시즌\\] 은퇴`));
 assert.doesNotMatch(text,/전체 대진|전체 순위표|수동 노화|고정 능력치|훈련 이력|분단위 로그|90분당|\/ 90분|"history"|"playerId"|평점 합계/);
 assert.equal([...careerTextChunks(c)].join(''),text);assert.equal(JSON.stringify(c),before,'export is read-only');
 assert.ok(!/(?<!\r)\n/.test(text),'Windows-compatible line endings');assert.ok(Buffer.byteLength(text)<15000);
});
test('new season snapshots validate and unknown old snapshots stay absent on hash-preserving import',async()=>{
 const c=fresh(),text=await exportCareer(c),loaded=await importCareer(text);assert.equal(loaded.history.length,0);assert.equal(loaded.season.playerStats.goals,0);validateCareer(loaded);
 const malicious=structuredClone(c);malicious.systems!.world.clubs[c.player.clubId].development!.history=[{year:2026,leagueId:'KR2',rank:1,expectedRank:2,points:10,teams:13,bonus:100,reinvestment:101,beforePower:50,afterPower:51,prestigeBefore:50,prestigeAfter:51,improvedPlayers:1,recruits:1}];assert.throws(()=>validateCareer(malicious),/재투자/);
});
test('known legacy counts survive; unavailable counters and denominators never turn into fabricated zero rates',()=>{
 const c=fresh();Object.assign(c.season.playerStats,{apps:1,minutes:90,mom:1,keyPasses:3});
 const text=buildCareerText(c);assert.match(text,/경기 최우수 선수\(회\): 1/);assert.match(text,/키패스\(회\): 3/);assert.match(text,/태클 시도\(회\): 과거 기록 미보존/);assert.match(text,/태클 성공률: 과거 기록 미보존/);assert.doesNotMatch(text,/NaN|Infinity/);
 const full={...emptyStats(),apps:1,detailedApps:1,handlingAttempts:8,handlingSuccesses:6,lateActions:5,lateSuccesses:4,passes:20,passesCompleted:15};const lines=careerStatsLines(full,[]).join('\n');
 assert.match(lines,/패스 성공률: 75.00% \(15\/20\)/);assert.match(lines,/공 처리 성공률: 75.00% \(6\/8\)/);assert.match(lines,/후반 행동 성공률: 80.00% \(4\/5\)/);assert.match(lines,/드리블 성공률: 해당 없음 \(시도 0회\)/);
});
test('annual records use contemporary values, captaincy, injuries, awards and retirement status',()=>{
 const c=fresh(),year=c.season.year,m=match(c,'league');c.season.matches=[m];c.season.week=1;c.season.playerStats={...m.playerStats};
 const h=archive(c,year-1);h.details=captureSeasonDetails(c)!;h.details.marketValue=100;h.details.contract.wage=10;h.details.captain.club='vice';h.details.table=c.season.table;
 c.history=[h];c.systems!.economics.marketValue=900;c.player.wage=90;c.player.injuryWeeks=3;
 c.awards=[{id:'personal',name:'리그 올해의 선수',year,clubId:c.player.clubId,description:'검증',category:'individual'},{id:'sales',name:'유니폼 판매',year,clubId:c.player.clubId,description:'제외',category:'commercial'}];
 const retired=retireCareer(c),rows=careerSeasonRecords(retired),text=buildCareerText(retired);
 assert.equal(rows.length,2);assert.match(rows[0].value,/150,000원/);assert.match(rows[0].wage,/15,000원/);assert.match(rows[0].leadership,/부주장/);assert.equal(rows[0].ovrEnd,75);
 assert.match(rows[1].status,/은퇴 \(시즌 도중\)/);assert.match(rows[1].injury,/부상 있음/);assert.ok(rows[1].results[0].includes('은퇴 시점'));assert.match(text,/리그 올해의 선수/);assert.doesNotMatch(text,/유니폼 판매|분단위 로그 제외 검증 문구/);
 const total=careerRecordTotals(retired);assert.equal(total.all.goals,h.stats.goals+m.playerStats.goals);assert.equal(total.all.apps,3);
 const unknown=fresh();unknown.history=[archive(unknown,year-1)];unknown.systems!.economics.valueHistory=[];unknown.systems!.economics.contractHistory=[];
 const old=careerSeasonRecords(unknown)[0];assert.equal(old.value,'과거 기록 미보존');assert.equal(old.wage,'과거 기록 미보존');assert.equal(old.injury,'과거 기록 미보존');
});
test('a next-season contract cannot rewrite the previous season wage and a queued injury is not an injury',()=>{
 const c=fresh(),year=c.season.year,h=archive(c,year-1);c.history=[h];c.systems!.economics.contractHistory=[{id:'future',year:year-1,round:99,type:'renew',effective:'nextSeason',reason:'검증',fee:0,current:{clubId:c.player.clubId,wage:999,years:2,signedYear:year-1,expiresYear:year+1,role:'주전'}}];
 c.systems!.manualInjuries=[{id:'queued',year,clubId:c.player.clubId,duration:'season',start:'',end:'',pendingNextSeason:true,missed:[]}];
 assert.equal(careerSeasonRecords(c)[0].wage,'과거 기록 미보존');assert.equal(careerSeasonRecords(c)[1].injury,'부상 없음');
});
test('club final records cover shootout wins and losses, own stats, bench appearances and exclude other finals',()=>{
 for(const won of [true,false]){
  const c=fresh(),m=match(c,'cup-final',{homeGoals:1,awayGoals:1});m.shootout={home:won?5:3,away:won?4:4,winnerId:won?m.homeId:m.awayId,attempts:[{teamId:m.homeId,playerId:c.player.id,scored:won}]};
  c.systems!.clubCompetitions!.current=[cup(c,[m],{winnerId:m.shootout.winnerId})];
  const f=careerFinals(c,c.season.year)[0];assert.equal(f.result,won?'승리 · 우승':'패배 · 준우승');const text=buildCareerText(c);assert.match(text,/결승: .+ 1:1 .+승부차기/);assert.match(text,/내 결승 기록: 선발 출전/);assert.ok(text.includes(`내 승부차기: 1회 시도 · ${won?1:0}회 성공`));assert.match(text,/득점 전환율: 25.00% \(1\/4\)/);assert.doesNotMatch(text,/분단위 로그/);
  m.playerPlayed=false;m.playerStarted=false;m.playerStats=emptyStats();m.playerMinutes=0;assert.match(buildCareerText(c),/내 결승 기록: 미출전/);
  const unrelated=structuredClone(c.systems!.clubCompetitions!.current[0]);unrelated.id='other';unrelated.fixtures=unrelated.fixtures.map(f=>({...f,homeId:'other-home',awayId:'other-away'}));unrelated.matches=unrelated.matches.map(m=>({...m,fixtureId:'other-final',homeId:'other-home',awayId:'other-away'}));c.systems!.clubCompetitions!.current.push(unrelated);assert.equal(careerFinals(c,c.season.year).length,1);
 }
});
test('two-legged finals preserve both scores, aggregate and the actual winning side',()=>{
 const c=fresh(),a=match(c,'leg-1',{homeGoals:0,awayGoals:1}),b=match(c,'leg-2',{homeId:a.awayId,awayId:a.homeId,homeGoals:0,awayGoals:2});
 c.systems!.clubCompetitions!.current=[cup(c,[a,b],{winnerId:c.player.clubId,doubleFinal:true})];const text=buildCareerText(c),f=careerFinals(c,c.season.year)[0];assert.equal(f.legs.length,2);assert.match(f.aggregate!,/2:1/);assert.equal(f.result,'승리 · 우승');assert.match(text,/결승 1차전: .+ 0:1/);assert.match(text,/결승 2차전: .+ 0:2/);assert.match(text,/합산 스코어/);
 const t=c.systems!.clubCompetitions!.current[0];t.fixtures[1].played=false;delete t.fixtures[1].homeGoals;delete t.fixtures[1].awayGoals;t.matches.pop();delete t.winnerId;t.phase='knockout';assert.equal(careerFinals(c,c.season.year)[0].result,'결승 진출 · 미진행');
});
test('national finals use exact final stage, result, shootout and individual counts without semifinal false positives',()=>{
 const c=fresh(),own='NAT:대한민국:senior',away='NAT:일본:senior';const m=match(c,'NAT|senior|WC:2026|final|real-final',{scope:'national',competitionId:'WC:2026',homeId:own,awayId:away,playerClubId:own,homeGoals:2,awayGoals:2,shootout:{home:4,away:5,winnerId:away,attempts:[]}});
 c.systems!.national.matches=[m,{...m,id:'semi',fixtureId:'NAT|senior|WC:2026|semifinal|other',shootout:undefined}];const f=careerFinals(c,c.season.year);assert.equal(f.length,1);assert.equal(f[0].result,'패배 · 준우승');const text=buildCareerText(c);assert.match(text,/월드컵/);assert.match(text,/승부차기 4:5/);assert.equal(careerRecordTotals(c).national.goals,2);
 c.systems!.national.matches=[];c.systems!.national.schedule=[{id:'future-final',date:'2026-12-01',competitionId:'WC:2026',stage:'final',squad:'senior',homeId:own,awayId:away}];assert.equal(careerFinals(c,c.season.year)[0].result,'결승 진출 · 미진행');assert.doesNotMatch(buildCareerText(c),/내 결승 기록: 선발/);
});
test('completed retirement season is explicitly retired while all annual totals still reconcile',()=>{
 const c=fresh(),year=c.season.year,h=archive(c,year);c.history=[h];c.season.completed=true;c.stage='retired';c.retiredYear=year;
 const records=careerSeasonRecords(c);assert.match(records[0].status,/은퇴 \(시즌 종료 후\)/);assert.equal(records[0].stats.goals,h.stats.goals);assert.equal(careerRecordTotals(c).all.goals,h.stats.goals);assert.equal(sumStats(records.map(r=>r.stats)).apps,careerRecordTotals(c).all.apps);
});
test('team awards include runner-up medals without duplicating a championship and injuries remain annual summaries',()=>{
 const c=fresh(),m=match(c,'injury-year',{date:'2026-09-01'}),year=c.season.year;
 c.season.matches=[m];c.season.playerStats={...m.playerStats};c.season.week=1;
 c.awards=[{id:'runner-up',year,clubId:c.player.clubId,name:'검증 대회 준우승 메달',category:'team',description:'결승 패배'},{id:'champion',year,clubId:c.player.clubId,name:'검증 컵 우승',category:'team',description:'결승 승리'}];
 c.systems!.clubCompetitions!.current=[cup(c,[m],{winnerId:c.player.clubId})];
 c.systems!.manualInjuries=[{id:'injury',year:year-1,clubId:c.player.clubId,duration:'season',start:'2025-10-01',end:'2026-10-01',missed:[{fixtureId:'missed-one',year,scope:'club'},{fixtureId:'missed-one',year,scope:'club'},{fixtureId:'missed-two',year,scope:'national'}]}];
 const r=careerSeasonRecords(c)[0];assert.ok(r.teamAwards.some(a=>a.includes('준우승 메달')));assert.equal(r.teamAwards.filter(a=>a.endsWith('검증 컵 우승')).length,1);assert.match(r.injury,/부상 있음 · 확인된 결장 2경기/);
 assert.match(buildCareerText(c),/검증 대회 준우승 메달/);assert.doesNotMatch(buildCareerText(c),/분단위 로그 제외 검증 문구|수동 부상 이력|injury-year/);
});
test('mixed legacy coverage uses matching detailed-game denominators for percentages',()=>{
 const c=fresh(),m=match(c,'measured');Object.assign(m.playerStats,{tackles:3,tackleAttempts:4});
 const aggregate={...m.playerStats,apps:2,minutes:180,tackles:12};const text=careerStatsLines(aggregate,[m]).join('\n');
 assert.match(text,/태클 성공\(회\): 12/);assert.match(text,/태클 성공률: 75.00% \(3\/4\) · 세부 기록 보존 경기 기준/);assert.doesNotMatch(text,/300.00%/);
});
test('national elimination rounds and third-place results are explicit even without a year-end archive',()=>{
 const c=fresh(),own='NAT:대한민국:senior',away='NAT:일본:senior';
 const m=match(c,'NAT|senior|WC:2026|quarterfinal|quarter',{scope:'national',competitionId:'WC:2026',homeId:own,awayId:away,playerClubId:own,homeGoals:0,awayGoals:1});
 c.systems!.national.matches=[m];assert.ok(careerSeasonRecords(c)[0].results.some(r=>r.includes('8강 탈락')));
 m.fixtureId='NAT|senior|WC:2026|thirdPlace|third';m.homeGoals=2;assert.ok(careerSeasonRecords(c)[0].results.some(r=>r.endsWith('3위')));
});
