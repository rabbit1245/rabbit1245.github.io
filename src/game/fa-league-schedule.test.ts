import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {PLAY_STYLES} from './attributes';
import {executeCommand} from './commands';
import {getLeague} from './data';
import {createCareer} from './engine';
import {evaluateExtraHonours, switchMonthlyLeague} from './extra-honours';
import {certifyGameDelta, prepareGameDelta, sealCareer} from './game-delta';
import {captureSeasonDetails} from './season-details';
import {loadCareer, saveCareer, saveCareerChange, validateCareer, verifySaveText} from './storage';
import {packGameResult} from './worker-result';

test('in-season U19 FA contracts preserve fixtures across same- and cross-league signings and reopening',async()=>{
 const initial=createCareer({name:'검수 유소년',nationality:'대한민국',age:17,height:180,weight:72,foot:'right',position:'RW',talent:'S',style:PLAY_STYLES.RW[0],clubId:'KR2_03',squad:'youth',difficulty:'realistic',seed:'youth-fa-audit',training:[]});
 const played=validateCareer(executeCommand(initial,{type:'advance',weeks:2},'play-two-academy-rounds'));
 const {fixtures,matches,table,playerStats,leagueId}=played.season;
 const released=sealCareer(validateCareer(executeCommand(played,{type:'releaseContract'},'academy-release')));
 const sameOffer=released.offers.find(offer=>offer.clubId==='KR2_03');
 const crossOffer=released.offers.find(offer=>offer.clubId==='BR3_20');
 assert.ok(sameOffer&&crossOffer);

 const same=validateCareer(executeCommand(released,{type:'transfer',offerId:sameOffer.id},'academy-same-league'));
 assert.equal(same.season.competitionName,played.season.competitionName);
 assert.deepEqual(same.season.fixtures,fixtures);
 assert.deepEqual(same.season.table,table);
 assert.deepEqual(same.season.matches,matches);

 await saveCareer(released);
 const cross=sealCareer(executeCommand(released,{type:'transfer',offerId:crossOffer.id},'academy-cross-league'));
 const archived=cross.systems!.youthLeagueSchedules![leagueId];
 const world=cross.systems!.world.competitions[cross.season.leagueId];
 assert.equal(cross.season.competitionName,`${getLeague(world.leagueId).name} · U19 시뮬레이션`);
 assert.deepEqual(cross.season.matches,matches);
 assert.deepEqual(cross.season.playerStats,playerStats);
 assert.deepEqual(archived.fixtures,fixtures);
 assert.deepEqual(archived.table,table);
 assert.notDeepEqual(cross.season.fixtures,world.fixtures);
 assert.equal(cross.season.fixtures.filter(fixture=>fixture.played).length,world.fixtures.filter(fixture=>fixture.played).length);

 const prepared=await prepareGameDelta(packGameResult(released,cross),true);
 assert.ok(prepared);
 certifyGameDelta(released,cross,prepared);
 await saveCareerChange(released,cross);
 const reopened=await loadCareer(cross.id);
 assert.deepEqual(reopened.systems!.youthLeagueSchedules?.[leagueId],archived);
 assert.deepEqual(reopened.season.matches,matches);
 const continued=validateCareer(executeCommand(reopened,{type:'advance',weeks:1},'play-new-academy-round'));
 assert.equal(continued.season.week,cross.season.week+1);
 assert.deepEqual(continued.season.matches.slice(0,matches.length),matches);
 assert.equal(continued.season.matches.at(-1)?.playerClubId,crossOffer.clubId);
 assert.equal(continued.season.matches.at(-1)?.competitionId,world.leagueId);
 const formerStanding=captureSeasonDetails(continued)?.employmentStandings?.find(standing=>standing.clubId===initial.player.clubId);
 assert.equal(formerStanding?.atDeparture,true);
 assert.equal(formerStanding?.points,table.find(standing=>standing.clubId===initial.player.clubId)?.points);
});

test('a legacy senior FA signing preserves monthly contenders under their original league',async()=>{
 const source=gunzipSync(readFileSync(new URL('../../tests/fixtures/kball-2117-midseason.json.gz',import.meta.url))).toString('utf8');
 const played=await verifySaveText(source);
 const origin=played.season.leagueId;
 const monthly=played.systems!.monthlyLeague!;
 const playerId=played.player.id;
 assert.deepEqual(Object.values(monthly.months).map(rows=>rows[playerId]?.stats.apps),[3,2]);
 const released=executeCommand(played,{type:'releaseContract'},'senior-release');
 const offer=released.offers.find(row=>row.clubId==='KR1_01');
 assert.ok(offer);
 const signed=validateCareer(executeCommand(released,{type:'transfer',offerId:offer.id},'senior-cross-league'));
 const destination=signed.season.leagueId;
 assert.equal(signed.systems!.monthlyLeague,undefined);
 assert.deepEqual(signed.systems!.monthlyLeagueArchive?.[origin],monthly);
 assert.deepEqual(signed.season.matches,played.season.matches);
 const continued=validateCareer(executeCommand(signed,{type:'advance',weeks:1},'play-new-senior-league'));
 assert.equal(continued.systems!.monthlyLeague?.leagueId,destination);
 assert.deepEqual(continued.systems!.monthlyLeagueArchive?.[origin],monthly);

 // Controlled winners in the same calendar month must retain separate award IDs and club names.
 const month='2026-02',past=monthly.months[month][playerId];
 continued.systems!.monthlyLeagueArchive![origin]={...monthly,months:{[month]:{[playerId]:{...past,stats:{...past.stats,apps:2,minutes:180,ratingCount:2,ratingSum:18}}}}};
 const current={...past,clubId:offer.clubId,stats:{...past.stats,apps:2,minutes:180,ratingCount:2,ratingSum:18}};
 continued.systems!.monthlyLeague={year:continued.season.year,leagueId:destination,months:{[month]:{[playerId]:current}}};
 const winners=evaluateExtraHonours(continued).filter(award=>award.category==='league-monthly'&&award.name.endsWith('이달의 선수'));
 assert.deepEqual(winners.map(award=>award.clubId),[past.clubId,offer.clubId]);
 assert.deepEqual(winners.map(award=>award.name),[origin,destination].map(id=>`언론 선정 · ${getLeague(id).name} ${month} 이달의 선수`));
 assert.equal(new Set(winners.map(award=>award.id)).size,2);

 switchMonthlyLeague(continued,origin);
 assert.equal(continued.systems!.monthlyLeague.leagueId,origin);
 assert.deepEqual(continued.systems!.monthlyLeagueArchive?.[destination]?.months[month][playerId],current);
});

test('a second FA contract from the same club creates a new contract record',()=>{
 const initial=createCareer({name:'재입단 검수',nationality:'대한민국',age:25,height:180,weight:72,foot:'right',position:'RW',talent:'S',style:PLAY_STYLES.RW[0],clubId:'KR2_03',squad:'senior',difficulty:'realistic',seed:'natural-repeat-0',training:[]});
 const free=executeCommand(initial,{type:'releaseContract'},'first-release');
 const offer=free.offers.find(offer=>offer.clubId==='US3A_11');
 assert.ok(offer);
 const first=executeCommand(free,{type:'transfer',offerId:offer.id},'first-contract');
 const firstRecord=first.systems!.economics.contractHistory!.at(-1)!;
 const released=executeCommand(first,{type:'releaseContract'},'second-release');
 assert.ok(released.offers.some(again=>again.id===offer.id));
 const second=validateCareer(executeCommand(released,{type:'transfer',offerId:offer.id},'second-contract'));
 const records=second.systems!.economics.contractHistory!.slice(-3);
 assert.equal(second.player.clubId,offer.clubId);
 assert.equal(firstRecord.id,`contract:${offer.id}`);
 assert.deepEqual(records[0],firstRecord);
 assert.equal(records[1].type,'release');
 assert.equal(records[2].current.clubId,offer.clubId);
 assert.notEqual(records[2].id,firstRecord.id);
});
