import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,setNationalParticipation} from './engine';
import {FIELD_ATTRIBUTES,overall} from './attributes';
import {nationalAvailable,nationalParticipationLines,nationalParticipationReason,nationalParticipationNotice} from './national-participation';
import {nationalSquadPlayers,processDueNationalWindows,scheduledInternationalWindows} from './national';
import {executeCommand} from './commands';
import {commandChange} from './command-patches';
import {exportCareer,verifySaveText,validateCareer} from './storage';
import {buildCareerText} from './career-text';
import {getCaptainAssessment} from './captain';
import {simulateMatch} from './match-engine';
import {beginGrowthSeason} from './growth';

function fresh(){
 const c=createCareer({name:'국대 활동 검수',nationality:'네덜란드',age:26,height:180,weight:76,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'ES1_01',squad:'senior',difficulty:'realistic',seed:'national-participation-2115',training:[]});
 for(const key of FIELD_ATTRIBUTES)c.player.attributes[key]=100;c.player.ovr=overall(c.player);c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;beginGrowthSeason(c);c.managerTrust=95;c.player.form=90;return c;
}

test('independent reversible national switches use a bounded journal and preserve immutable world and past matches',async()=>{
 const c=fresh(),before=JSON.stringify(c.systems!.national);
 let n=executeCommand(c,{type:'nationalParticipation',key:'declineCallups',checked:true},'national-decline');
 assert.ok(commandChange(c,n));assert.equal(n.systems!.world,c.systems!.world);assert.equal(n.systems!.national,c.systems!.national);assert.equal(JSON.stringify(c.systems!.national),before);assert.equal(nationalAvailable(n),false);
 n=setNationalParticipation(n,'retired',true);assert.match(nationalParticipationReason(n)!,/은퇴/);assert.equal(getCaptainAssessment(n,'national').eligibleRole,'none');assert.deepEqual(nationalParticipationLines(n,n.season.year+1),['국가대표 은퇴 상태 유지','국가대표 소집 거절 유지']);
 n=setNationalParticipation(n,'retired',false);assert.equal(nationalAvailable(n),false,'remaining decline checkbox still blocks callups');
 n=setNationalParticipation(n,'declineCallups',false);assert.equal(nationalAvailable(n),true);
 assert.equal(nationalParticipationLines(c,c.season.year).length,0,'legacy careers do not invent old decisions');
 assert.match(nationalParticipationLines(n,n.season.year).join('\n'),/소집 재평가 가능/);
 const loaded=await verifySaveText(await exportCareer(n));assert.deepEqual(loaded.systems!.nationalParticipation,n.systems!.nationalParticipation);
 assert.match(buildCareerText(loaded),/국가대표 활동: .*국가대표 은퇴 설정/);
 const bad=structuredClone(n);bad.systems!.nationalParticipation!.retired=true;assert.throws(()=>validateCareer(bad),/설정과 이력/);
 const remapped=structuredClone(n);remapped.systems!.nationalParticipation!.history[0].round=12;remapped.systems!.nationalParticipation!.history[1].round=2;validateCareer(remapped);
 remapped.systems!.nationalParticipation!.history[0].date='2027-01-02';remapped.systems!.nationalParticipation!.history[1].date='2027-01-01';assert.throws(()=>validateCareer(remapped),/이력 날짜 순서/);
});

test('refusal excludes the actual roster and appearances but country matches continue; releasing it restores merit-based eligibility',()=>{
 let c=fresh();assert.ok(nationalSquadPlayers(c,'네덜란드','senior').some(r=>r.id===c.player.id));
 const fixture=c.season.fixtures.find(f=>f.homeId===c.player.clubId||f.awayId===c.player.clubId)!;
 const clubBefore=simulateMatch(c,fixture);
 c=setNationalParticipation(c,'declineCallups',true);assert.deepEqual(simulateMatch(c,fixture),clubBefore,'club decisions and match output are unchanged');
 assert.ok(!nationalSquadPlayers(c,'네덜란드','senior').some(r=>r.id===c.player.id));
 const window=scheduledInternationalWindows(c).find(w=>w.date>(c.systems!.national.processedThrough??''))!;
 processDueNationalWindows(c,window.date.slice(0,7)+'-28T00:00:00.000Z');
 assert.ok(c.systems!.national.matches.length>0,'real country schedule still plays without the user');
 assert.ok(c.systems!.national.matches.every(m=>!m.playerPlayed&&m.playerStats.apps===0&&!m.performers?.some(p=>p.id===c.player.id)));
 const oldMatches=JSON.stringify(c.systems!.national.matches);c=setNationalParticipation(c,'declineCallups',false);
  assert.match(nationalParticipationNotice(c)!,/설정을 해제/,'a stale historical refusal is displayed as pending reassessment');
 assert.ok(nationalSquadPlayers(c,'네덜란드','senior').some(r=>r.id===c.player.id));assert.equal(JSON.stringify(c.systems!.national.matches),oldMatches,'resuming never rewrites missed games');
 const next=scheduledInternationalWindows(c).find(w=>w.date>c.systems!.national.processedThrough!)!;
 processDueNationalWindows(c,next.date.slice(0,7)+'-28T00:00:00.000Z');assert.ok(c.systems!.national.matches.some(m=>m.playerPlayed),'subsequent real window can call and play the available elite player');assert.equal(nationalParticipationNotice(c),undefined);
});

test('retirement carries across seasons and records its year, and resuming does not restore an old captain appointment',()=>{
 let c=fresh();const l=c.systems!.leadership;l.nationalRole='captain';l.terms.push({scope:'national',teamId:'NAT:네덜란드:senior',role:'captain',startYear:c.season.year,apps:20,reason:'검수 주장'});
 c=setNationalParticipation(c,'retired',true);assert.equal(c.systems!.leadership.nationalRole,'none');assert.equal(c.systems!.leadership.terms.at(-1)!.endYear,c.season.year);
 assert.deepEqual(nationalParticipationLines(c,c.season.year+1),['국가대표 은퇴 상태 유지']);
 c=setNationalParticipation(c,'retired',false);assert.equal(nationalAvailable(c),true);assert.equal(c.systems!.leadership.nationalRole,'none');
 assert.throws(()=>setNationalParticipation({...c,stage:'retired'},'retired',false),/현역/);
});
