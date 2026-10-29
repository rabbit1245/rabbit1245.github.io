import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer,advanceCareer} from './engine';
import {getWorldClubPlayers} from './world';
import {getClub} from './data';
import {simulateMatch} from './match-engine';
import {validateActionLedger} from './action-metrics';
import {recoverLegacyKeeperRoles} from './keeper-recovery';
import {exportCareer,verifySaveText,prepareEnvelope} from './storage';
import {canonicalBytes} from './canonical-bytes';
import {decodeStored,packEnvelope} from './save-codec';
function fresh(position:'ST'|'GK'='ST'){return createCareer({name:'골키퍼 복구 검수',nationality:'대한민국',age:25,height:184,weight:80,foot:'right',position,talent:'A',style:position==='GK'?'슛 스토퍼':'포처',clubId:'IT3_30',squad:'senior',difficulty:'realistic',seed:'keeper-regression-2110',training:[]});}
function setup(c:ReturnType<typeof fresh>){const f=c.season.fixtures.find(f=>f.homeId===c.player.clubId)!;return {f,options:{home:getClub(f.homeId),away:getClub(f.awayId),homePlayers:getWorldClubPlayers(c,f.homeId),awayPlayers:getWorldClubPlayers(c,f.awayId),detailed:false,forceSelection:{from:0,to:90,started:true}}};}
test('missing healthy GK depth fields explicitly fictional keepers instead of an unlabelled outfielder',()=>{
 const c=fresh(),{f,options}=setup(c);const m=simulateMatch(c,f,{...options,awayPlayers:options.awayPlayers.filter(p=>p.position!=='GK')});validateActionLedger(m,c.player.id);assert.ok(m.performers!.some(p=>p.position==='GK'&&p.teamId===f.awayId));
});
test('outfield insertion cannot evict a goalkeeper when its positional group is absent',()=>{
 const c=fresh(),{f,options}=setup(c);const m=simulateMatch(c,f,{...options,homePlayers:options.homePlayers.filter(p=>!['ST','CF','SS','LW','RW'].includes(p.position))});validateActionLedger(m,c.player.id);assert.ok(m.performers!.some(p=>p.position==='GK'&&p.teamId===f.homeId));
});
test('a sent-off goalkeeper is replaced by withdrawing an outfielder, retaining exactly ten active players',()=>{
 const c=fresh('GK'),{f,options}=setup(c);c.systems!.personality={leadership:5,stardom:5,fairPlay:1,clutch:5,winning:5};let found=false;
 for(let i=0;i<500;i++){c.seed=`keeper-red-${i}`;const m=simulateMatch(c,f,{...options,forceSelection:undefined});if(!m.playerStats.redCards)continue;found=true;validateActionLedger(m,c.player.id);const minute=m.playerMinutes+1,team=m.performers!.filter(p=>p.teamId===f.homeId&&((p.started?0:m.events.find(e=>e.type==='substitution'&&e.playerId===p.id)!.minute)+p.minutes)>=minute);assert.equal(team.length,10);assert.equal(team.filter(p=>p.position==='GK').length,1);break;}assert.ok(found);
});
test('old emergency roles are inferred from their own source; new invalid lineups are never repaired',()=>{
 const c=fresh(),{f,options}=setup(c),m=simulateMatch(c,f,options);delete m.lineupVersion;const keeper=m.performers!.find(p=>p.position==='GK'&&p.teamId===f.awayId)!;keeper.position='RB';const events=structuredClone(m.events),stats=structuredClone(m.playerStats);
 assert.throws(()=>validateActionLedger(m,c.player.id),/크로스 상대 골키퍼/);assert.equal(recoverLegacyKeeperRoles(m),1);validateActionLedger(m,c.player.id);assert.deepEqual(m.events,events);assert.deepEqual(m.playerStats,stats);assert.equal(keeper.position,'RB');
 const newer=structuredClone(m);newer.lineupVersion=2;delete newer.performers!.find(p=>p.id===keeper.id)!.emergencyGoalkeeper;assert.equal(recoverLegacyKeeperRoles(newer),0);assert.throws(()=>validateActionLedger(newer,c.player.id),/골키퍼/);
});
test('a hash-verified affected file and durable Blob recover without bypassing integrity or changing statistics',async()=>{
 const c=advanceCareer(fresh()),m=c.season.matches[0];delete m.lineupVersion;const keeper=m.performers!.find(p=>p.position==='GK'&&p.teamId!==c.player.clubId)!;keeper.position='RB';
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',canonicalBytes(c)))].map(b=>b.toString(16).padStart(2,'0')).join('');const envelope={format:'kball-save' as const,schemaVersion:1 as const,hash,savedAt:new Date().toISOString(),career:c};
 const loaded=await verifySaveText(JSON.stringify(envelope));assert.ok(loaded.season.matches[0].performers!.find(p=>p.id===keeper.id)!.emergencyGoalkeeper);assert.deepEqual(loaded.season.playerStats,c.season.playerStats);assert.deepEqual(loaded.season.matches[0].events,m.events);assert.equal(keeper.emergencyGoalkeeper,undefined);
 const stored=packEnvelope(envelope).record,decoded=await decodeStored(stored);assert.ok(decoded.normalized);assert.equal(decoded.versionHash,hash);assert.deepEqual((await decodeStored(decoded.normalized!)).career,decoded.career);
 const bad=JSON.parse(JSON.stringify(envelope));bad.career.player.name+='위조';await assert.rejects(()=>verifySaveText(JSON.stringify(bad)),/변경|손상/);
 await verifySaveText(await exportCareer(loaded));
});
test('owned Worker snapshots avoid another deep copy while receiving the same validation and checksum',async()=>{
 const c=fresh(),own=structuredClone(c),normal=await prepareEnvelope(c),owned=await prepareEnvelope(own,true);assert.equal(owned.career,own);assert.notEqual(normal.career,c);assert.equal(owned.hash,normal.hash);own.player.age=-1;await assert.rejects(()=>prepareEnvelope(own,true),/age/);
});
