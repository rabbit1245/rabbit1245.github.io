import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_ATTRIBUTES, GK_ATTRIBUTES } from './attributes';
import { CLUBS, ROSTERS } from './data';
import { emptyStats, sumStats } from './math';
import { archiveNationalSeason, createNational as createExpandedNational, getNationalTotals, getTeamLabel, processDueNationalWindows, processNationalWindow, resolveNationalShootout, scheduledInternationalWindows, nationalRosterPower } from './national';
import { fixtureDate } from './calendar';
import { simulateMatch } from './match-engine';
import { nationalityForPlayer } from './national-data';
import type { Career, MatchRecord, Player, Position } from './types';
import type { MatchPerformance } from './revision-types';

// These fixtures intentionally preserve the published legacy bracket and migration contract.
function createNational(c:Career){const n=createExpandedNational(c);delete n.formatVersion;n.squad=c.player.age<=20?'U20':'senior';return n;}
function fixture(options: Partial<Player> & { seed?: string; leagueId?: string } = {}): Career {
  const {seed='national-tests',leagueId='KR1',...player}=options;
  const club=CLUBS.find(row=>row.leagueId===leagueId)!;
  const position:Position=player.position??'ST';
  const attributes=Object.fromEntries((position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES).map(key=>[key,92]));
  const career:Career={
    schemaVersion:1,id:'national-career',seed,revision:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
    player:{id:'user',name:'김대표',nationality:'대한민국',age:25,height:180,weight:75,foot:'right',position,secondaryPositions:[],talent:'S',style:position==='GK'?'슛 스토퍼':'포처',attributes,clubId:club.id,squad:'senior',fitness:100,morale:80,form:90,injuryWeeks:0,ovr:92,potential:96,wage:50000,contractYears:3,...player},
    season:{year:2026,index:0,week:18,totalWeeks:36,leagueId,competitionName:'test',fixtures:[],table:[],matches:[],playerStats:{...emptyStats(),apps:18,starts:18,minutes:1620,ratingSum:144,ratingCount:18},ovrStart:92,attributeStart:attributes,completed:false},
    history:[],news:[],training:['shooting'],intensity:'balanced',transfers:[],offers:[],stage:'season',managerTrust:90,careerIncome:0,awards:[],difficulty:'realistic',processedCommands:[],
  };
  career.systems={version:2,world:{year:2026,clubs:{},players:{},competitions:{},playerStats:{},movements:[]},national:createNational(career),economics:{marketValue:1,previousValue:1,peakValue:1,valueHistory:[],salaryIncome:0,bonusIncome:0,totalTransferFees:0,highestWage:50000,contract:{signedYear:2026,expiresYear:2029,wageAtSigning:50000,role:'주전',clubId:club.id}},leadership:{trait:70,clubSinceYear:2026,clubId:club.id,clubRole:'none',nationalRole:'none',clubMatches:0,nationalMatches:0,terms:[],reason:''},phase:'first',halfRound:18,trainingLocked:true,growthReports:[],rankings:[],events:[]};
  return career;
}

test('retained source nationality follows the player, not the country of their club',()=>{
  assert.equal(nationalityForPlayer('fc25_231747','스페인'),'프랑스');
  assert.equal(nationalityForPlayer('generated-roster-player','영국'),'잉글랜드');
  assert.equal(getTeamLabel('NAT:대한민국:U20'),'대한민국 U20');
  assert.equal(getTeamLabel('NAT:프랑스:senior'),'프랑스 대표팀');
});

test('January and July season calendars use future June windows without retroactive World Cups',()=>{
  const january=fixture();processNationalWindow(january,'first');
  assert.ok(january.systems!.national.matches.every(match=>match.date?.startsWith('2026-06')));
  assert.ok(january.systems!.national.matches.some(match=>match.competitionId==='WC:2026'));
  const july=fixture({leagueId:'EN1'});processNationalWindow(july,'first');
  assert.ok(july.systems!.national.matches.every(match=>match.date?.startsWith('2026-11')));
  assert.ok(july.systems!.national.matches.every(match=>match.competitionId!=='WC:2026'));
  processNationalWindow(july,'second');
  assert.ok(july.systems!.national.matches.some(match=>match.date?.startsWith('2027-06')));
  assert.ok(july.systems!.national.matches.every(match=>match.competitionId!=='WC:2026'));
});

test('national windows replay exactly, preserve club contracts, and archive without duplicate statistics',()=>{
  const career=fixture(), replay=structuredClone(career);
  const contract={clubId:career.player.clubId,wage:career.player.wage,contractYears:career.player.contractYears};
  processNationalWindow(career,'first');processNationalWindow(replay,'first');
  assert.deepEqual(career,replay);
  assert.deepEqual({clubId:career.player.clubId,wage:career.player.wage,contractYears:career.player.contractYears},contract);
  const before=structuredClone(career);processNationalWindow(career,'first');assert.deepEqual(career,before);
  const total=getNationalTotals(career);assert.ok(total.apps>0);assert.ok(total.minutes>0);
  assert.deepEqual(total,sumStats(career.systems!.national.matches.map(match=>match.playerStats)));
  archiveNationalSeason(career);archiveNationalSeason(career);
  assert.equal(career.systems!.national.history.length,1);
  assert.deepEqual(getNationalTotals(career),total);
  assert.deepEqual(getNationalTotals(career,{year:2026,competitionId:'WC:2026',squad:'senior'}),total);
  assert.equal(getNationalTotals(career,{squad:'U20'}).apps,0);
  for(const match of career.systems!.national.matches){
    assert.equal(match.events.filter(e=>e.type==='goal'&&e.teamId===match.homeId).length,match.homeGoals);
    assert.equal(match.events.filter(e=>e.type==='goal'&&e.teamId===match.awayId).length,match.awayGoals);
    assert.equal(match.playerStats.minutes,match.playerMinutes);
    assert.equal(match.scope,'national');
  }
  career.stage='retired';const retirementTotal=getNationalTotals(career);processNationalWindow(career,'second');
  assert.deepEqual(getNationalTotals(career),retirementTotal);assert.equal(career.systems!.national.status,'retired');
});

test('injury and real positional competition explain non-selection without awarding phantom appearances',()=>{
  const injured=fixture({injuryWeeks:5});processNationalWindow(injured,'first');
  assert.equal(injured.systems!.national.status,'injured');assert.match(injured.systems!.national.reason,/부상/);
  assert.equal(getNationalTotals(injured).apps,0);
  assert.ok(injured.systems!.national.matches.length>=2,'country still plays its real fixtures');
  const reserve=fixture({nationality:'프랑스',ovr:30,form:30});processNationalWindow(reserve,'first');
  assert.ok(['unselected','watchlist'].includes(reserve.systems!.national.status));
  assert.match(reserve.systems!.national.reason,/포지션군.*위/);
  assert.equal(getNationalTotals(reserve).apps,0);
});

test('U20 and senior match ledgers remain separate across season changes',()=>{
  const career=fixture({age:16});processNationalWindow(career,'first');archiveNationalSeason(career);
  const youth=getNationalTotals(career,{squad:'U20'});assert.ok(youth.apps>0);
  career.player.age=21;career.player.fitness=100;career.player.injuryWeeks=0;
  career.season.year=2027;career.season.index=1;
  processNationalWindow(career,'first');archiveNationalSeason(career);
  assert.equal(career.systems!.national.squad,'senior');
  assert.deepEqual(getNationalTotals(career,{squad:'U20'}),youth);
  const senior=getNationalTotals(career,{squad:'senior'});assert.ok(senior.apps>0);
  assert.deepEqual(getNationalTotals(career),sumStats([youth,senior]));
  assert.equal(getNationalTotals(career,{year:2026,squad:'senior'}).apps,0);
});

test('qualification uses played group scores and knockout titles use the actual final winner',()=>{
  let sawFinal=false, sawShootout=false, sawElimination=false;
  for(let seed=0;seed<64;seed++){
    const career=fixture({seed:`bracket-${seed}`});processNationalWindow(career,'first');archiveNationalSeason(career);
    const n=career.systems!.national;
    const groupMatches=[...n.matches,...(n.teamResults??[])].filter(match=>match.fixtureId.includes('|qualifying|')&&!match.fixtureId.includes('finalist-group:'));
    assert.equal(groupMatches.length,3);
    const id='NAT:대한민국:senior';
    const points=n.matches.filter(match=>match.fixtureId.includes('|qualifying|')).reduce((total,match)=>{
      const goals=match.homeId===id?[match.homeGoals,match.awayGoals]:[match.awayGoals,match.homeGoals];
      return total+(goals[0]>goals[1]?3:goals[0]===goals[1]?1:0);
    },0);
    assert.equal(n.points,points);
    const qualifiers=(n.teamResults??[]).filter(m=>m.fixtureId.includes('finalist-group:'));
    if(n.qualified)assert.equal(qualifiers.length,9,'other finalists play three actual qualifying groups');
    const semi=n.matches.find(m=>m.fixtureId.includes('|semifinal|'));
    if(semi){const opponent=semi.awayId,group=qualifiers.filter(m=>m.homeId===opponent||m.awayId===opponent);assert.equal(group.length,2,'the semifinal opponent actually participated in qualification');}
    if(!n.qualified){sawElimination=true;assert.equal(n.phase,'eliminated');assert.ok(n.matches.every(match=>match.fixtureId.includes('|qualifying|')));}
    for(const match of n.matches)if(match.shootout){sawShootout=true;assert.equal(match.homeGoals,match.awayGoals);assert.notEqual(match.shootout.home,match.shootout.away);assert.ok(match.shootout.attempts.length>=6);}
    const final=n.matches.find(match=>match.fixtureId.includes('|final|'));
    if(final){
      sawFinal=true;
      const won=final.shootout?final.shootout.winnerId===id:final.homeGoals>final.awayGoals;
      assert.equal(n.history[0].result,won?'우승':'준우승');
    }
  }
  assert.ok(sawFinal,'some qualified squads reach a final');assert.ok(sawShootout,'drawn knockout matches resolve with a shootout');assert.ok(sawElimination,'qualification is never guaranteed');
});

test('a single star does not erase whole-country strength over repeated tournaments',t=>{
  const results=[];
  for(const country of ['프랑스','베트남']){
    let titles=0,qualified=0,finals=0;
    for(let seed=0;seed<64;seed++){
      const c=fixture({seed:`bracket-${seed}`,nationality:country});processNationalWindow(c,'first');archiveNationalSeason(c);
      const n=c.systems!.national;titles+=+(n.history[0]?.result==='우승');qualified+=+n.qualified;finals+=+n.matches.some(m=>m.fixtureId.includes('|final|'));
      assert.ok(nationalRosterPower(c,country,'senior')<c.player.ovr,'the team is not assigned its star’s OVR');
    }
    results.push({country,titles,qualified,finals});
  }
  assert.ok(results[0].titles>results[1].titles+5,JSON.stringify(results));assert.ok(results[1].titles<8&&results[1].qualified<64,JSON.stringify(results));t.diagnostic(JSON.stringify({same92OVRStar64WorldCups:results}));
});

test('a small continental field uses earned finalists and never invents a semifinal opponent',()=>{
  let finals=0;
  for(let seed=0;seed<8;seed++){
    const c=fixture({seed:`small-field-${seed}`,nationality:'피지'});c.season.year=2028;c.systems!.national=createNational(c);
    processNationalWindow(c,'first');const n=c.systems!.national;
    assert.equal(n.competitionId,'OFC:2028');assert.ok(n.matches.every(m=>!m.fixtureId.includes('|semifinal|')));
    const final=n.matches.find(m=>m.fixtureId.includes('|final|'));
    if(final){finals++;assert.ok(n.qualified);assert.ok(n.matches.some(m=>m.fixtureId.includes('|qualifying|')&&(m.homeId===final.awayId||m.awayId===final.awayId)));}
  }
  assert.ok(finals>0);
});

test('an older in-progress semifinal bracket keeps its recorded opponents without fabricated earlier qualifiers',()=>{
  const c=fixture({seed:'bracket-0'});processDueNationalWindows(c,'2026-06-18');
  const n=c.systems!.national;assert.ok(n.qualified);assert.ok(n.matches.some(m=>m.fixtureId.includes('|semifinal|')));
  n.teamResults=n.teamResults!.filter(m=>!m.fixtureId.includes('finalist-group:'));
  const oldSemis=structuredClone([...n.matches,...n.teamResults].filter(m=>m.fixtureId.includes('|semifinal|')));assert.equal(oldSemis.length,2);
  processDueNationalWindows(c,'2026-06-25');
  assert.ok(!n.teamResults!.some(m=>m.fixtureId.includes('finalist-group:')));
  assert.deepEqual([...n.matches,...n.teamResults!].filter(m=>m.fixtureId.includes('|semifinal|')),oldSemis);
});

test('played qualifying groups stay fixed when another country’s squad changes before the semifinal',()=>{
  const c=fixture({seed:'bracket-0'});processDueNationalWindows(c,'2026-06-12');const n=c.systems!.national;
  const qualifiers=structuredClone(n.teamResults!.filter(m=>m.fixtureId.includes('finalist-group:')));assert.equal(qualifiers.length,9);
  const group=qualifiers.filter(m=>m.fixtureId.includes('finalist-group:0:')),rows=new Map<string,{points:number;gd:number;gf:number}>();
  for(const m of group){for(const id of [m.homeId,m.awayId])if(!rows.has(id))rows.set(id,{points:0,gd:0,gf:0});const h=rows.get(m.homeId)!,a=rows.get(m.awayId)!;h.points+=m.homeGoals>m.awayGoals?3:m.homeGoals===m.awayGoals?1:0;a.points+=m.awayGoals>m.homeGoals?3:m.awayGoals===m.homeGoals?1:0;h.gd+=m.homeGoals-m.awayGoals;a.gd-=m.homeGoals-m.awayGoals;h.gf+=m.homeGoals;a.gf+=m.awayGoals;}
  const winner=[...rows].sort(([ai,a],[bi,b])=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||ai.localeCompare(bi))[0][0];
  const positions:Position[]=['GK','LB','CB','CB','RB','CDM','CM','CAM','LW','RW','ST'];
  for(const [i,position] of positions.entries())c.systems!.world.players[`changed-${i}`]={id:`changed-${i}`,clubId:c.player.clubId,name:'명단 변경 실험',position,age:25,ovr:99,potential:99,injuryWeeks:0,nationality:'일본',leadership:70};
  processDueNationalWindows(c,'2026-06-18');assert.deepEqual(n.teamResults!.filter(m=>m.fixtureId.includes('finalist-group:')),qualifiers);
  assert.equal(n.matches.find(m=>m.fixtureId.includes('|semifinal|'))!.awayId,winner);
});

test('goalkeepers retain keeper metrics and competitors receive exactly their national match ledger',()=>{
  const career=fixture({position:'GK',seed:'national-keeper'});
  for(const [clubId,roster] of Object.entries(ROSTERS))for(const p of roster){
    if(nationalityForPlayer(p.id,CLUBS.find(club=>club.id===clubId)!.country)!=='대한민국')continue;
    career.systems!.world.playerStats[p.id]={playerId:p.id,name:p.name,clubId,leagueId:'KR1',position:p.position,nationality:'대한민국',ovr:p.ovr,stats:emptyStats()};
  }
  processNationalWindow(career,'first');
  const total=getNationalTotals(career);assert.ok(total.apps>0);assert.ok(total.saves>0);assert.equal(total.goals,0);assert.ok(total.shotsFaced!>=total.saves);
  const ledger=[...career.systems!.national.matches,...(career.systems!.national.teamResults??[])];
  const participants=ledger.flatMap(match=>match.performers??[]);
  const competitor=participants.find(p=>career.systems!.world.playerStats[p.id]);assert.ok(competitor);
  const expected=sumStats(participants.filter(p=>p.id===competitor.id).map(p=>p.stats));
  assert.deepEqual(career.systems!.world.playerStats[competitor.id].nationalStats,expected);
});

test('qualification carries between seasons, intermediate windows play friendlies, and calendar switches do not replay finals',()=>{
  const career=fixture({seed:'national-cycle',leagueId:'EN1'});
  processNationalWindow(career,'first');archiveNationalSeason(career);
  const qualifiers=career.systems!.national.matches.map(match=>match.fixtureId);
  processNationalWindow(career,'second');archiveNationalSeason(career);
  const oldTotal=getNationalTotals(career);
  const oldLedger=new Set(career.systems!.national.history.flatMap(row=>row.matches).map(match=>match.fixtureId));
  assert.ok(qualifiers.every(id=>oldLedger.has(id)));
  career.season.year=2027;career.season.index=1;career.season.leagueId='KR1';career.player.fitness=100;career.player.injuryWeeks=0;
  processNationalWindow(career,'first');
  assert.equal(career.systems!.national.matches.length,0,'the June 2027 tournament has already finished');
  assert.deepEqual(getNationalTotals(career),oldTotal);
  processNationalWindow(career,'second');archiveNationalSeason(career);
  career.season.year=2028;career.season.index=2;career.player.fitness=100;career.player.injuryWeeks=0;
  processNationalWindow(career,'first');
  assert.equal(career.systems!.national.matches.length,2);
  assert.ok(career.systems!.national.matches.every(match=>match.competitionId==='FRIENDLIES:2028'));
  assert.ok(career.systems!.national.matches.every(match=>match.date?.startsWith('2028-06')));
});


test('shootout takers are the eligible players still on the pitch and do not change regular statistics',()=>{
  const career=fixture();
  const homeId='NAT:대한민국:senior',awayId='NAT:일본:senior';
  const participant=(id:string,teamId:string,minutes=90,started=true):MatchPerformance=>({id,name:id,clubId:career.player.clubId,teamId,position:id.endsWith('0')?'GK':'ST',ovr:70,attributes:{setPieces:75,gkOneOnOnes:75,gkReflexes:75},stats:{...emptyStats(),apps:minutes?1:0,starts:started?1:0,minutes},rating:7,minutes,started});
  const performers=[...Array.from({length:11},(_,i)=>participant(`home${i}`,homeId)),...Array.from({length:11},(_,i)=>participant(`away${i}`,awayId)),participant('home-sub',homeId,30,false),participant('unused-bench',homeId,0,false)];
  const withdrawn=performers.find(p=>p.id==='home10')!;withdrawn.minutes=60;withdrawn.stats.minutes=60;
  performers.find(p=>p.id==='home2')!.stats.redCards=1;
  const events:MatchRecord['events']=[{id:'entry',minute:60,type:'substitution',teamId:homeId,playerId:'home-sub',playerName:'home-sub',detail:'교체 투입'},{id:'injury',minute:90,type:'injury',teamId:homeId,playerId:'home3',playerName:'home3',detail:'부상'}];
  const match:MatchRecord={id:'shootout',fixtureId:'NAT|senior|WC:2026|final|shootout-fixture',round:1,seasonYear:2026,homeId,awayId,homeGoals:0,awayGoals:0,events,playerClubId:homeId,playerPlayed:false,playerStarted:false,playerMinutes:0,playerRating:0,playerStats:emptyStats(),seed:'shootout',performers};
  const regular=JSON.stringify({stats:match.playerStats,performers:match.performers,goals:[match.homeGoals,match.awayGoals],events:match.events});
  resolveNationalShootout(career,match);
  assert.ok(match.shootout);
  for(const attempt of match.shootout.attempts){
    const p=performers.find(p=>p.id===attempt.playerId)!;
    assert.ok(p);assert.equal(p.teamId,attempt.teamId);
    assert.ok(!['home10','home2','home3','unused-bench'].includes(p.id));
  }
  assert.equal(JSON.stringify({stats:match.playerStats,performers:match.performers,goals:[match.homeGoals,match.awayGoals],events:match.events}),regular);
  const replay=structuredClone(match);delete replay.shootout;
  resolveNationalShootout(career,replay);assert.deepEqual(replay.shootout,match.shootout);
});

test('international windows follow the local calendar and its displayed year',()=>{
  const january=fixture();
  assert.deepEqual(scheduledInternationalWindows(january).map(({date,endDate,half})=>({date,endDate,half})),[
    {date:'2026-06-05',endDate:'2026-06-25',half:'first'},
    {date:'2026-11-05',endDate:'2026-11-15',half:'second'},
  ]);
  const july=fixture({leagueId:'EN1'});
  assert.deepEqual(scheduledInternationalWindows(july).map(({date,half})=>({date,half})),[
    {date:'2026-11-05',half:'first'},{date:'2027-06-05',half:'second'},
  ]);
  july.season.calendarYear=2028;
  assert.deepEqual(scheduledInternationalWindows(july).map(({date})=>date),['2028-11-05','2029-06-05']);
});

test('only due international matches affect the player and the standings',()=>{
  const career=fixture({seed:'bracket-0'}),trust=career.managerTrust;
  assert.equal(career.systems!.national.status,'watchlist');
  processDueNationalWindows(career,'2026-06-04');
  assert.equal(career.systems!.national.matches.length,0);
  assert.equal(career.player.fitness,100);
  assert.equal(career.systems!.events.length,0);
  processDueNationalWindows(career,'2026-06-05');
  assert.equal(career.systems!.national.matches.length,1);
  assert.equal(career.systems!.national.matches[0].date,'2026-06-05');
  assert.equal(career.systems!.national.qualified,false,'one match cannot settle a three-team qualifying group');
  assert.ok(career.player.fitness<100,'the first actual appearance leaves fatigue');
  const first=structuredClone(career);
  processDueNationalWindows(career,'2026-06-05');assert.deepEqual(career,first);
  processDueNationalWindows(career,'2026-06-09');
  assert.equal(career.systems!.national.matches.length,1,'June 10 cannot be played on June 9');
  processDueNationalWindows(career,'2026-06-10');
  assert.equal(career.systems!.national.matches.length,2);
  assert.equal(career.systems!.national.qualified,false,'the remaining group match can still alter the table');
  processDueNationalWindows(career,'2026-06-11');
  assert.equal(career.systems!.national.teamResults?.filter(match=>match.fixtureId.includes('|qualifying|')).length,1);
  for(const date of ['2026-06-17','2026-06-18','2026-06-24','2026-06-25']){
    processDueNationalWindows(career,date);
    const ledger=[...career.systems!.national.matches,...career.systems!.national.teamResults??[]];
    assert.ok(ledger.every(match=>new Date(match.date!).getTime()<=new Date(date).getTime()));
    if(date==='2026-06-24')assert.ok(ledger.every(match=>!match.fixtureId.includes('|final|')));
  }
  assert.equal(career.managerTrust,trust,'national-team performances do not directly change the club manager\'s trust');
  assert.ok(career.systems!.national.processedWindows.includes('window:2026-06:senior'));
  assert.equal(career.systems!.events.filter(event=>event.id.startsWith('national:callup:2026-06:')).length,1);
});

test('incremental dates and a single due-date advance produce the same actual match ledger',()=>{
  for(const leagueId of ['KR1','EN1']){
    const batched=fixture({leagueId,seed:`incremental-${leagueId}`}),daily=structuredClone(batched);
    const first=scheduledInternationalWindows(batched)[0];
    for(const day of [4,5,9,10,11,15,17,18,24,25,30]){
      const date=`${first.date.slice(0,7)}-${String(day).padStart(2,'0')}`;
      processDueNationalWindows(daily,date);
    }
    processDueNationalWindows(batched,`${first.date.slice(0,7)}-30`);
    assert.deepEqual(daily,batched);
    assert.ok(daily.systems!.national.matches.every(match=>!match.fixtureId.includes('|friendly|')),'finishing new qualification cannot invent same-window friendlies');
  }
});

test('already completed calendar windows survive league and age-group changes without replaying a match',()=>{
  const career=fixture({leagueId:'EN1',age:20,seed:'calendar-idempotent'});
  processDueNationalWindows(career,'2026-12-31');
  processDueNationalWindows(career,'2027-06-30');
  archiveNationalSeason(career);
  const totals=getNationalTotals(career),reputation=career.systems!.national.reputation,history=structuredClone(career.systems!.national.history);
  career.season.year=2027;career.season.leagueId='KR1';career.season.index=1;career.player.age=21;
  processDueNationalWindows(career,'2027-07-01');
  assert.equal(career.systems!.national.matches.length,0);
  assert.deepEqual(getNationalTotals(career),totals);
  assert.equal(career.systems!.national.reputation,reputation);
  assert.deepEqual(career.systems!.national.history,history);
  assert.ok(!career.systems!.national.processedWindows.includes('callup:2027-06:senior'));
  processDueNationalWindows(career,'2027-11-15');
  assert.equal(career.systems!.national.squad,'senior');
  assert.ok(career.systems!.national.matches.every(match=>match.date?.startsWith('2027-11')));
  assert.deepEqual(getNationalTotals(career,{squad:'U20'}),totals);
});

test('old mid-window saves skip elapsed call-ups without fabricating past player actions',()=>{
  const career=fixture(),national=career.systems!.national;
  delete national.timingVersion;delete national.processedThrough;
  career.season.matches.push({id:'old-club-match',fixtureId:'old-club-fixture',round:15,seasonYear:2026,homeId:career.player.clubId,awayId:'test-away',homeGoals:0,awayGoals:0,events:[],playerClubId:career.player.clubId,playerPlayed:false,playerStarted:false,playerMinutes:0,playerRating:0,playerStats:emptyStats(),seed:'legacy',date:'2026-06-12'});
  const player=structuredClone(career.player),clubLedger=structuredClone(career.season.matches);
  processDueNationalWindows(career,'2026-06-26');
  assert.deepEqual(career.player,player);
  assert.deepEqual(career.season.matches,clubLedger);
  assert.equal(national.matches.length,0);
  assert.equal(national.history.length,0);
  assert.equal(getNationalTotals(career).apps,0);
  assert.ok(national.processedWindows.includes('window:2026-06:senior'));
  assert.ok(!national.processedWindows.includes('callup:2026-06:senior'));
  processDueNationalWindows(career,'2026-11-15');
  assert.ok(national.matches.length>=2);
  assert.ok(national.matches.every(match=>match.date?.startsWith('2026-11')));
});

test('legacy whole-window records and keys remain authoritative after restoring a save',()=>{
  const career=fixture();processNationalWindow(career,'first');
  const original=structuredClone(career.systems!.national.matches),totals=getNationalTotals(career),player=structuredClone(career.player);
  career.systems!.national.processedWindows=['2026:first','2026:second'];
  delete career.systems!.national.timingVersion;delete career.systems!.national.processedThrough;
  processDueNationalWindows(career,'2026-06-30');
  assert.deepEqual(career.systems!.national.matches,original);
  assert.deepEqual(getNationalTotals(career),totals);
  assert.deepEqual(career.player,player);
  assert.ok(!career.systems!.national.processedWindows.includes('window:2026-11:senior'),'future legacy keys do not create new future-dated markers');
});

test('a restored career with played fixtures uses its last club date as its migration cursor',()=>{
  const career=fixture();
  const round=career.season.totalWeeks/2+1;
  career.season.fixtures=[{id:'played',round,homeId:career.player.clubId,awayId:'test-away',played:true}];
  career.season.week=round;
  const current=fixtureDate(career.season,round);
  assert.ok(current>'2026-06-25');
  career.systems!.national=createNational(career);
  processDueNationalWindows(career,'2026-07-01');
  assert.equal(career.systems!.national.matches.length,0);
  assert.equal(career.player.fitness,100);
  assert.equal(career.systems!.national.timingVersion,1);
});

test('international injury is visible to the next club selection before that match is simulated',()=>{
  let injured:Career|undefined;
  for(let seed=0;seed<80&&!injured;seed++){
    const career=fixture({seed:`national-injury-${seed}`});
    processDueNationalWindows(career,'2026-06-30');
    if(career.player.injuryWeeks>0)injured=career;
  }
  assert.ok(injured,'a deterministic national appearance should cause an injury in this sample');
  const opponent=CLUBS.find(club=>club.leagueId==='KR1'&&club.id!==injured.player.clubId)!;
  const clubMatch=simulateMatch(injured,{id:'post-national',round:19,homeId:injured.player.clubId,awayId:opponent.id,played:false},{date:'2026-07-01'});
  assert.equal(clubMatch.playerPlayed,false);
  assert.equal(clubMatch.playerStats.apps,0);
  assert.equal(injured.managerTrust,90);
});
