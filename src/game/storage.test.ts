import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { CLUBS } from './data';
import { PLAY_STYLES } from './attributes';
import { advanceCareer, createCareer, retireCareer } from './engine';
import { applyContract, ensureEconomicHistory } from './career-systems';
import { processNationalWindow } from './national';
import { deleteSlot, exportCareer, importCareer, listSlots, loadCareer, restoreBackup, saveCareer, validateCareer } from './storage';
import type { Career, SaveEnvelope } from './types';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const legacyEnvelope = JSON.parse(readFileSync(new URL('../../tests/fixtures/v1-career.json', import.meta.url), 'utf8')) as SaveEnvelope;
const legacyV2Envelope = JSON.parse(gunzipSync(readFileSync(new URL('../../tests/fixtures/v2-career.json.gz', import.meta.url))).toString('utf8')) as SaveEnvelope;
function career(seed: string): Career {
  const value = structuredClone(legacyEnvelope.career);
  value.id = `storage-${seed}`;
  value.seed = seed;
  value.player.name = '김하늘 ⚽';
  return value;
}

test('career-long national team results exceed one-season limits while every score still validates',()=>{
  const c=createCareer({name:'국대 보존',nationality:'대한민국',age:24,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:PLAY_STYLES.ST[0],clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'national-retention-limit'});
  processNationalWindow(c,'first');const n=c.systems!.national,source=n.teamResults![0];assert.ok(source);
  n.teamResults=Array.from({length:160},(_,i)=>({...structuredClone(source),id:`${source.id}-retained-${i}`,fixtureId:`${source.fixtureId}-retained-${i}`}));
  validateCareer(c);
  const bad=structuredClone(c);bad.systems!.national.teamResults![159].homeGoals++;
  assert.throws(()=>validateCareer(bad),'raising the career count limit never bypasses actual score validation');
});

// Persistence tests compare independent, valid revisions of an actual old save.
// Full-world multi-season simulation is exercised once by the engine suite.
function snapshot(previous: Career, steps = 1): Career {
  const next = structuredClone(previous);
  next.revision++;
  next.player.morale = Math.max(0, previous.player.morale - steps / 100);
  return next;
}

test('original v1 envelopes retain their checksum and all legacy fields through load, export and import', async () => {
  const source = await readFile(new URL('../../tests/fixtures/v1-career.json', import.meta.url), 'utf8');
  const envelope = JSON.parse(source) as SaveEnvelope;
  assert.equal(envelope.career.systems, undefined);
  assert.deepEqual(validateCareer(envelope.career), envelope.career);
  const exported = JSON.parse(await exportCareer(envelope.career)) as SaveEnvelope;
  assert.equal(exported.hash, envelope.hash);
  assert.deepEqual(exported.career, envelope.career);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kball-careers', 1);
    request.onupgradeneeded = () => {
      for (const name of ['slots', 'backups', 'metadata']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('slots', 'readwrite');
    transaction.objectStore('slots').put({ id: envelope.career.id, envelope });
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
  assert.deepEqual(await loadCareer(envelope.career.id), envelope.career);
  const imported = await importCareer(source);
  assert.notEqual(imported.id, envelope.career.id);
  assert.deepEqual({ ...imported, id: envelope.career.id }, envelope.career);
  assert.equal(imported.systems, undefined);
  await deleteSlot(envelope.career.id);
});

test('published v2 envelopes preserve their checksum and do not invent new improvement ledgers while loading', async () => {
  const source = gunzipSync(readFileSync(new URL('../../tests/fixtures/v2-career.json.gz', import.meta.url))).toString('utf8');
  const envelope = JSON.parse(source) as SaveEnvelope;
  assert.equal(envelope.hash, 'ea43becb0be19ff50793942b29f3d9c8ef48795ee87729e50189f196277a2fa3');
  const original = envelope.career;
  assert.equal(original.systems?.version, 2);
  const systems = original.systems as unknown as Record<string, unknown>;
  const economics = systems.economics as Record<string, unknown>;
  assert.equal(systems.growthLedger, undefined);
  assert.equal(systems.trainingPlan, undefined);
  assert.equal(economics.contractHistory, undefined);
  const validated = validateCareer(original);
  assert.deepEqual(validated, original);
  const exported = JSON.parse(await exportCareer(validated)) as SaveEnvelope;
  assert.equal(exported.hash, envelope.hash);
  assert.deepEqual(exported.career, original);
  const imported = await importCareer(source);
  assert.notEqual(imported.id, original.id);
  assert.deepEqual({ ...imported, id: original.id }, original);
  assert.equal((imported.systems as unknown as Record<string, unknown>).growthLedger, undefined);
  const upgraded = retireCareer(imported);
  const ledger = upgraded.systems!.growthLedger!;
  assert.deepEqual(ledger.baselineAttributes, original.player.attributes);
  assert.ok(Object.values(ledger.byCause).every(cause => Object.keys(cause).length === 0));
  assert.equal(upgraded.systems!.economics.contractHistory!.length, 1);
  assert.equal(upgraded.systems!.economics.contractHistory![0].type, 'legacy');
  assert.equal(upgraded.systems!.economics.contractHistory![0].previous, undefined);
  assert.equal(upgraded.systems!.economics.contract.signedDate, undefined);
  assert.deepEqual(upgraded.systems!.national.matches, original.systems!.national.matches);
  assert.deepEqual(validateCareer(upgraded), JSON.parse(JSON.stringify(upgraded)));
});

test('contract snapshots reconcile renewals, transfers and known season-opening values without inventing previous terms', async () => {
  const original = structuredClone(legacyV2Envelope.career);
  original.id = 'storage-contract-history';
  ensureEconomicHistory(original);
  const economy = original.systems!.economics;
  assert.equal(economy.contractHistory!.length, 1);
  assert.equal(economy.contractHistory![0].type, 'legacy');
  assert.equal(economy.contractHistory![0].previous, undefined);
  assert.equal(economy.seasonStartValue, economy.valueHistory[0].value);
  const oldWage = original.player.wage;
  applyContract(original, { id: 'storage-renewal', type: 'renew', clubId: original.player.clubId, wage: oldWage + 1, years: 2, role: '주전', fee: 0, reason: '검증 재계약', effective: 'now' });
  const renewal = economy.contractHistory!.at(-1)!;
  assert.equal(renewal.previous!.wage, oldWage);
  assert.equal(economy.contract.previousWage, oldWage);
  assert.deepEqual(validateCareer(original), JSON.parse(JSON.stringify(original)));
  const alteredPrevious = structuredClone(original);
  alteredPrevious.systems!.economics.contractHistory!.at(-1)!.previous!.wage++;
  assert.throws(() => validateCareer(alteredPrevious), /이전 조건/);
  await saveCareer(original);
  await assert.rejects(saveCareer(alteredPrevious), /이전 조건/);
  assert.deepEqual(await loadCareer(original.id), original, 'a forged additive ledger cannot replace the previous valid slot');
  const alteredCurrent = structuredClone(original);
  alteredCurrent.systems!.economics.contractHistory!.at(-1)!.current.wage++;
  assert.throws(() => validateCareer(alteredCurrent), /최종 계약 이력/);
  const imaginaryBonus = structuredClone(original);
  imaginaryBonus.systems!.economics.contractHistory!.at(-1)!.fee = 1;
  assert.throws(() => validateCareer(imaginaryBonus), /재계약의 구단 또는 이적료/);
  const badDate = structuredClone(original);
  badDate.systems!.economics.contract.signedDate = '2026-02-30';
  assert.throws(() => validateCareer(badDate), /날짜/);
  const missingOpeningYear = structuredClone(original);
  delete missingOpeningYear.systems!.economics.seasonStartYear;
  assert.throws(() => validateCareer(missingOpeningYear), /seasonStartYear/);
  const wrongOpeningYear = structuredClone(original);
  wrongOpeningYear.systems!.economics.seasonStartYear!--;
  assert.throws(() => validateCareer(wrongOpeningYear), /시즌 시작 몸값/);

  const target = Object.values(original.systems!.world.clubs).find(club => club.leagueId === original.season.leagueId && club.id !== original.player.clubId && club.budget >= 1_000 && club.wageBudget / 52 * .14 >= original.player.wage)!;
  applyContract(original, { id: 'storage-transfer', type: 'transfer', clubId: target.id, wage: original.player.wage, years: 2, role: '주전', fee: 1_000, reason: '검증 이적', effective: 'now' });
  assert.equal(original.careerIncome, 0);
  assert.equal(economy.totalTransferFees, 1_000);
  const imported = await importCareer(await exportCareer(original));
  assert.deepEqual(imported.systems!.economics, JSON.parse(JSON.stringify(economy)));
  const alteredFee = structuredClone(original);
  alteredFee.systems!.economics.contractHistory!.at(-1)!.fee++;
  assert.throws(() => validateCareer(alteredFee), /이적 계약과 구단 간 이적 원장/);
  const reversed = structuredClone(original);
  reversed.systems!.economics.contractHistory!.reverse();
  assert.throws(() => validateCareer(reversed), /이전 계약/);
  await deleteSlot(original.id);
});

test('dated national windows reject malformed cursors, future periods and duplicate callups while keeping old processed keys', () => {
  const original = structuredClone(legacyV2Envelope.career);
  original.systems!.national.timingVersion = 1;
  original.systems!.national.processedThrough = '2026-06-25T00:00:00.000Z';
  original.systems!.national.processedWindows = ['2025:second', 'callup:2026-06:U20', 'window:2026-06:U20'];
  assert.deepEqual(validateCareer(original), original);
  const malformed = structuredClone(original);
  malformed.systems!.national.processedThrough = '2026-02-30T00:00:00.000Z';
  assert.throws(() => validateCareer(malformed), /정규 UTC/);
  const future = structuredClone(original);
  future.systems!.national.processedWindows.push('callup:2026-11:U20');
  assert.throws(() => validateCareer(future), /미래/);
  const duplicate = structuredClone(original);
  duplicate.systems!.national.processedWindows.push('callup:2026-06:U20');
  assert.throws(() => validateCareer(duplicate), /중복/);
  const nonWindow = structuredClone(original);
  nonWindow.systems!.national.processedWindows.push('window:2026-07:U20');
  assert.throws(() => validateCareer(nonWindow), /기간 키/);
});

test('legacy detail fields remain optional while malformed and future detailed records are rejected', async () => {
  const envelope = JSON.parse(await readFile(new URL('../../tests/fixtures/v1-career.json', import.meta.url), 'utf8')) as SaveEnvelope;
  const original = envelope.career;
  const expected = structuredClone(original);
  assert.deepEqual(validateCareer(original), expected);
  assert.equal(original.season.matches[0].playerStats.dribbleAttempts, undefined);
  const impossible = structuredClone(original);
  impossible.season.matches[0].playerStats.dribbleAttempts = 0;
  impossible.season.matches[0].playerStats.dribblesCompleted = 1;
  assert.throws(() => validateCareer(impossible), /성공 수가 시도 수보다/);
  const incomplete = structuredClone(original);
  incomplete.season.matches[0].metricsVersion = 2;
  assert.throws(() => validateCareer(incomplete), /mom/);
  const future = structuredClone(original) as unknown as { systems: unknown };
  future.systems = { version: 999 };
  assert.throws(() => validateCareer(future), /시스템 버전/);
  assert.deepEqual(original, expected);
});

test('v2 saves validate world membership, international scope, references and separate income ledgers', async () => {
  const original = createCareer({
    name: '검증 선수', nationality: '대한민국', age: 18, height: 181, weight: 75,
    foot: 'left', position: 'ST', talent: 'A', style: PLAY_STYLES.ST[0],
    clubId: CLUBS.find(club => club.leagueId === 'KR1')!.id,
    squad: 'senior', difficulty: 'realistic', seed: 'storage-v2-integrity',
  });
  assert.deepEqual(validateCareer(original), original);
  const economics = structuredClone(original);
  economics.systems!.economics.salaryIncome++;
  assert.throws(() => validateCareer(economics), /수입 합계/);
  const transferFeeAsIncome = structuredClone(original);
  transferFeeAsIncome.systems!.economics.totalTransferFees = 1;
  assert.throws(() => validateCareer(transferFeeAsIncome), /이적료 합계와 이적 원장/);
  const wrongWage = structuredClone(original);
  wrongWage.systems!.economics.contract.wageAtSigning++;
  assert.throws(() => validateCareer(wrongWage), /계약 소속·주급/);
  const unknownPlayer = structuredClone(original);
  unknownPlayer.systems!.world.clubs[original.player.clubId].rosterIds.push('missing-world-player');
  assert.throws(() => validateCareer(unknownPlayer), /선수 명단/);
  const invalidFinite = structuredClone(original);
  invalidFinite.systems!.economics.marketValue = Number.POSITIVE_INFINITY;
  assert.throws(() => validateCareer(invalidFinite), /marketValue/);
  const foreignYear = structuredClone(original);
  foreignYear.systems!.world.year++;
  assert.throws(() => validateCareer(foreignYear), /연도가 다릅니다/);

  // Keep a valid double round robin while exchanging one club between tiers.
  // Static catalog memberships stay unchanged; persisted world memberships govern fixtures.
  const promoted = structuredClone(original);
  const world = promoted.systems!.world;
  const upper = Object.values(world.clubs).find(club => club.leagueId === 'KR1' && club.id !== promoted.player.clubId)!;
  const lower = Object.values(world.clubs).find(club => club.leagueId === 'KR2')!;
  const replace = (id: string) => id === upper.id ? lower.id : id === lower.id ? upper.id : id;
  upper.leagueId = 'KR2'; lower.leagueId = 'KR1';
  for (const id of ['KR1', 'KR2']) {
    const state = world.competitions[id];
    for (const fixture of state.fixtures) { fixture.homeId = replace(fixture.homeId); fixture.awayId = replace(fixture.awayId); }
    for (const row of state.table) row.clubId = replace(row.clubId);
    state.table.sort((a, b) => a.clubId.localeCompare(b.clubId));
  }
  promoted.season.fixtures = structuredClone(world.competitions.KR1.fixtures);
  promoted.season.table = structuredClone(world.competitions.KR1.table);
  assert.deepEqual(validateCareer(promoted), promoted);
  const brokenMembership = structuredClone(promoted);
  brokenMembership.systems!.world.clubs[lower.id].leagueId = 'KR2';
  assert.throws(() => validateCareer(brokenMembership), /리그·구단/);

  const international = structuredClone(original);
  const record = structuredClone(legacyEnvelope.career.season.matches[0]);
  const priorHome = record.homeId, priorAway = record.awayId, priorPlayer = legacyEnvelope.career.player.id;
  const ownId = 'NAT:대한민국:senior', opponentId = 'NAT:일본:senior';
  record.homeId = record.playerClubId === priorHome ? ownId : opponentId;
  record.awayId = record.playerClubId === priorAway ? ownId : opponentId;
  record.playerClubId = ownId; record.scope = 'national'; record.competitionId = 'WC:2026';
  record.date = '2026-06-01'; record.homeName = record.homeId === ownId ? '대한민국' : '일본'; record.awayName = record.awayId === ownId ? '대한민국' : '일본';
  for (const event of record.events) { event.teamId = event.teamId === priorHome ? record.homeId : record.awayId; if (event.playerId === priorPlayer) event.playerId = original.player.id; }
  international.systems!.national.matches = [record];
  assert.deepEqual(validateCareer(international), international);
  const wrongScope = structuredClone(international);
  wrongScope.systems!.national.matches[0].scope = 'club';
  assert.throws(() => validateCareer(wrongScope), /경기 범위/);
  const clubInNational = structuredClone(international);
  clubInNational.systems!.national.matches[0].homeId = original.player.clubId;
  assert.throws(() => validateCareer(clubInNational), /국가대표 팀 ID/);
  const archivedClub = structuredClone(original);
  archivedClub.history = [{ year: 2025, clubId: 'missing-club', clubName: '없는 팀', leagueId: 'KR1', competitionName: 'K1', age: 18,
    position: 'ST', squad: 'senior', rank: 1, ovrStart: 50, ovrEnd: 50, stats: structuredClone(original.season.playerStats), awards: [], matches: [], attributeGrowth: {}, income: 0, completed: true }];
  assert.throws(() => validateCareer(archivedClub), /구단을 현재 데이터에서/);
  const imported = await importCareer(await exportCareer(promoted));
  assert.deepEqual(imported.systems, promoted.systems);
});

test('IndexedDB round trip preserves Korean names, match ledgers and selected training', async () => {
  const original = snapshot(career('storage-round-trip'), 5);
  await saveCareer(original);
  assert.deepEqual(await loadCareer(original.id), original);
  const slots = await listSlots();
  const slot = slots.find(item => item.id === original.id);
  assert.ok(slot);
  assert.equal(slot.playerName, '김하늘 ⚽');
  assert.equal(slot.revision, original.revision);
  assert.equal(slot.year, original.season.year);
  await deleteSlot(original.id);
});

test('autosaves atomically retain a previous-good backup and identical saves do not replace it', async () => {
  const previous = snapshot(career('storage-backup'), 1);
  const current = snapshot(previous, 3);
  await saveCareer(previous);
  await saveCareer(current);
  await saveCareer(current);
  const restored = await restoreBackup(current.id);
  assert.equal(restored.season.week, previous.season.week);
  assert.deepEqual(restored.season.matches, previous.season.matches);
  assert.ok(restored.revision > current.revision);
  assert.deepEqual(await loadCareer(current.id), restored);
  const undoRestore = await restoreBackup(current.id);
  assert.equal(undoRestore.season.week, current.season.week);
  assert.deepEqual(undoRestore.season.matches, current.season.matches);
  await deleteSlot(current.id);
});

test('a damaged current slot can be recovered without displacing its previous-good backup', async () => {
  const previous = snapshot(career('storage-damaged-current'), 1);
  const current = snapshot(previous, 2);
  await saveCareer(previous);
  await saveCareer(current);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kball-careers', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('slots', 'readwrite');
    // Structured-clone storage can retain broken values that JSON would normalize.
    transaction.objectStore('slots').put({ id: current.id, envelope: { career: { revision: Number.NaN } } });
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
  await assert.rejects(loadCareer(current.id));
  const restored = await restoreBackup(current.id);
  assert.equal(restored.season.week, previous.season.week);
  assert.ok(restored.revision > current.revision);
  assert.deepEqual(await loadCareer(current.id), restored);
  const retainedBackup = await restoreBackup(current.id);
  assert.deepEqual(retainedBackup.season, previous.season);
  await deleteSlot(current.id);
});

test('stale autosaves and equal-revision conflicting branches cannot overwrite a slot', async () => {
  const previous = career('storage-stale');
  const current = snapshot(previous, 2);
  await saveCareer(previous);
  await saveCareer(current);
  await assert.rejects(saveCareer(previous), /최신/);
  const otherBranch = structuredClone(current);
  otherBranch.player.name = '다른 진행';
  await assert.rejects(saveCareer(otherBranch), /같은 시점/);
  assert.deepEqual(await loadCareer(current.id), current);
  await deleteSlot(current.id);
});

test('another tab changing a slot is detected even when a local branch has a higher revision', async () => {
  const original = career('storage-tab-conflict');
  await saveCareer(original);
  const external = snapshot(original, 1);
  const local = snapshot(original, 4);
  const envelope: SaveEnvelope = JSON.parse(await exportCareer(external));
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('kball-careers', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('slots', 'readwrite');
    transaction.objectStore('slots').put({ id: external.id, envelope });
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
  // Engine revisions count commands rather than weeks. This branch is still later than the remote command.
  local.revision = external.revision + 10;
  await assert.rejects(saveCareer(local), /다른 탭/);
  assert.deepEqual(await loadCareer(original.id), external);
  await deleteSlot(original.id);
});

test('JSON import validates its checksum and creates a separate slot without changing its simulation seed', async () => {
  const original = snapshot(career('storage-import'), 3);
  await saveCareer(original);
  const exported = await exportCareer(original);
  const imported = await importCareer(exported);
  assert.notEqual(imported.id, original.id);
  assert.equal(imported.seed, original.seed);
  assert.equal(imported.player.id, original.player.id);
  assert.deepEqual(imported.season, original.season);
  await saveCareer(imported);
  assert.deepEqual(await loadCareer(original.id), original);
  assert.equal((await loadCareer(imported.id)).player.name, '김하늘 ⚽');
  assert.deepEqual(imported.history, original.history);
  assert.deepEqual(imported.training, original.training);
  await deleteSlot(original.id);
  await deleteSlot(imported.id);
});

test('edited, truncated, future-version and prototype-poisoned save files are rejected', async () => {
  const original = career('storage-invalid-import');
  const exported = await exportCareer(original);
  const edited = JSON.parse(exported) as SaveEnvelope;
  edited.career.player.name = '이름 변경';
  await assert.rejects(importCareer(JSON.stringify(edited)), /변경되었거나 손상/);
  const future = JSON.parse(exported) as Record<string, unknown>;
  future.schemaVersion = 999;
  await assert.rejects(importCareer(JSON.stringify(future)), /지원하지 않는 저장 버전/);
  await assert.rejects(importCareer(exported.slice(0, -20)), /올바른 JSON/);
  await assert.rejects(importCareer('{"__proto__":{"admin":true}}'), /허용하지 않는 속성/);
  assert.equal(({} as { admin?: boolean }).admin, undefined);
});

test('damaged statistics, league tables and shot-to-goal references are rejected before writing', async () => {
  const original = snapshot(career('storage-ledger-validation'), 8);
  await saveCareer(original);
  const brokenTotals = structuredClone(original);
  brokenTotals.season.playerStats.passes++;
  assert.throws(() => validateCareer(brokenTotals), /합계와 다릅니다/);
  await assert.rejects(saveCareer(brokenTotals));
  assert.deepEqual(await loadCareer(original.id), original);
  const brokenTable = structuredClone(original);
  brokenTable.season.table[0].points++;
  assert.throws(() => validateCareer(brokenTable), /순위표/);
  const brokenShot = structuredClone(original);
  const goal = brokenShot.season.matches.flatMap(match => match.events).find(event => event.type === 'goal');
  assert.ok(goal, 'the representative eight-week run must contain a goal');
  goal.relatedId = 'missing-shot';
  assert.throws(() => validateCareer(brokenShot), /슈팅이 없습니다/);
  const repeatedGoal = structuredClone(original);
  const record = repeatedGoal.season.matches.find(match => match.events.some(event => event.type === 'goal'))!;
  const existingGoal = record.events.find(event => event.type === 'goal')!;
  const duplicateGoal = { ...existingGoal, id: `${existingGoal.id}-duplicate` };
  record.events.push(duplicateGoal);
  if (duplicateGoal.teamId === record.homeId) record.homeGoals++; else record.awayGoals++;
  assert.throws(() => validateCareer(repeatedGoal), /중복 ID/);
  const swappedRanks = structuredClone(original);
  swappedRanks.season.table.reverse();
  assert.throws(() => validateCareer(swappedRanks), /순위표의 정렬/);
  const prematureWindow = structuredClone(original);
  prematureWindow.stage = 'offseason';
  assert.throws(() => validateCareer(prematureWindow), /시즌이 끝나기 전에/);
  await deleteSlot(original.id);
});

test('the first editable command upgrades legacy systems without rewriting old match metrics or income', async () => {
  const original = career('storage-first-upgrade');
  const previousMatches = structuredClone(original.season.matches);
  const previousHistory = structuredClone(original.history);
  const previousIncome = original.careerIncome;
  await saveCareer(original);
  const upgraded = retireCareer(await loadCareer(original.id));
  assert.equal(upgraded.systems?.version, 2);
  assert.ok(upgraded.revision > original.revision);
  assert.deepEqual(upgraded.season.matches, previousMatches);
  assert.deepEqual(upgraded.history.slice(0, previousHistory.length), previousHistory);
  assert.equal(upgraded.careerIncome, previousIncome);
  assert.equal(upgraded.systems!.economics.salaryIncome + upgraded.systems!.economics.bonusIncome, previousIncome);
  assert.equal(upgraded.season.matches[0].metricsVersion, undefined);
  assert.equal(upgraded.systems!.growthLedger!.legacy, true);
  assert.equal(upgraded.systems!.growthLedger!.trackedFromRound, original.season.week);
  assert.deepEqual(upgraded.systems!.growthLedger!.baselineAttributes, original.player.attributes);
  assert.ok(Object.values(upgraded.systems!.growthLedger!.byCause).every(cause => Object.keys(cause).length === 0));
  assert.equal(upgraded.systems!.economics.contractHistory![0].type, 'legacy');
  assert.equal(upgraded.systems!.economics.contractHistory![0].previous, undefined);
  assert.equal(upgraded.systems!.economics.seasonStartValue, undefined, 'midseason imports cannot invent an opening valuation');
  await saveCareer(upgraded);
  assert.deepEqual(await loadCareer(original.id), validateCareer(upgraded));
  const imported = await importCareer(await exportCareer(upgraded));
  assert.deepEqual(imported.history, upgraded.history);
  assert.deepEqual(imported.season, upgraded.season);
  assert.equal(imported.stage, 'retired');
  await deleteSlot(original.id);
});

test('a continued v1 career retains old match coverage and saves new detailed matches beside it', async () => {
  const original = career('storage-v1-continue');
  // Old versions could store successful tackles without an attempt denominator.
  // Preserve a valid old personal ledger with that coverage before adding v2 records.
  const legacyMatch = original.season.matches[0];
  assert.equal(original.season.playerStats.apps, 0, 'the archived fixture starts without personal appearances');
  Object.assign(legacyMatch.playerStats, {apps: 1, starts: 1, minutes: 60, ratingCount: 1, ratingSum: 6.5, tackles: 12});
  legacyMatch.playerPlayed = true; legacyMatch.playerStarted = true; legacyMatch.playerMinutes = 60; legacyMatch.playerRating = 6.5;
  original.season.playerStats = structuredClone(legacyMatch.playerStats);
  validateCareer(original);
  const before = structuredClone(original.season.matches);
  const continued = advanceCareer(original, 1);
  assert.equal(continued.systems?.version, 2);
  assert.equal(continued.systems?.legacyMetrics, true);
  assert.equal(continued.season.week, original.season.week + 1);
  assert.deepEqual(continued.season.matches.slice(0, before.length), before);
  assert.equal(continued.season.matches.at(-1)?.metricsVersion, 2);
  const serializable = JSON.parse(JSON.stringify(continued)) as Career;
  assert.deepEqual(validateCareer(continued).season, serializable.season);
  const imported = await importCareer(await exportCareer(continued));
  assert.deepEqual(imported.season, serializable.season);
  assert.equal(imported.careerIncome, continued.careerIncome);
  assert.equal(original.systems, undefined);
  const ledger = continued.systems!.growthLedger!;
  assert.equal(ledger.trackedFromRound, original.season.week);
  assert.deepEqual(ledger.baselineAttributes, original.player.attributes);
  const alteredGain = structuredClone(continued);
  const firstAttribute = Object.keys(continued.player.attributes)[0] as keyof typeof continued.player.attributes;
  alteredGain.systems!.growthLedger!.byCause.training[firstAttribute] = (ledger.byCause.training[firstAttribute] ?? 0) + 1;
  assert.throws(() => validateCareer(alteredGain), /원인별 성장 합계/);
  const hiddenLoss = structuredClone(continued);
  hiddenLoss.systems!.growthLedger!.byCause.injury[firstAttribute] = 1;
  assert.throws(() => validateCareer(hiddenLoss), /성장 원인 방향/);
  const inventedPast = structuredClone(continued);
  inventedPast.systems!.growthLedger!.legacy = false;
  assert.throws(() => validateCareer(inventedPast), /과거 미집계/);
  const missingCause = structuredClone(continued);
  delete (missingCause.systems!.growthLedger!.byCause as Partial<typeof ledger.byCause>).aging;
  assert.throws(() => validateCareer(missingCause), /성장 원인이 누락/);
  const pendingTraining = structuredClone(continued);
  pendingTraining.systems!.trainingPlan!.confirmed = false;
  assert.throws(() => validateCareer(pendingTraining), /훈련 계획이 확정/);
  const nextYearTraining = structuredClone(continued);
  nextYearTraining.systems!.trainingPlan!.forYear++;
  assert.throws(() => validateCareer(nextYearTraining), /훈련 계획이 확정/);

  // Aging records remain separate from this season's tracked gains.
  const withAging = structuredClone(continued), endAttributes = structuredClone(continued.season.attributeStart), startAttributes = structuredClone(endAttributes);
  startAttributes[firstAttribute] = (endAttributes[firstAttribute] ?? 0) + .1;
  withAging.systems!.agingReport = {year: continued.season.year, startAttributes, endAttributes, changes: {[firstAttribute]: -.1}, ovrStart: continued.player.ovr, ovrEnd: continued.player.ovr};
  assert.deepEqual(validateCareer(withAging).systems!.agingReport, withAging.systems!.agingReport);
  const wrongAging = structuredClone(withAging);
  wrongAging.systems!.agingReport!.changes[firstAttribute] = -.2;
  assert.throws(() => validateCareer(wrongAging), /연령 변화 합계/);
});

test('only explicitly named club reserve snapshots may lack a persistent world roster entry', () => {
  const original = createCareer({name: '예비 선수 검증', nationality: '대한민국', age: 24, height: 180, weight: 75,
    foot: 'right', position: 'ST', talent: 'A', style: PLAY_STYLES.ST[0], clubId: CLUBS[0].id,
    squad: 'senior', difficulty: 'realistic', seed: 'storage-reserve-snapshot'});
  const club = CLUBS[0], id = `${club.id}:reserve:0`;
  original.systems!.world.playerStats[id] = {playerId: id, name: `${club.name} 예비 선수 1 (가상)`,
    clubId: club.id, leagueId: club.leagueId, nationality: club.country, position: 'CM', ovr: 45,
    stats: structuredClone(original.season.playerStats)};
  validateCareer(original);
  const wrongName = structuredClone(original);
  wrongName.systems!.world.playerStats[id].name = '실존 선수라고 오인할 이름';
  assert.throws(() => validateCareer(wrongName), /월드 선수 기록 참조/);
  const wrongId = structuredClone(original);
  const wrongRow = wrongId.systems!.world.playerStats[id];
  delete wrongId.systems!.world.playerStats[id];
  wrongRow.playerId = `${club.id}:reserve:13`;
  wrongId.systems!.world.playerStats[wrongRow.playerId] = wrongRow;
  assert.throws(() => validateCareer(wrongId), /월드 선수 기록 참조/);
  const calendar = structuredClone(original) as Career & {season: Career['season'] & {calendarYear: number}};
  calendar.season.calendarYear = calendar.season.year + 1;
  validateCareer(calendar);
  calendar.season.calendarYear = calendar.season.year - 1;
  assert.throws(() => validateCareer(calendar), /calendarYear/);
});

test('historical award snapshots survive retirement of the ranked NPC without relaxing live references', async () => {
  const original = createCareer({name: '수상 원장', nationality: '대한민국', age: 24, height: 180, weight: 75,
    foot: 'right', position: 'ST', talent: 'A', style: PLAY_STYLES.ST[0], clubId: CLUBS[0].id,
    squad: 'senior', difficulty: 'realistic', seed: 'storage-old-award-snapshot'});
  const candidate = {playerId: 'retired-former-world-player', name: '은퇴한 과거 수상자', clubId: CLUBS[1].id,
    position: 'ST' as const, score: 75, rank: 1, stats: structuredClone(original.season.playerStats),
    nationalStats: structuredClone(original.season.playerStats)};
  original.systems!.rankings = [{year: original.season.year - 1, candidates: [candidate], playerRank: null,
    winnerId: candidate.playerId, world11: [structuredClone(candidate)], awards: []}];
  assert.deepEqual(validateCareer(original), original);
  const imported = await importCareer(await exportCareer(original));
  assert.deepEqual(imported.systems!.rankings, original.systems!.rankings);
  const wrongReference = structuredClone(original);
  wrongReference.systems!.rankings[0].year = wrongReference.season.year;
  assert.throws(() => validateCareer(wrongReference), /수상 후보 선수 참조/);
  const future = structuredClone(original);
  future.systems!.rankings[0].year = future.season.year + 1;
  assert.throws(() => validateCareer(future), /ranking.year/);
  const wrongRank = structuredClone(original);
  wrongRank.systems!.rankings[0].candidates[0].rank = 2;
  assert.throws(() => validateCareer(wrongRank), /후보 순위와 점수/);
  const wrongPlayerRank = structuredClone(original);
  wrongPlayerRank.systems!.rankings[0].playerRank = 1;
  assert.throws(() => validateCareer(wrongPlayerRank), /순위와 후보/);
});

test('actual international goalkeeper matches and their attempt denominators survive export/import', async () => {
  const original = createCareer({name: '국대 골키퍼', nationality: '대한민국', age: 24, height: 190, weight: 85,
    foot: 'right', position: 'GK', talent: 'SSS', style: PLAY_STYLES.GK[0], clubId: CLUBS.find(c => c.leagueId === 'KR1')!.id,
    squad: 'senior', difficulty: 'free', seed: 'storage-national-keeper'});
  for (const key of Object.keys(original.player.attributes) as (keyof typeof original.player.attributes)[]) original.player.attributes[key] = 95;
  original.systems!.growthLedger!.baselineAttributes = {...original.player.attributes};
  original.season.attributeStart = {...original.player.attributes};
  original.player.ovr = 95; original.managerTrust = 98;
  processNationalWindow(original, 'first');
  const records = original.systems!.national.matches;
  assert.ok(records.length >= 2 && records.some(record => record.playerPlayed));
  assert.ok(records.every(record => record.playerClubId.startsWith('NAT:대한민국:')));
  const imported = await importCareer(await exportCareer(original));
  assert.deepEqual(imported.systems!.national, (JSON.parse(JSON.stringify(original)) as Career).systems!.national);
  const shootout = [...original.systems!.national.matches, ...(original.systems!.national.teamResults ?? [])].find(record => record.shootout);
  assert.ok(shootout, 'the seeded international run exercises a tied knockout and shootout');
  const wrongTaker = structuredClone(original);
  const brokenShootout = [...wrongTaker.systems!.national.matches, ...(wrongTaker.systems!.national.teamResults ?? [])].find(record => record.id === shootout.id)!;
  brokenShootout.shootout!.attempts[0].playerId = 'unused-player-not-in-match';
  assert.throws(() => validateCareer(wrongTaker), /승부차기 선수가 경기 출전 명단에/);
  const corrupt = structuredClone(original);
  const personal = corrupt.systems!.national.matches.find(record => record.playerPlayed)!.playerStats;
  personal.saves = (personal.shotsFaced ?? 0) + 1;
  assert.throws(() => validateCareer(corrupt), /성공 수가 시도 수보다/);
});

test('deleting a slot also deletes its backup and blocks a delayed autosave from reviving it', async () => {
  const original = career('storage-delete');
  await saveCareer(original);
  const later = snapshot(original, 1);
  await saveCareer(later);
  await deleteSlot(original.id);
  assert.equal((await listSlots()).some(slot => slot.id === original.id), false);
  await assert.rejects(loadCareer(original.id), /찾을 수 없습니다/);
  await assert.rejects(restoreBackup(original.id), /이전 저장본/);
  await assert.rejects(saveCareer(later), /삭제되었습니다/);
});
