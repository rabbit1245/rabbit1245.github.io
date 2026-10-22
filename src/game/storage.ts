import { validateCareerExtensions } from './extension-validation';
import { CLUBS, LEAGUES } from './data';
import { CORE_STATS, DETAIL_STATS } from './math';
import type { Career, MatchRecord, PlayerStats, SaveEnvelope, SaveSlot } from './types';

const DATABASE = 'kball-careers';
const DATABASE_VERSION = 1;
const MAX_SAVE_BYTES = 128 * 1024 * 1024;
const clubs = new Map(CLUBS.map(club => [club.id, club]));
const leagues = new Set(LEAGUES.map(league => league.id));
const positions = new Set(['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'SS', 'ST']);
const fieldAttributes = ['strength', 'stamina', 'speed', 'agility', 'jumping', 'ballControl', 'dribbling', 'passing', 'crossing', 'shooting', 'heading', 'defending', 'setPieces', 'decisions', 'vision', 'anticipation', 'positioning', 'composure', 'concentration', 'teamwork'];
const keeperAttributes = ['gkShotStopping', 'gkReflexes', 'gkHandling', 'gkAerialCommand', 'gkOneOnOnes', 'gkPositioning', 'gkDistribution', 'decisions', 'concentration', 'gkDefensiveOrganization'];
const allAttributes = new Set([...fieldAttributes, ...keeperAttributes]);
const statKeys = CORE_STATS;
const eventTypes = new Set(['shot', 'goal', 'save', 'assist', 'yellow', 'red', 'injury', 'substitution', 'pass', 'keyPass', 'dribble', 'tackle', 'interception', 'aerial', 'handling', 'sweep', 'longKick']);
const poisonedKeys = new Set(['__proto__', 'prototype', 'constructor']);

interface StoredCareer { id: string; envelope: SaveEnvelope }
interface SlotMetadata extends SaveSlot { hash: string; deleted?: boolean }
type Tombstone = { id: string; revision: number; deleted: true };
type Metadata = SlotMetadata | Tombstone;
interface RecoverySnapshot { current?: StoredCareer; metadata?: Metadata; preserveBackup: boolean }

let databasePromise: Promise<IDBDatabase> | undefined;
const knownVersions = new Map<string, { revision: number; hash: string }>();
const writeQueues = new Map<string, Promise<unknown>>();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`저장 데이터 오류: ${message}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} 형식이 올바르지 않습니다.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength = 250): string {
  assert(typeof value === 'string' && value.length > 0 && value.length <= maxLength, `${label} 값이 올바르지 않습니다.`);
  return value;
}

function number(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER, integer = false): number {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum && (!integer || Number.isInteger(value)), `${label} 범위가 올바르지 않습니다.`);
  return value;
}

function bool(value: unknown, label: string): boolean {
  assert(typeof value === 'boolean', `${label} 값이 올바르지 않습니다.`);
  return value;
}

function list(value: unknown, label: string, maximum = 100_000): unknown[] {
  assert(Array.isArray(value) && value.length <= maximum, `${label} 목록이 올바르지 않습니다.`);
  return value;
}

function unique(values: string[], label: string): void {
  assert(new Set(values).size === values.length, `${label}에 중복 ID가 있습니다.`);
}

function clubId(value: unknown, label: string): string {
  const id = text(value, label);
  assert(clubs.has(id), `${label}의 구단을 현재 데이터에서 찾을 수 없습니다.`);
  return id;
}

function leagueId(value: unknown, label: string): string {
  const id = text(value, label);
  assert(leagues.has(id), `${label}의 리그를 현재 데이터에서 찾을 수 없습니다.`);
  return id;
}

function date(value: unknown, label: string): string {
  const timestamp = text(value, label, 80);
  assert(Number.isFinite(Date.parse(timestamp)), `${label} 날짜가 올바르지 않습니다.`);
  return timestamp;
}

function calendarDate(value: unknown, label: string): string {
  const day = text(value, label, 10);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day, `${label} 날짜가 올바르지 않습니다.`);
  return day;
}

function ensureSafeJSON(value: unknown): void {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const current = stack.pop()!;
    assert(++visited <= 16_000_000 && current.depth <= 64, '저장 구조가 지나치게 크거나 깊습니다.');
    if (!current.value || typeof current.value !== 'object') continue;
    for (const [key, item] of Object.entries(current.value)) {
      assert(!poisonedKeys.has(key), '허용하지 않는 속성이 포함되어 있습니다.');
      stack.push({ value: item, depth: current.depth + 1 });
    }
  }
}

function stringify(value: unknown): string {
  let serialized: string;
  try { serialized = JSON.stringify(value); }
  catch { throw new Error('저장 데이터를 JSON으로 변환할 수 없습니다.'); }
  assert(typeof serialized === 'string', '저장할 내용이 없습니다.');
  assert(new TextEncoder().encode(serialized).byteLength <= MAX_SAVE_BYTES, '저장 파일은 128MB 이하여야 합니다.');
  return serialized;
}

function attributes(value: unknown, label: string, required?: string[], minimum = 1): void {
  const values = object(value, label);
  for (const [key, amount] of Object.entries(values)) {
    assert(allAttributes.has(key), `${label}에 알 수 없는 능력치가 있습니다.`);
    number(amount, `${label}.${key}`, minimum, 100);
  }
  if (required) assert(required.every(key => typeof values[key] === 'number'), `${label}의 필수 능력치가 누락되었습니다.`);
}

const growthCauses = ['training', 'experience', 'development', 'injury', 'aging'] as const;

function sameAttributes(a: Record<string, unknown>, b: Record<string, unknown>, label: string): void {
  assert(Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => key in b), `${label}의 능력치 항목이 일치하지 않습니다.`);
}

function sameAttributeValues(a: Record<string, unknown>, b: Record<string, unknown>, label: string): void {
  sameAttributes(a, b, label);
  assert(Object.keys(a).every(key => Math.abs(Number(a[key]) - Number(b[key])) <= .025), `${label}의 기준 능력치가 다릅니다.`);
}

function growthLedger(value: unknown, end: unknown, throughRound: number, year: number, label: string, seasonStart: unknown): void {
  const row = object(value, label), baseline = object(row.baselineAttributes, `${label}.baselineAttributes`), target = object(end, `${label}.endAttributes`);
  assert(number(row.year, `${label}.year`, 1900, 2500, true) === year, `${label}의 연도가 다릅니다.`);
  attributes(baseline, `${label}.baselineAttributes`);
  sameAttributes(baseline, target, label);
  const from = number(row.trackedFromRound, `${label}.trackedFromRound`, 0, throughRound, true);
  number(row.injuredRounds, `${label}.injuredRounds`, 0, throughRound - from, true);
  number(row.trainingQuality, `${label}.trainingQuality`, 0, 3);
  const legacy = bool(row.legacy, `${label}.legacy`);
  assert(legacy || from === 0, `${label}의 추적 시작 주차에 과거 미집계 표시가 없습니다.`);
  if (!legacy) sameAttributeValues(baseline, object(seasonStart, `${label}.seasonStart`), label);
  const causes = object(row.byCause, `${label}.byCause`);
  assert(Object.keys(causes).length === growthCauses.length && growthCauses.every(cause => cause in causes), `${label}의 성장 원인이 누락되거나 올바르지 않습니다.`);
  for (const cause of growthCauses) {
    attributes(causes[cause], `${label}.byCause.${cause}`, undefined, -100);
    for (const [key, amount] of Object.entries(object(causes[cause], `${label}.byCause.${cause}`))) {
      assert(key in baseline, `${label}의 성장 원인에 다른 능력치가 있습니다.`);
      assert(cause === 'injury' || cause === 'aging' ? Number(amount) <= 0 : Number(amount) >= 0, `${label}의 성장 원인 방향이 올바르지 않습니다.`);
    }
  }
  for (const key of Object.keys(baseline)) {
    const change = growthCauses.reduce((total, cause) => total + Number((causes[cause] as Record<string, unknown>)[key] ?? 0), 0);
    assert(Math.abs(Number(baseline[key]) + change - Number(target[key])) <= .025, `${label}의 원인별 성장 합계와 능력치가 다릅니다.`);
  }
}

function agingReport(value: unknown, year: number, label: string, seasonStart: unknown): void {
  const row = object(value, label);
  assert(number(row.year, `${label}.year`, 1900, 2500, true) === year, `${label}의 연도가 다릅니다.`);
  attributes(row.startAttributes, `${label}.startAttributes`); attributes(row.endAttributes, `${label}.endAttributes`); attributes(row.changes, `${label}.changes`, undefined, -100);
  const start = object(row.startAttributes, `${label}.startAttributes`), end = object(row.endAttributes, `${label}.endAttributes`), changes = object(row.changes, `${label}.changes`);
  sameAttributes(start, end, label);
  sameAttributeValues(end, object(seasonStart, `${label}.seasonStart`), label);
  assert(Object.keys(changes).every(key => key in start), `${label}의 변화량에 다른 능력치가 있습니다.`);
  for (const key of Object.keys(start)) {
    assert(Number(changes[key] ?? 0) <= 0 && Math.abs(Number(start[key]) + Number(changes[key] ?? 0) - Number(end[key])) <= .025, `${label}의 연령 변화 합계와 능력치가 다릅니다.`);
  }
  const ovrStart = number(row.ovrStart, `${label}.ovrStart`, 1, 100), ovrEnd = number(row.ovrEnd, `${label}.ovrEnd`, 1, 100);
  assert(ovrEnd <= ovrStart, `${label}의 연령 변화 종합 능력치가 올바르지 않습니다.`);
}

function contractTerms(value: unknown, label: string): Record<string, unknown> {
  const row = object(value, label);
  clubId(row.clubId, `${label}.clubId`); number(row.wage, `${label}.wage`, 0, 1e12); text(row.role, `${label}.role`);
  const signed = number(row.signedYear, `${label}.signedYear`, 1900, 2500, true), expires = number(row.expiresYear, `${label}.expiresYear`, signed, 2520, true);
  assert(number(row.years, `${label}.years`, 0, 20, true) === expires - signed, `${label}의 계약 연수와 만료 연도가 다릅니다.`);
  if (row.signedDate !== undefined) calendarDate(row.signedDate, `${label}.signedDate`);
  if (row.expiresDate !== undefined) calendarDate(row.expiresDate, `${label}.expiresDate`);
  if (row.signedDate !== undefined && row.expiresDate !== undefined) assert(String(row.signedDate) <= String(row.expiresDate), `${label}의 계약 만료일이 서명일보다 빠릅니다.`);
  return row;
}

function matchingTerms(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return ['clubId', 'wage', 'years', 'signedYear', 'expiresYear', 'role', 'signedDate', 'expiresDate'].every(key => a[key] === b[key]);
}

function stats(value: unknown, label: string, detailed = false): PlayerStats {
  const values = object(value, label);
  for (const key of statKeys) number(values[key], `${label}.${key}`, 0, 100_000_000, key !== 'ratingSum');
  for (const key of DETAIL_STATS) if (detailed || values[key] !== undefined) number(values[key], `${label}.${key}`, 0, 100_000_000, true);
  assert(Number(values.starts) <= Number(values.apps), `${label}의 선발 수가 출전 수보다 많습니다.`);
  assert(Number(values.minutes) <= Number(values.apps) * 130, `${label}의 출전 시간이 올바르지 않습니다.`);
  assert(Number(values.goals) <= Number(values.shotsOnTarget) && Number(values.shotsOnTarget) <= Number(values.shots), `${label}의 득점·슈팅 합계가 일치하지 않습니다.`);
  assert(Number(values.passesCompleted) <= Number(values.passes), `${label}의 패스 성공 수가 시도 수보다 많습니다.`);
  assert(Number(values.cleanSheets) <= Number(values.apps) && Number(values.ratingCount) <= Number(values.apps), `${label}의 경기 수가 일치하지 않습니다.`);
  assert(Number(values.ratingSum) <= Number(values.ratingCount) * 10 + 0.000001, `${label}의 평점 합계가 올바르지 않습니다.`);
  for (const [success, attempts] of [['dribblesCompleted', 'dribbleAttempts'], ['tackles', 'tackleAttempts'], ['aerialWon', 'aerialAttempts'], ['saves', 'shotsFaced'], ['oneOnOneSaves', 'oneOnOneAttempts'], ['penaltiesSaved', 'penaltiesFaced'], ['crossesCaught', 'crossesFaced'], ['sweepingSuccesses', 'sweepingAttempts'], ['buildUpCompleted', 'buildUpPasses'], ['longKicksCompleted', 'longKicks'], ['handlingSuccesses', 'handlingAttempts'], ['lateSuccesses', 'lateActions']] as const) {
    // Old ledgers recorded tackles/saves without their new attempt denominators.
    // A mixed summary must not pretend those older attempts were zero.
    if ((success === 'tackles' || success === 'saves') && !detailed && values.detailedApps !== values.apps) continue;
    if (values[attempts] !== undefined) assert(Number(values[success] ?? 0) <= Number(values[attempts]), `${label}.${success} 성공 수가 시도 수보다 많습니다.`);
  }
  for (const key of ['mom', 'detailedApps'] as const) if (values[key] !== undefined) assert(Number(values[key]) <= Number(values.apps), `${label}.${key} 경기 수가 출전 수보다 많습니다.`);
  if (values.keyPasses !== undefined) assert(Number(values.keyPasses) <= Number(values.passes), `${label}의 키 패스가 패스 수보다 많습니다.`);
  return values as unknown as PlayerStats;
}

function teamId(value: unknown, label: string, national: boolean): string {
  const id = text(value, label);
  if (!national) return clubId(id, label);
  assert(/^NAT:[^:]{1,100}:(U20|senior)$/.test(id), `${label}의 국가대표 팀 ID가 올바르지 않습니다.`);
  return id;
}

function temporaryReserve(id: string, row: Record<string, unknown>): boolean {
  const club = clubs.get(String(row.clubId));
  if (!club || !id.startsWith(`${club.id}:reserve:`)) return false;
  const suffix = id.slice(`${club.id}:reserve:`.length);
  if (!/^(0|[1-9]\d?)$/.test(suffix) || Number(suffix) > 12) return false;
  return row.name === `${club.name} 예비 선수 ${Number(suffix) + 1} (가상)`;
}

function matches(value: unknown, label: string, playerId: string, national = false, maxRecords = 150): MatchRecord[] {
  const records = list(value, label, maxRecords);
  const ids: string[] = [];
  const fixtureIds: string[] = [];
  for (const [index, raw] of records.entries()) {
    const prefix = `${label}[${index}]`;
    const match = object(raw, prefix);
    ids.push(text(match.id, `${prefix}.id`));
    fixtureIds.push(text(match.fixtureId, `${prefix}.fixtureId`));
    text(match.seed, `${prefix}.seed`, 500);
    number(match.round, `${prefix}.round`, 1, 150, true);
    number(match.seasonYear, `${prefix}.seasonYear`, 1900, 2500, true);
    if (match.metricsVersion !== undefined) assert(match.metricsVersion === 2, `${prefix}의 경기 지표 버전을 지원하지 않습니다.`);
    if (match.scope !== undefined) assert(match.scope === (national ? 'national' : 'club'), `${prefix}의 경기 범위가 올바르지 않습니다.`);
    if (national) assert(match.scope === 'national', `${prefix}의 국가대표 경기 범위가 없습니다.`);
    if (national || match.competitionId !== undefined) text(match.competitionId, `${prefix}.competitionId`);
    if (national || match.date !== undefined) date(match.date, `${prefix}.date`);
    for (const key of ['homeName', 'awayName'] as const) if (national || match[key] !== undefined) text(match[key], `${prefix}.${key}`);
    const home = teamId(match.homeId, `${prefix}.homeId`, national);
    const away = teamId(match.awayId, `${prefix}.awayId`, national);
    assert(home !== away, `${prefix}의 양 팀이 같습니다.`);
    const userClub = teamId(match.playerClubId, `${prefix}.playerClubId`, national);
    assert(userClub === home || userClub === away, `${prefix}에 선수 소속 구단이 없습니다.`);
    const homeGoals = number(match.homeGoals, `${prefix}.homeGoals`, 0, 50, true);
    const awayGoals = number(match.awayGoals, `${prefix}.awayGoals`, 0, 50, true);
    const played = bool(match.playerPlayed, `${prefix}.playerPlayed`);
    const started = bool(match.playerStarted, `${prefix}.playerStarted`);
    assert(!started || played, `${prefix}의 선발·출장 정보가 일치하지 않습니다.`);
    const minutes = number(match.playerMinutes, `${prefix}.playerMinutes`, 0, 130, true);
    const rating = number(match.playerRating, `${prefix}.playerRating`, 0, 10);
    const personal = stats(match.playerStats, `${prefix}.playerStats`, match.metricsVersion === 2);
    assert(personal.apps === Number(played) && personal.starts === Number(started) && personal.minutes === minutes, `${prefix}의 출장 집계가 일치하지 않습니다.`);
    assert(personal.ratingCount === Number(played) && Math.abs(personal.ratingSum - rating) < 0.000001, `${prefix}의 평점 집계가 일치하지 않습니다.`);
    assert(played || (minutes === 0 && rating === 0), `${prefix}의 미출전 기록이 올바르지 않습니다.`);
    if (match.metricsVersion === 2) assert(personal.detailedApps === personal.apps, `${prefix}의 상세 지표 출전 수가 일치하지 않습니다.`);
    const events = list(match.events, `${prefix}.events`, 10_000).map((event, eventIndex) => {
      const item = object(event, `${prefix}.events[${eventIndex}]`);
      text(item.id, `${prefix}.event.id`);
      number(item.minute, `${prefix}.event.minute`, 0, 130);
      assert(eventTypes.has(text(item.type, `${prefix}.event.type`)), `${prefix}의 이벤트 종류가 올바르지 않습니다.`);
      assert(item.teamId === home || item.teamId === away, `${prefix}의 이벤트 팀이 일치하지 않습니다.`);
      text(item.playerName, `${prefix}.event.playerName`);
      text(item.detail, `${prefix}.event.detail`, 4_000);
      if (item.playerId !== undefined) text(item.playerId, `${prefix}.event.playerId`);
      if (item.relatedId !== undefined) text(item.relatedId, `${prefix}.event.relatedId`);
      return item;
    });
    unique(events.map(event => String(event.id)), `${prefix}.events`);
    const eventIndex = new Map(events.map(event => [event.id, event]));
    const goals = events.filter(event => event.type === 'goal');
    assert(goals.filter(event => event.teamId === home).length === homeGoals && goals.filter(event => event.teamId === away).length === awayGoals, `${prefix}의 득점 원장과 경기 결과가 다릅니다.`);
    unique(goals.map(goal => String(goal.relatedId)), `${prefix} 득점에 연결된 슈팅`);
    for (const goal of goals) {
      const shot = eventIndex.get(goal.relatedId);
      assert(shot?.type === 'shot' && shot.teamId === goal.teamId && shot.minute === goal.minute && shot.playerId === goal.playerId, `${prefix}의 골에 연결된 슈팅이 없습니다.`);
    }
    const assists = events.filter(event => event.type === 'assist');
    unique(assists.map(assist => String(assist.relatedId)), `${prefix} 도움에 연결된 득점`);
    for (const assist of assists) {
      const goal = eventIndex.get(assist.relatedId);
      assert(goal?.type === 'goal' && goal.teamId === assist.teamId && goal.minute === assist.minute && goal.playerId !== assist.playerId, `${prefix}의 도움에 연결된 득점이 올바르지 않습니다.`);
    }
    assert(personal.goals === goals.filter(event => event.playerId === playerId).length, `${prefix}의 개인 득점과 원장이 다릅니다.`);
    for (const [stat, type] of [['shots', 'shot'], ['assists', 'assist'], ['saves', 'save'], ['yellowCards', 'yellow'], ['redCards', 'red']] as const) {
      assert(personal[stat] === events.filter(event => event.type === type && event.playerId === playerId).length, `${prefix}의 개인 ${stat} 기록과 원장이 다릅니다.`);
    }
    assert(played || statKeys.every(key => personal[key] === 0), `${prefix}의 미출전 선수에게 경기 기록이 있습니다.`);
    const teamGoals = userClub === home ? homeGoals : awayGoals;
    assert(personal.goals + personal.assists <= teamGoals, `${prefix}의 개인 공격 포인트가 팀 득점보다 많습니다.`);
    if (match.effects !== undefined) {
      const effects = object(match.effects, `${prefix}.effects`);
      for (const key of ['fitnessAfter', 'moraleAfter', 'formAfter', 'trustAfter']) number(effects[key], `${prefix}.effects.${key}`, 0, 100);
      number(effects.injuryWeeksAfter, `${prefix}.effects.injuryWeeksAfter`, 0, 104, true);
    }
    if (match.performers !== undefined) {
      const performers = list(match.performers, `${prefix}.performers`, 64).map(raw => object(raw, `${prefix}.performer`));
      unique(performers.map(row => text(row.id, `${prefix}.performer.id`)), `${prefix}.performers`);
      for (const row of performers) {
        text(row.name, `${prefix}.performer.name`);
        assert(positions.has(String(row.position)), `${prefix}의 경기 선수 포지션이 올바르지 않습니다.`);
        number(row.ovr, `${prefix}.performer.ovr`, 1, 100);
        if (national) {
          if (String(row.clubId).startsWith('NAT:')) teamId(row.clubId, `${prefix}.performer.clubId`, true);
          else clubId(row.clubId, `${prefix}.performer.clubId`);
        }
        else assert(row.clubId === home || row.clubId === away, `${prefix}의 경기 선수 소속이 올바르지 않습니다.`);
        if (row.nationality !== undefined) text(row.nationality, `${prefix}.performer.nationality`);
        if (row.attributes !== undefined) attributes(row.attributes, `${prefix}.performer.attributes`);
        if (row.captain !== undefined) bool(row.captain, `${prefix}.performer.captain`);
        if (row.teamId !== undefined) assert(row.teamId === home || row.teamId === away, `${prefix}의 경기 선수 출전 팀이 올바르지 않습니다.`);
        const performerStats = stats(row.stats, `${prefix}.performer.stats`, match.metricsVersion === 2);
        const performerMinutes = number(row.minutes, `${prefix}.performer.minutes`, 0, 130, true);
        const performerRating = number(row.rating, `${prefix}.performer.rating`, 0, 10);
        const performerStarted = bool(row.started, `${prefix}.performer.started`);
        assert(performerStats.minutes === performerMinutes && performerStats.starts === Number(performerStarted) && performerStats.ratingSum === performerRating, `${prefix}의 경기 선수 집계가 일치하지 않습니다.`);
        if (row.id === playerId) for (const key of [...statKeys, ...DETAIL_STATS]) assert((performerStats[key] ?? 0) === (personal[key] ?? 0), `${prefix}의 개인 기록과 경기 선수 기록이 다릅니다.`);
      }
      if (match.momPlayerId !== undefined) {
        assert(performers.some(row => row.id === text(match.momPlayerId, `${prefix}.momPlayerId`)), `${prefix}의 MOM 선수가 경기 명단에 없습니다.`);
        if (match.metricsVersion === 2) {
          assert(personal.mom === Number(match.momPlayerId === playerId), `${prefix}의 개인 MOM 집계가 다릅니다.`);
          for (const row of performers) assert((row.stats as PlayerStats).mom === Number(match.momPlayerId === row.id), `${prefix}의 MOM 경기 선수 집계가 다릅니다.`);
        }
      }
    } else assert(match.momPlayerId === undefined, `${prefix}의 MOM 경기 명단이 없습니다.`);
    if (match.shootout !== undefined) {
      assert(national && homeGoals === awayGoals, `${prefix}의 승부차기 경기 범위·점수가 올바르지 않습니다.`);
      const shootout = object(match.shootout, `${prefix}.shootout`);
      const h = number(shootout.home, `${prefix}.shootout.home`, 0, 100, true), a = number(shootout.away, `${prefix}.shootout.away`, 0, 100, true);
      assert(h !== a && shootout.winnerId === (h > a ? home : away), `${prefix}의 승부차기 승자가 올바르지 않습니다.`);
      const attempts = list(shootout.attempts, `${prefix}.shootout.attempts`, 200).map(raw => object(raw, `${prefix}.shootout.attempt`));
      const shootoutPlayers = list(match.performers, `${prefix}.shootout.performers`, 64).map(raw => object(raw, `${prefix}.shootout.performer`));
      for (const attempt of attempts) {
        assert(attempt.teamId === home || attempt.teamId === away, `${prefix}의 승부차기 팀이 올바르지 않습니다.`);
        text(attempt.playerId, `${prefix}.shootout.playerId`); bool(attempt.scored, `${prefix}.shootout.scored`);
        const performer = shootoutPlayers.find(row => row.id === attempt.playerId);
        assert(performer, `${prefix}의 승부차기 선수가 경기 출전 명단에 없습니다.`);
        if (performer.teamId !== undefined) assert(performer.teamId === attempt.teamId, `${prefix}의 승부차기 선수 출전 팀이 다릅니다.`);
        const entered = performer.started ? 0 : events.find(event => event.type === 'substitution' && event.playerId === performer.id && String(event.detail).includes('투입'))?.minute;
        assert(entered !== undefined && Number(entered) + Number(performer.minutes) >= 90 && !(performer.stats as PlayerStats).redCards, `${prefix}의 승부차기 선수가 경기 종료 시점에 뛰고 있지 않습니다.`);
      }
      assert(attempts.filter(row => row.teamId === home && row.scored).length === h && attempts.filter(row => row.teamId === away && row.scored).length === a, `${prefix}의 승부차기 점수와 원장이 다릅니다.`);
    }
  }
  unique(ids, label);
  unique(fixtureIds, `${label} 경기 일정`);
  return records as MatchRecord[];
}

function reconciledStats(value: unknown, records: MatchRecord[], label: string): PlayerStats {
  const totals = stats(value, label);
  for (const key of statKeys) {
    const sum = records.reduce((total, match) => total + match.playerStats[key], 0);
    assert(Math.abs(totals[key] - sum) < 0.000001, `${label}.${key}가 경기 원장 합계와 다릅니다.`);
  }
  for (const key of DETAIL_STATS) if (totals[key] !== undefined) {
    const sum = records.reduce((total, match) => total + (match.playerStats[key] ?? 0), 0);
    assert(Math.abs(totals[key]! - sum) < 0.000001, `${label}.${key}가 경기 원장 합계와 다릅니다.`);
  }
  return totals;
}

function awards(value: unknown, label: string): void {
  const records = list(value, label, 10_000);
  const ids = records.map((raw, index) => {
    const item = object(raw, `${label}[${index}]`);
    const id = text(item.id, `${label}.id`);
    text(item.name, `${label}.name`);
    text(item.description, `${label}.description`, 4_000);
    clubId(item.clubId, `${label}.clubId`);
    number(item.year, `${label}.year`, 1900, 2500, true);
    for (const key of ['organiser', 'criterion', 'sourceUrl', 'category', 'ruleVersion', 'evaluationPeriod']) if (item[key] !== undefined) text(item[key], `${label}.${key}`, 4_000);
    if(item.verification!==undefined)choice(item.verification,['game-model'],`${label}.verification`);
    if (item.official !== undefined) bool(item.official, `${label}.official`);
    if (item.position !== undefined) assert(positions.has(String(item.position)), `${label}의 수상 포지션이 올바르지 않습니다.`);
    if (item.rank !== undefined) number(item.rank, `${label}.rank`, 1, 100_000, true);
    return id;
  });
  unique(ids, label);
}

function choice(value: unknown, allowed: readonly string[], label: string): string {
  const selected = text(value, label);
  assert(allowed.includes(selected), `${label} 값이 올바르지 않습니다.`);
  return selected;
}

function dictionary(value: unknown, label: string, maximum: number): [string, Record<string, unknown>][] {
  const entries = Object.entries(object(value, label));
  assert(entries.length <= maximum, `${label} 목록이 지나치게 큽니다.`);
  return entries.map(([id, item]) => [text(id, `${label}.key`), object(item, `${label}.${id}`)]);
}

/** Reconcile the simulated competition against its own fixtures, including promoted clubs. */
function competition(value: Record<string, unknown>, label: string, participants: string[]): void {
  const rounds = number(value.totalRounds, `${label}.totalRounds`, 1, 150, true);
  const round = number(value.round, `${label}.round`, 0, rounds, true);
  const fixtures = list(value.fixtures, `${label}.fixtures`, 10_000).map(raw => object(raw, `${label}.fixture`));
  unique(fixtures.map(row => text(row.id, `${label}.fixture.id`)), `${label}.fixtures`);
  unique(fixtures.map(row => `${row.homeId}|${row.awayId}`), `${label} 홈·원정 조합`);
  assert(fixtures.length === participants.length * (participants.length - 1), `${label}의 경기 일정이 누락되었습니다.`);
  const expected = new Map(participants.map(id => [id, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]));
  for (const row of fixtures) {
    const homeId = clubId(row.homeId, `${label}.fixture.homeId`), awayId = clubId(row.awayId, `${label}.fixture.awayId`);
    const home = expected.get(homeId), away = expected.get(awayId);
    assert(home && away && homeId !== awayId, `${label}의 리그·구단이 일치하지 않습니다.`);
    const fixtureRound = number(row.round, `${label}.fixture.round`, 1, rounds, true);
    assert(bool(row.played, `${label}.fixture.played`) === (fixtureRound <= round), `${label}의 경기 진행 주차가 일치하지 않습니다.`);
    if (!row.played) continue;
    const homeGoals = number(row.homeGoals, `${label}.fixture.homeGoals`, 0, 50, true), awayGoals = number(row.awayGoals, `${label}.fixture.awayGoals`, 0, 50, true);
    home.played++; away.played++;
    home.goalsFor += homeGoals; home.goalsAgainst += awayGoals; away.goalsFor += awayGoals; away.goalsAgainst += homeGoals;
    if (homeGoals === awayGoals) { home.drawn++; away.drawn++; home.points++; away.points++; }
    else { const winner = homeGoals > awayGoals ? home : away, loser = homeGoals > awayGoals ? away : home; winner.won++; winner.points += 3; loser.lost++; }
  }
  const rows = list(value.table, `${label}.table`, 128).map(raw => object(raw, `${label}.table.row`));
  const ids = rows.map(row => clubId(row.clubId, `${label}.table.clubId`));
  unique(ids, `${label}.table`);
  assert(ids.length === participants.length && ids.every(id => expected.has(id)), `${label}의 순위표 참가 구단이 일치하지 않습니다.`);
  for (const row of rows) for (const [key, amount] of Object.entries(expected.get(String(row.clubId))!)) assert(number(row[key], `${label}.table.${key}`, 0, 100_000, true) === amount, `${label}의 순위표와 경기 결과 합계가 다릅니다.`);
  const sorted = [...expected].sort(([aId, a], [bId, b]) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || aId.localeCompare(bId));
  assert(ids.every((id, index) => id === sorted[index][0]), `${label}의 순위표 정렬이 올바르지 않습니다.`);
}

function validateSystems(career: Record<string, unknown>, player: Record<string, unknown>, playerId: string): void {
  if (career.systems === undefined) return; // Keep original v1 payloads byte-for-byte equivalent for checksums.
  const systems = object(career.systems, 'systems');
  assert(systems.version === 2, '지원하지 않는 커리어 시스템 버전입니다.');
  choice(systems.phase, ['preseason', 'first', 'midseason', 'second', 'review', 'retired'], 'systems.phase');
  number(systems.halfRound, 'systems.halfRound', 0, 150, true);
  bool(systems.trainingLocked, 'systems.trainingLocked');
  if (systems.legacyMetrics !== undefined) bool(systems.legacyMetrics, 'systems.legacyMetrics');
  const currentSeason = object(career.season, 'season'), currentYear = Number(currentSeason.year), currentRound = Number(currentSeason.week);
  if (systems.growthLedger !== undefined) growthLedger(systems.growthLedger, player.attributes, currentRound, currentYear, 'systems.growthLedger', currentSeason.attributeStart);
  if (systems.agingReport !== undefined) agingReport(systems.agingReport, currentYear, 'systems.agingReport', currentSeason.attributeStart);
  if (systems.trainingPlan !== undefined) {
    const plan = object(systems.trainingPlan, 'systems.trainingPlan');
    const year = number(plan.forYear, 'trainingPlan.forYear', currentYear, currentYear + 1, true), confirmed = bool(plan.confirmed, 'trainingPlan.confirmed');
    const atRound = number(plan.confirmedAtRound, 'trainingPlan.confirmedAtRound', 0, 150, true);
    const source = choice(plan.source, ['creation', 'offseason', 'legacy'], 'trainingPlan.source');
    assert(source !== 'creation' || atRound === 0, '최초 훈련 계획의 확정 주차가 올바르지 않습니다.');
    if (career.stage === 'season') assert(year === currentYear && confirmed && atRound <= currentRound, '진행 중인 시즌의 훈련 계획이 확정되지 않았습니다.');
    if (career.stage === 'offseason') assert(year === currentYear + 1, '다음 시즌 훈련 계획의 연도가 다릅니다.');
  }
  const world = object(systems.world, 'systems.world');
  number(world.year, 'world.year', 1900, 2500, true);
  const worldClubs = new Map(dictionary(world.clubs, 'world.clubs', CLUBS.length));
  assert(worldClubs.size === CLUBS.length, '월드의 구단 정보가 누락되었습니다.');
  const worldPlayers = new Map(dictionary(world.players, 'world.players', 100_000));
  const rosterOwner = new Map<string, string>();
  for (const [id, row] of worldClubs) {
    assert(clubId(row.id, 'world.club.id') === id, '월드 구단 ID와 키가 다릅니다.');
    leagueId(row.leagueId, 'world.club.leagueId');
    number(row.power, 'world.club.power', 1, 100); number(row.depth, 'world.club.depth', 0, 100);
    number(row.averageAge, 'world.club.averageAge', 14, 100); number(row.injuryImpact, 'world.club.injuryImpact', 0, 100);
    for (const key of ['budget', 'wageBudget', 'revenue']) number(row[key], `world.club.${key}`, 0, 1e15);
    const roster = list(row.rosterIds, 'world.club.rosterIds', 500).map(raw => text(raw, 'world.club.rosterId'));
    unique(roster, '월드 구단 선수 명단');
    for (const rosterId of roster) { assert(!rosterOwner.has(rosterId) && worldPlayers.has(rosterId), '월드 선수 명단의 소속·참조가 올바르지 않습니다.'); rosterOwner.set(rosterId, id); }
    for (const change of list(row.changes, 'world.club.changes', 1_000)) text(change, 'world.club.change', 4_000);
  }
  for (const [id, row] of worldPlayers) {
    assert(text(row.id, 'world.player.id') === id, '월드 선수 ID와 키가 다릅니다.');
    const owner = clubId(row.clubId, 'world.player.clubId');
    assert(rosterOwner.get(id) === owner, '월드 선수의 구단 명단과 소속이 다릅니다.');
    text(row.name, 'world.player.name'); text(row.nationality, 'world.player.nationality');
    assert(positions.has(String(row.position)), '월드 선수 포지션이 올바르지 않습니다.');
    number(row.age, 'world.player.age', 14, 100); number(row.ovr, 'world.player.ovr', 1, 100); number(row.potential, 'world.player.potential', 1, 100);
    number(row.injuryWeeks, 'world.player.injuryWeeks', 0, 104, true); number(row.leadership, 'world.player.leadership', 0, 100);
  }
  const competitions = dictionary(world.competitions, 'world.competitions', LEAGUES.length);
  assert([...new Set([...worldClubs.values()].map(row => row.leagueId))].every(id => competitions.some(([key]) => key === id)), '월드의 리그 대회가 누락되었습니다.');
  for (const [id, row] of competitions) {
    assert(leagueId(row.leagueId, 'world.competition.leagueId') === id, '월드 대회 ID와 키가 다릅니다.');
    competition(row, `world.competitions.${id}`, [...worldClubs].filter(([, club]) => club.leagueId === id).map(([club]) => club));
  }
  for (const [id, row] of dictionary(world.playerStats, 'world.playerStats', 100_000)) {
    assert(text(row.playerId, 'world.stats.playerId') === id && (id === playerId || worldPlayers.has(id) || temporaryReserve(id, row)), '월드 선수 기록 참조가 올바르지 않습니다.');
    text(row.name, 'world.stats.name'); clubId(row.clubId, 'world.stats.clubId'); leagueId(row.leagueId, 'world.stats.leagueId');
    assert(positions.has(String(row.position)), '월드 선수 기록 포지션이 올바르지 않습니다.');
    text(row.nationality, 'world.stats.nationality'); number(row.ovr, 'world.stats.ovr', 1, 100); stats(row.stats, 'world.stats.stats');
    if (row.rank !== undefined) number(row.rank, 'world.stats.rank', 1, 128, true);
    if (row.nationalStats !== undefined) stats(row.nationalStats, 'world.stats.nationalStats');
  }
  for (const raw of list(world.movements, 'world.movements', 100_000)) {
    const row = object(raw, 'world.movement'); number(row.year, 'world.movement.year', 1900, 2500, true); clubId(row.clubId, 'world.movement.clubId');
    assert(leagueId(row.fromLeagueId, 'world.movement.fromLeagueId') !== leagueId(row.toLeagueId, 'world.movement.toLeagueId'), '승강 이동 전후 리그가 같습니다.');
    choice(row.kind, ['promotion', 'relegation'], 'world.movement.kind'); text(row.reason, 'world.movement.reason', 4_000);
  }
  const national = object(systems.national, 'systems.national');
  text(national.country, 'national.country'); choice(national.squad, ['U20', 'senior'], 'national.squad');
  choice(national.status, ['unselected', 'watchlist', 'called', 'injured', 'retired'], 'national.status'); text(national.reason, 'national.reason', 4_000);
  for (const key of ['competitionId', 'competitionName']) text(national[key], `national.${key}`);
  choice(national.phase, ['friendlies', 'qualifying', 'finals', 'eliminated'], 'national.phase');
  number(national.points, 'national.points', 0, 1_000, true); number(national.rank, 'national.rank', 0, 1_000, true);
  bool(national.qualified, 'national.qualified'); number(national.fatigue, 'national.fatigue', 0, 100); number(national.reputation, 'national.reputation', 0, 100);
  const nationalMatches = matches(national.matches, 'national.matches', playerId, true);
  // Other countries' qualifiers and finals are a career-long ledger, unlike
  // the player's current-season match list. Keep every per-match invariant.
  if (national.teamResults !== undefined) matches(national.teamResults, 'national.teamResults', playerId, true, 10_000);
  assert(nationalMatches.every(row => row.playerClubId.startsWith(`NAT:${national.country}:`)), '국가대표 경기와 선수 국적이 다릅니다.');
  const processedWindows = list(national.processedWindows, 'national.processedWindows', 10_000).map(raw => text(raw, 'national.processedWindow'));
  unique(processedWindows, '국가대표 소집 기간');
  if (national.timingVersion !== undefined) assert(national.timingVersion === 1, '지원하지 않는 국가대표 일정 버전입니다.');
  if (national.processedThrough !== undefined) {
    const through = date(national.processedThrough, 'national.processedThrough');
    assert(new Date(through).toISOString() === through, '국가대표 처리 시각이 정규 UTC 날짜가 아닙니다.');
  }
  if (national.timingVersion === 1) for (const key of processedWindows) {
    assert(/^(?:19\d{2}|2[0-4]\d{2}|2500):(first|second)$/.test(key) || /^(window|callup):(?:19\d{2}|2[0-4]\d{2}|2500)-(06|11):(U20|senior)$/.test(key), '국가대표 소집 기간 키가 올바르지 않습니다.');
    if (national.processedThrough !== undefined && /^(window|callup):/.test(key)) assert(key.split(':')[1] <= String(national.processedThrough).slice(0, 7), '국가대표 소집이 처리 시각보다 미래입니다.');
  }
  const nationalHistory = list(national.history, 'national.history', 200).map(raw => object(raw, 'national.history.item'));
  unique(nationalHistory.map(row => `${row.year}:${row.squad}:${row.competitionId}`), '국가대표 시즌 기록');
  for (const row of nationalHistory) {
    number(row.year, 'national.history.year', 1900, 2500, true); choice(row.squad, ['U20', 'senior'], 'national.history.squad');
    text(row.competitionId, 'national.history.competitionId'); text(row.competitionName, 'national.history.competitionName'); text(row.result, 'national.history.result', 4_000); bool(row.qualified, 'national.history.qualified');
    reconciledStats(row.stats, matches(row.matches, 'national.history.matches', playerId, true), 'national.history.stats');
  }
  const economy = object(systems.economics, 'systems.economics');
  for (const key of ['marketValue', 'previousValue', 'peakValue', 'salaryIncome', 'bonusIncome', 'totalTransferFees', 'highestWage']) number(economy[key], `economics.${key}`, 0, 1e15);
  assert(Number(economy.peakValue) >= Number(economy.marketValue), '최고 몸값이 현재 몸값보다 작습니다.');
  assert(Math.abs(Number(economy.salaryIncome) + Number(economy.bonusIncome) - Number(career.careerIncome)) < 0.01, '급여·보너스와 커리어 수입 합계가 다릅니다.');
  const transferFees = (career.transfers as Record<string, unknown>[]).reduce((total, row) => total + Number(row.fee), 0);
  assert(Math.abs(transferFees - Number(economy.totalTransferFees)) < 0.01, '이적료 합계와 이적 원장이 다릅니다.');
  const contract = object(economy.contract, 'economics.contract');
  const signed = number(contract.signedYear, 'contract.signedYear', 1900, 2500, true), expires = number(contract.expiresYear, 'contract.expiresYear', signed, 2520, true);
  assert(expires >= signed, '계약 기간이 올바르지 않습니다.'); number(contract.wageAtSigning, 'contract.wageAtSigning', 0, 1e12); text(contract.role, 'contract.role');
  if (contract.previousWage !== undefined) number(contract.previousWage, 'contract.previousWage', 0, 1e12);
  if (contract.signedDate !== undefined) calendarDate(contract.signedDate, 'contract.signedDate');
  if (contract.expiresDate !== undefined) calendarDate(contract.expiresDate, 'contract.expiresDate');
  if (contract.signedDate !== undefined && contract.expiresDate !== undefined) assert(String(contract.signedDate) <= String(contract.expiresDate), '계약 만료일이 서명일보다 빠릅니다.');
  assert(clubId(contract.clubId, 'contract.clubId') === player.clubId && contract.wageAtSigning === player.wage, '계약 소속·주급과 선수 정보가 다릅니다.');
  assert(Number(economy.highestWage) >= Number(player.wage), '최고 주급이 현재 주급보다 작습니다.');
  if (economy.seasonStartValue !== undefined || economy.seasonStartYear !== undefined) {
    number(economy.seasonStartValue, 'economics.seasonStartValue', 0, Number(economy.peakValue));
    assert(number(economy.seasonStartYear, 'economics.seasonStartYear', 1900, 2500, true) === currentYear, '시즌 시작 몸값의 연도가 다릅니다.');
  }
  if (economy.contractHistory !== undefined) {
    const history = list(economy.contractHistory, 'economics.contractHistory', 1_000).map(raw => object(raw, 'contractHistory.item'));
    assert(history.length > 0, '계약 이력이 비어 있습니다.');
    unique(history.map(row => text(row.id, 'contractHistory.id')), '계약 이력');
    let previousTerms: Record<string, unknown> | undefined, previousYear = 0, previousRound = 0;
    const matchedTransfers = new Set<number>();
    for (const row of history) {
      const year = number(row.year, 'contractHistory.year', 1900, currentYear, true), round = number(row.round, 'contractHistory.round', 0, 150, true);
      assert(year > previousYear || year === previousYear && round >= previousRound, '계약 이력이 시간 순서와 다릅니다.');
      assert(year < currentYear || round <= currentRound, '계약 이력의 결정 주차가 미래입니다.');
      previousYear = year; previousRound = round;
      const type = choice(row.type, ['initial', 'renew', 'transfer', 'legacy'], 'contractHistory.type'), effective = choice(row.effective, ['now', 'nextSeason'], 'contractHistory.effective');
      text(row.reason, 'contractHistory.reason', 4_000); const fee = number(row.fee, 'contractHistory.fee', 0, 1e15);
      const terms = contractTerms(row.current, 'contractHistory.current');
      if (type === 'initial' || type === 'legacy') {
        assert(previousTerms === undefined && row.previous === undefined && fee === 0, '최초·기존 계약 기준 기록에 이전 계약이나 이적료가 있습니다.');
        if (type === 'initial') assert(round === 0 && terms.signedYear === year && effective === 'now' && Number(terms.years) >= 1 && Number(terms.years) <= 5, '최초 계약의 효력 시점 또는 기간이 올바르지 않습니다.');
      }
      else {
        assert(previousTerms !== undefined && row.previous !== undefined, '계약 변경에 이전 계약이 없습니다.');
        const previous = contractTerms(row.previous, 'contractHistory.previous');
        assert(matchingTerms(previous, previousTerms), '계약 이력의 이전 조건이 앞선 계약과 다릅니다.');
        assert(terms.signedYear === year + Number(effective === 'nextSeason'), '계약 효력 연도와 서명 이력이 다릅니다.');
        assert(Number(terms.years) >= 1 && Number(terms.years) <= 5, '새 계약 기간은 1~5년이어야 합니다.');
        if (type === 'renew') assert(previous.clubId === terms.clubId && fee === 0, '재계약의 구단 또는 이적료가 올바르지 않습니다.');
        else {
          assert(previous.clubId !== terms.clubId, '이적 계약의 이전·현재 구단이 같습니다.');
          const transfers = career.transfers as Record<string, unknown>[];
          const index = transfers.findIndex((transfer, index) => !matchedTransfers.has(index) && transfer.year === terms.signedYear && transfer.fromClubId === previous.clubId && transfer.toClubId === terms.clubId && transfer.fee === fee && transfer.wage === terms.wage);
          assert(index >= 0, '이적 계약과 구단 간 이적 원장이 다릅니다.'); matchedTransfers.add(index);
        }
      }
      previousTerms = terms;
    }
    const last = history[history.length - 1], actual = { ...contract, wage: contract.wageAtSigning, years: expires - signed };
    assert(matchingTerms(previousTerms!, actual), '최종 계약 이력과 현재 계약이 다릅니다.');
    if (last.previous !== undefined) assert(contract.previousWage === (last.previous as Record<string, unknown>).wage, '현재 계약의 이전 주급과 계약 이력이 다릅니다.');
  }
  for (const raw of list(economy.valueHistory, 'economics.valueHistory', 100_000)) { const row = object(raw, 'economics.valuePoint'); number(row.year, 'valuePoint.year', 1900, 2500, true); number(row.round, 'valuePoint.round', 0, 150, true); number(row.value, 'valuePoint.value', 0, 1e15); text(row.reason, 'valuePoint.reason', 4_000); }
  const leadership = object(systems.leadership, 'systems.leadership');
  if (leadership.baseTrait !== undefined) number(leadership.baseTrait, 'leadership.baseTrait', 0, 100);
  if (leadership.traitUpdatedYear !== undefined) number(leadership.traitUpdatedYear, 'leadership.traitUpdatedYear', 1900, 2500, true);
  number(leadership.trait, 'leadership.trait', 0, 100); number(leadership.clubSinceYear, 'leadership.clubSinceYear', 1900, 2500, true);
  assert(clubId(leadership.clubId, 'leadership.clubId') === player.clubId, '주장단 소속과 선수 소속이 다릅니다.');
  for (const key of ['clubRole', 'nationalRole']) choice(leadership[key], ['none', 'captain', 'vice'], `leadership.${key}`);
  for (const key of ['clubMatches', 'nationalMatches']) number(leadership[key], `leadership.${key}`, 0, 100_000, true);
  text(leadership.reason, 'leadership.reason', 4_000);
  if(leadership.offers!==undefined){
    const offers=list(leadership.offers,'leadership.offers',10_000).map(raw=>object(raw,'captainOffer'));
    unique(offers.map(row=>text(row.id,'captainOffer.id')),'주장 제의');
    for(const row of offers){
      const scope=choice(row.scope,['club','national'],'captainOffer.scope');teamId(row.teamId,'captainOffer.teamId',scope==='national');
      const role=choice(row.role,['captain','vice'],'captainOffer.role'),year=number(row.year,'captainOffer.year',1900,currentYear,true);
      number(row.round,'captainOffer.round',0,150,true);text(row.reason,'captainOffer.reason',8000);
      const status=choice(row.status,['pending','accepted','declined','expired'],'captainOffer.status');
      if(row.answeredYear!==undefined)number(row.answeredYear,'captainOffer.answeredYear',year,currentYear,true);
      if(row.answeredRound!==undefined)number(row.answeredRound,'captainOffer.answeredRound',0,150,true);
      assert(status==='pending'?(row.answeredYear===undefined&&row.answeredRound===undefined):row.answeredYear!==undefined&&row.answeredRound!==undefined,'주장 제의 응답 시점이 올바르지 않습니다.');
      assert(status!=='pending'||career.stage!=='retired','은퇴한 선수의 주장 제의가 아직 열려 있습니다.');
      const a=object(row.assessment,'captainOffer.assessment');
      assert(a.scope===scope&&a.teamId===row.teamId&&a.eligibleRole===role,'주장 제의와 평가 대상·역할이 다릅니다.');
      for(const key of ['teamPower','squadOvr','playerOvr'])number(a[key],`captainAssessment.${key}`,1,100);
      for(const key of ['leadership','trust'])number(a[key],`captainAssessment.${key}`,0,100);
      number(a.age,'captainAssessment.age',14,100,true);number(a.tenure,'captainAssessment.tenure',0,200,true);
      for(const key of ['abilityRank','candidateRank'])number(a[key],`captainAssessment.${key}`,1,100_000,true);
      for(const key of ['apps','recentApps','recentMinutes'])number(a[key],`captainAssessment.${key}`,0,10_000_000,true);
      assert(Number(a.recentApps)<=Number(a.apps)&&Number(a.recentMinutes)<=Number(a.recentApps)*90,'주장 평가의 최근 출전 기록이 올바르지 않습니다.');
      number(a.rating,'captainAssessment.rating',0,10);number(a.score,'captainAssessment.score',0,200);
      for(const reason of list(a.reasons,'captainAssessment.reasons',50))text(reason,'captainAssessment.reason',4000);
      if(status==='accepted')assert((leadership.terms as Record<string,unknown>[]).some(t=>t.scope===scope&&t.teamId===row.teamId&&t.role===role&&t.startYear===row.answeredYear),'수락한 주장 제의의 임기 기록이 없습니다.');
    }
  }
  for (const raw of list(leadership.terms, 'leadership.terms', 10_000)) {
    const row = object(raw, 'leadership.term'); const scope = choice(row.scope, ['club', 'national'], 'term.scope'); teamId(row.teamId, 'term.teamId', scope === 'national');
    choice(row.role, ['captain', 'vice', 'match'], 'term.role'); const start = number(row.startYear, 'term.startYear', 1900, 2500, true);
    if (row.endYear !== undefined) number(row.endYear, 'term.endYear', start, 2500, true);
    for (const key of ['startRound', 'endRound']) if (row[key] !== undefined) number(row[key], `term.${key}`, 0, 150, true);
    number(row.apps, 'term.apps', 0, 100_000, true); text(row.reason, 'term.reason', 4_000);
  }
  function rankingCandidate(raw: unknown, historical: boolean): Record<string, unknown> {
    const row = object(raw, 'ranking.candidate'); const id = text(row.playerId, 'ranking.playerId');
    // A completed year's ranking is a self-contained snapshot. Retired competitors
    // leave the live world roster, while their name, club and season statistics remain here.
    assert(historical || id === playerId || worldPlayers.has(id) || temporaryReserve(id, row), '수상 후보 선수 참조가 올바르지 않습니다.');
    text(row.name, 'ranking.name'); clubId(row.clubId, 'ranking.clubId'); assert(positions.has(String(row.position)), '수상 후보 포지션이 올바르지 않습니다.');
    number(row.score, 'ranking.score', 0, 1e12); number(row.rank, 'ranking.rank', 1, 100_000, true); stats(row.stats, 'ranking.stats'); stats(row.nationalStats, 'ranking.nationalStats'); return row;
  }
  const rankings = list(systems.rankings, 'systems.rankings', 200).map(raw => object(raw, 'ranking'));
  unique(rankings.map(row => String(number(row.year, 'ranking.year', 1900, 2500, true))), '연도별 수상 순위');
  for (const row of rankings) {
    const rankingYear = number(row.year, 'ranking.year', 1900, Number(world.year), true);
    const historical = rankingYear < Number(world.year);
    const candidates = list(row.candidates, 'ranking.candidates', 30).map(raw => rankingCandidate(raw, historical)); unique(candidates.map(item => String(item.playerId)), '발롱도르 후보');
    assert(candidates.every((candidate, index) => candidate.rank === index + 1 && (index === 0 || Number(candidates[index - 1].score) >= Number(candidate.score))), '발롱도르 후보 순위와 점수가 일치하지 않습니다.');
    if (row.playerRank !== null) {
      number(row.playerRank, 'ranking.playerRank', 1, 30, true);
      assert(candidates.some(item => item.playerId === playerId && item.rank === row.playerRank), '선수의 발롱도르 순위와 후보가 일치하지 않습니다.');
    } else assert(!candidates.some(item => item.playerId === playerId), '발롱도르 후보인 선수의 순위가 누락되었습니다.');
    assert(candidates.length > 0 && candidates[0].playerId === text(row.winnerId, 'ranking.winnerId'), '발롱도르 수상자가 후보 1위와 다릅니다.');
    const world11 = list(row.world11, 'ranking.world11', 11).map(raw => rankingCandidate(raw, historical)); unique(world11.map(item => String(item.playerId)), '월드 베스트11'); awards(row.awards, 'ranking.awards');
  }
  for (const raw of list(systems.growthReports, 'systems.growthReports', 400)) {
    const row = object(raw, 'growthReport'); number(row.year, 'growthReport.year', 1900, 2500, true); choice(row.half, ['first', 'season'], 'growthReport.half');
    const from = number(row.fromRound, 'growthReport.fromRound', 0, 150, true); number(row.toRound, 'growthReport.toRound', from, 150, true);
    attributes(row.startAttributes, 'growthReport.startAttributes'); attributes(row.endAttributes, 'growthReport.endAttributes');
    number(row.ovrStart, 'growthReport.ovrStart', 1, 100); number(row.ovrEnd, 'growthReport.ovrEnd', 1, 100); stats(row.stats, 'growthReport.stats'); stats(row.previousStats, 'growthReport.previousStats');
    number(row.valueStart, 'growthReport.valueStart', 0, 1e15); number(row.valueEnd, 'growthReport.valueEnd', 0, 1e15); text(row.context, 'growthReport.context', 8_000);
    if (row.growth !== undefined) growthLedger(row.growth, row.endAttributes, Number(row.toRound), Number(row.year), 'growthReport.growth', row.startAttributes);
    if (row.offseasonAging !== undefined) agingReport(row.offseasonAging, Number(row.year), 'growthReport.offseasonAging', row.startAttributes);
  }
  if (systems.firstHalfSnapshot !== undefined) { const row = object(systems.firstHalfSnapshot, 'systems.firstHalfSnapshot'); attributes(row.attributes, 'snapshot.attributes'); stats(row.stats, 'snapshot.stats'); number(row.ovr, 'snapshot.ovr', 1, 100); number(row.value, 'snapshot.value', 0, 1e15); number(row.round, 'snapshot.round', 0, 150, true); }
  if (systems.pendingChoice !== undefined) {
    const row = object(systems.pendingChoice, 'systems.pendingChoice'); choice(row.kind, ['renewal', 'transfer'], 'pendingChoice.kind');
    const offerIds = list(row.offerIds, 'pendingChoice.offerIds', 50).map(raw => text(raw, 'pendingChoice.offerId')); unique(offerIds, '계약 선택 제안');
    const offers = career.offers as Record<string, unknown>[]; assert(offerIds.every(id => offers.some(offer => offer.id === id)), '계약 선택이 만료되거나 없는 제안을 참조합니다.');
    number(row.deadlineRound, 'pendingChoice.deadlineRound', 0, 150, true); text(row.reason, 'pendingChoice.reason', 4_000);
  }
  const events = list(systems.events, 'systems.events', 10_000).map(raw => object(raw, 'presentationEvent'));
  unique(events.map(row => text(row.id, 'presentationEvent.id')), '프레젠테이션 이벤트');
  for (const row of events) { number(row.year, 'event.year', 1900, 2500, true); number(row.round, 'event.round', 0, 150, true); choice(row.type, ['mom', 'injury', 'national', 'transfer', 'renewal', 'captain', 'award', 'growth', 'promotion', 'retirement'], 'event.type'); text(row.title, 'event.title', 500); text(row.body, 'event.body', 8_000); choice(row.importance, ['brief', 'decision', 'milestone'], 'event.importance'); }
}

/** Validate a complete, isolated JSON copy before replacing any live game state. */
export function validateCareer(value: unknown): Career {
  const parsed: unknown = JSON.parse(stringify(value));
  ensureSafeJSON(parsed);
  const career = object(parsed, 'career');
  assert(career.schemaVersion === 1, '지원하지 않는 저장 버전입니다. 게임을 업데이트하거나 이전 백업을 사용하세요.');
  text(career.id, 'career.id');
  text(career.seed, 'career.seed', 500);
  number(career.revision, 'career.revision', 0, 100_000_000, true);
  date(career.createdAt, 'career.createdAt');
  date(career.updatedAt, 'career.updatedAt');
  assert(['season', 'offseason', 'retired'].includes(String(career.stage)), '진행 단계가 올바르지 않습니다.');
  assert(['realistic', 'challenge', 'free'].includes(String(career.difficulty)), '난이도가 올바르지 않습니다.');
  assert(['balanced', 'intense', 'rest'].includes(String(career.intensity)), '훈련 강도가 올바르지 않습니다.');
  number(career.managerTrust, 'managerTrust', 0, 100);
  number(career.careerIncome, 'careerIncome', 0, 1e15);
  if (career.retiredYear !== undefined) number(career.retiredYear, 'retiredYear', 1900, 2500, true);
  if (career.lastMatchId !== undefined) text(career.lastMatchId, 'lastMatchId');
  if (career.transferDecision !== undefined) assert(['stay', 'signed'].includes(String(career.transferDecision)), '계약 결정이 올바르지 않습니다.');
  unique(list(career.processedCommands, 'processedCommands', 100_000).map(id => text(id, 'command.id')), 'processedCommands');

  const player = object(career.player, 'player');
  const playerId = text(player.id, 'player.id');
  text(player.name, 'player.name', 60);
  text(player.nationality, 'player.nationality', 100);
  assert(positions.has(text(player.position, 'player.position')), '포지션이 올바르지 않습니다.');
  assert(['SSS', 'SS', 'S', 'A', 'B', 'C', 'D'].includes(String(player.talent)), '재능 등급이 올바르지 않습니다.');
  assert(['right', 'left', 'both'].includes(String(player.foot)), '주발이 올바르지 않습니다.');
  assert(['youth', 'senior'].includes(String(player.squad)), '소속 단계가 올바르지 않습니다.');
  text(player.style, 'player.style');
  clubId(player.clubId, 'player.clubId');
  number(player.age, 'player.age', 14, 100, true);
  number(player.height, 'player.height', 150, 210);
  number(player.weight, 'player.weight', 45, 120);
  number(player.ovr, 'player.ovr', 1, 100);
  number(player.potential, 'player.potential', 1, 100);
  number(player.fitness, 'player.fitness', 0, 100);
  number(player.morale, 'player.morale', 0, 100);
  number(player.form, 'player.form', 0, 100);
  number(player.injuryWeeks, 'player.injuryWeeks', 0, 104, true);
  number(player.wage, 'player.wage', 0, 1e12);
  number(player.contractYears, 'player.contractYears', 0, 20, true);
  attributes(player.attributes, 'player.attributes', player.position === 'GK' ? keeperAttributes : fieldAttributes);
  const secondaries = list(player.secondaryPositions, 'player.secondaryPositions', 2).map(item => text(item, 'secondaryPosition'));
  assert(secondaries.every(position => positions.has(position) && position !== player.position), '부 포지션이 올바르지 않습니다.');
  unique(secondaries, '부 포지션');
  const training = list(career.training, 'training', 3).map(item => text(item, 'training.attribute'));
  unique(training, '훈련 능력치');
  assert(training.every(key => (player.position === 'GK' ? keeperAttributes : fieldAttributes).includes(key)), '훈련 능력치가 포지션과 맞지 않습니다.');

  const season = object(career.season, 'season');
  const seasonYear = number(season.year, 'season.year', 1900, 2500, true);
  if (season.calendarYear !== undefined) number(season.calendarYear, 'season.calendarYear', seasonYear, 2500, true);
  number(season.index, 'season.index', 0, 200, true);
  const totalWeeks = number(season.totalWeeks, 'season.totalWeeks', 1, 150, true);
  const week = number(season.week, 'season.week', 0, totalWeeks, true);
  const currentLeague = leagueId(season.leagueId, 'season.leagueId');
  const activeMembership = new Map(CLUBS.map(club => [club.id, club.leagueId]));
  if (career.systems !== undefined) {
    const systems = object(career.systems, 'systems');
    assert(systems.version === 2, '지원하지 않는 커리어 시스템 버전입니다.');
    const world = object(systems.world, 'systems.world');
    assert(world.year === season.year, '현재 시즌과 월드의 연도가 다릅니다.');
    for (const [id, row] of dictionary(world.clubs, 'world.clubs', CLUBS.length)) {
      assert(clubId(row.id, 'world.club.id') === id, '월드 구단 ID와 키가 다릅니다.');
      activeMembership.set(id, leagueId(row.leagueId, 'world.club.leagueId'));
    }
  }
  text(season.competitionName, 'season.competitionName');
  number(season.ovrStart, 'season.ovrStart', 1, 100);
  attributes(season.attributeStart, 'season.attributeStart');
  const completed = bool(season.completed, 'season.completed');
  assert(completed === (week === totalWeeks), '시즌 완료 상태와 진행 주차가 일치하지 않습니다.');
  assert(career.stage !== 'season' || !completed, '끝난 시즌을 경기 진행 단계로 불러올 수 없습니다.');
  assert(career.stage !== 'offseason' || completed, '시즌이 끝나기 전에 이적시장을 열 수 없습니다.');
  const fixtures = list(season.fixtures, 'season.fixtures', 10_000).map((raw, index) => {
    const fixture = object(raw, `fixture[${index}]`);
    text(fixture.id, 'fixture.id');
    number(fixture.round, 'fixture.round', 1, totalWeeks, true);
    const home = clubId(fixture.homeId, 'fixture.homeId');
    const away = clubId(fixture.awayId, 'fixture.awayId');
    assert(home !== away && activeMembership.get(home) === currentLeague && activeMembership.get(away) === currentLeague, '경기 일정의 리그·구단이 일치하지 않습니다.');
    bool(fixture.played, 'fixture.played');
    assert(fixture.played === (Number(fixture.round) <= week), '경기 일정의 진행 주차가 일치하지 않습니다.');
    if (fixture.played) {
      number(fixture.homeGoals, 'fixture.homeGoals', 0, 50, true);
      number(fixture.awayGoals, 'fixture.awayGoals', 0, 50, true);
    }
    return fixture;
  });
  unique(fixtures.map(fixture => String(fixture.id)), '경기 일정');
  unique(fixtures.map(fixture => `${fixture.homeId}|${fixture.awayId}`), '홈·원정 경기 조합');
  const leagueClubs = [...activeMembership].filter(([, league]) => league === currentLeague).map(([id]) => id);
  assert(fixtures.length === leagueClubs.length * (leagueClubs.length - 1), '리그의 홈·원정 경기 일정이 누락되었습니다.');
  const fixtureIndex = new Map(fixtures.map(fixture => [fixture.id, fixture]));
  const records = matches(season.matches, 'season.matches', playerId);
  for (const record of records) {
    const fixture = fixtureIndex.get(record.fixtureId);
    assert(fixture?.played && fixture.homeId === record.homeId && fixture.awayId === record.awayId && fixture.homeGoals === record.homeGoals && fixture.awayGoals === record.awayGoals, '경기 원장과 일정의 결과가 일치하지 않습니다.');
  }
  reconciledStats(season.playerStats, records, 'season.playerStats');

  const table = list(season.table, 'season.table', 128).map((row, index) => object(row, `table[${index}]`));
  const tableIds = table.map(row => clubId(row.clubId, 'table.clubId'));
  unique(tableIds, '리그 순위표');
  assert(tableIds.length === leagueClubs.length && tableIds.every(id => leagueClubs.includes(id)), '리그 순위표의 참가 구단이 일치하지 않습니다.');
  const calculated = new Map(tableIds.map(id => [id, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]));
  for (const fixture of fixtures) {
    const home = calculated.get(String(fixture.homeId));
    const away = calculated.get(String(fixture.awayId));
    assert(home && away, '순위표에 경기 참가 구단이 없습니다.');
    if (!fixture.played) continue;
    const homeGoals = Number(fixture.homeGoals), awayGoals = Number(fixture.awayGoals);
    home.played++; away.played++;
    home.goalsFor += homeGoals; home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals; away.goalsAgainst += homeGoals;
    if (homeGoals === awayGoals) { home.drawn++; away.drawn++; home.points++; away.points++; }
    else {
      const winner = homeGoals > awayGoals ? home : away;
      const loser = homeGoals > awayGoals ? away : home;
      winner.won++; winner.points += 3; loser.lost++;
    }
  }
  for (const row of table) {
    const expected = calculated.get(String(row.clubId))!;
    for (const [key, amount] of Object.entries(expected)) assert(number(row[key], `table.${key}`, 0, 100_000, true) === amount, '리그 순위표가 경기 결과 합계와 다릅니다.');
  }
  const sortedTable = [...calculated].sort(([aId, a], [bId, b]) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || aId.localeCompare(bId));
  assert(tableIds.every((id, index) => id === sortedTable[index][0]), '리그 순위표의 정렬이 경기 결과와 다릅니다.');

  const history = list(career.history, 'history', 200).map((raw, index) => object(raw, `history[${index}]`));
  const historyYears: string[] = [];
  for (const [index, summary] of history.entries()) {
    const prefix = `history[${index}]`;
    const summaryYear = number(summary.year, `${prefix}.year`, 1900, 2500, true);
    historyYears.push(String(summaryYear));
    if (summary.calendarYear !== undefined) number(summary.calendarYear, `${prefix}.calendarYear`, summaryYear, 2500, true);
    clubId(summary.clubId, `${prefix}.clubId`);
    leagueId(summary.leagueId, `${prefix}.leagueId`);
    text(summary.clubName, `${prefix}.clubName`);
    text(summary.competitionName, `${prefix}.competitionName`);
    number(summary.age, `${prefix}.age`, 14, 100, true);
    number(summary.rank, `${prefix}.rank`, 1, 128, true);
    number(summary.ovrStart, `${prefix}.ovrStart`, 1, 100);
    number(summary.ovrEnd, `${prefix}.ovrEnd`, 1, 100);
    number(summary.income, `${prefix}.income`, 0, 1e15);
    assert(positions.has(String(summary.position)) && ['youth', 'senior'].includes(String(summary.squad)), `${prefix}의 포지션·소속 단계가 올바르지 않습니다.`);
    bool(summary.completed, `${prefix}.completed`);
    attributes(summary.attributeGrowth, `${prefix}.attributeGrowth`, undefined, -100);
    const ledger = matches(summary.matches, `${prefix}.matches`, playerId);
    reconciledStats(summary.stats, ledger, `${prefix}.stats`);
    awards(summary.awards, `${prefix}.awards`);
  }
  unique(historyYears, '시즌 기록');
  awards(career.awards, 'awards');

  const news = list(career.news, 'news', 10_000).map((raw, index) => object(raw, `news[${index}]`));
  for (const item of news) {
    text(item.id, 'news.id');
    number(item.week, 'news.week', 0, 150, true);
    number(item.year, 'news.year', 1900, 2500, true);
    assert(['match', 'training', 'transfer', 'injury', 'award', 'career'].includes(String(item.kind)), '소식 종류가 올바르지 않습니다.');
    text(item.title, 'news.title', 500);
    text(item.body, 'news.body', 8_000);
  }
  unique(news.map(item => String(item.id)), '커리어 소식');
  const offers = list(career.offers, 'offers', 50).map((raw, index) => object(raw, `offers[${index}]`));
  for (const item of offers) {
    text(item.id, 'offer.id');
    clubId(item.clubId, 'offer.clubId');
    number(item.wage, 'offer.wage', 0, 1e12);
    number(item.years, 'offer.years', 1, 20, true);
    number(item.fee, 'offer.fee', 0, 1e12);
    text(item.role, 'offer.role');
    text(item.reason, 'offer.reason', 4_000);
    assert(['transfer', 'renew'].includes(String(item.type)), '계약 제안 종류가 올바르지 않습니다.');
    if (item.expiresRound !== undefined) number(item.expiresRound, 'offer.expiresRound', 0, 150, true);
    if (item.effective !== undefined) choice(item.effective, ['now', 'nextSeason'], 'offer.effective');
    for (const key of ['currentWage', 'budgetLimit']) if (item[key] !== undefined) number(item[key], `offer.${key}`, 0, 1e15);
  }
  unique(offers.map(item => String(item.id)), '이적 제안');
  for (const [index, raw] of list(career.transfers, 'transfers', 500).entries()) {
    const item = object(raw, `transfers[${index}]`);
    number(item.year, 'transfer.year', 1900, 2500, true);
    clubId(item.fromClubId, 'transfer.fromClubId');
    clubId(item.toClubId, 'transfer.toClubId');
    number(item.fee, 'transfer.fee', 0, 1e12);
    number(item.wage, 'transfer.wage', 0, 1e12);
  }
  validateSystems(career, player, playerId);
  validateCareerExtensions(parsed as Career);
  return parsed as Career;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const fields = Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${fields.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

async function checksum(career: Career): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('안전한 저장을 위해 HTTPS 또는 localhost에서 게임을 열어 주세요.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(career)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function envelopeFor(career: Career): Promise<SaveEnvelope> {
  const copy = validateCareer(career);
  return { format: 'kball-save', schemaVersion: 1, hash: await checksum(copy), savedAt: new Date().toISOString(), career: copy };
}

async function verifyEnvelope(value: unknown): Promise<SaveEnvelope> {
  const envelope = object(value, '파일');
  assert(envelope.format === 'kball-save', 'K볼 저장 파일이 아닙니다.');
  assert(envelope.schemaVersion === 1, '지원하지 않는 저장 버전입니다. 게임을 업데이트하거나 이전 백업을 사용하세요.');
  assert(typeof envelope.hash === 'string' && /^[a-f0-9]{64}$/.test(envelope.hash), '파일 검사 정보가 없습니다.');
  date(envelope.savedAt, 'savedAt');
  const career = validateCareer(envelope.career);
  assert(await checksum(career) === envelope.hash, '파일 내용이 변경되었거나 손상되었습니다. 정상 백업을 사용하세요.');
  return { format: 'kball-save', schemaVersion: 1, savedAt: String(envelope.savedAt), hash: String(envelope.hash), career };
}

function storageError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('저장')) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return new Error('저장 공간이 부족합니다. JSON 백업을 내보낸 뒤 필요 없는 슬롯을 정리해 주세요.');
  return new Error('브라우저 저장소를 사용할 수 없습니다. 저장 권한과 여유 공간을 확인하거나 JSON 백업을 이용해 주세요.');
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('이 브라우저에서 IndexedDB를 사용할 수 없습니다. 저장 가능한 브라우저로 다시 열어 주세요.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      for (const name of ['slots', 'backups', 'metadata']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onerror = () => { databasePromise = undefined; reject(storageError(request.error)); };
    request.onblocked = () => { databasePromise = undefined; reject(new Error('다른 탭의 K볼을 닫은 뒤 저장소를 다시 열어 주세요.')); };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      resolve(database);
    };
  });
  return databasePromise;
}

function enqueue<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  writeQueues.set(id, next);
  void next.finally(() => { if (writeQueues.get(id) === next) writeQueues.delete(id); }).catch(() => undefined);
  return next;
}

async function readSlot(id: string): Promise<{ current?: StoredCareer; backup?: StoredCareer; metadata?: Metadata }> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['slots', 'backups', 'metadata'], 'readonly');
    const current = transaction.objectStore('slots').get(id);
    const backup = transaction.objectStore('backups').get(id);
    const metadata = transaction.objectStore('metadata').get(id);
    transaction.oncomplete = () => resolve({ current: current.result, backup: backup.result, metadata: metadata.result });
    transaction.onabort = () => reject(storageError(transaction.error));
    transaction.onerror = () => reject(storageError(transaction.error));
  });
}

/** A successful save updates the slot, its previous-good backup, and metadata atomically. */
async function persistCareer(career: Career, recovery?: RecoverySnapshot): Promise<void> {
  const validated = validateCareer(career);
  return enqueue(validated.id, async () => {
    const envelope = await envelopeFor(validated);
    const database = await openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['slots', 'backups', 'metadata'], 'readwrite');
      const slots = transaction.objectStore('slots');
      const metadataStore = transaction.objectStore('metadata');
      const current = slots.get(validated.id);
      const metadata = metadataStore.get(validated.id);
      let failure: Error | undefined;
      let prepared = false;
      const write = () => {
        if (prepared || current.readyState !== 'done' || metadata.readyState !== 'done') return;
        prepared = true;
        const existing = current.result as StoredCareer | undefined;
        const currentMetadata = metadata.result as Metadata | undefined;
        const known = knownVersions.get(validated.id);
        const fail = (message: string) => { failure = new Error(message); transaction.abort(); };
        if (currentMetadata?.deleted) { fail('저장 슬롯이 다른 작업에서 삭제되었습니다. 새 슬롯으로 가져오거나 다른 커리어를 선택해 주세요.'); return; }
        if (recovery) {
          // Explicit recovery can replace a damaged slot, but never a newer concurrent write.
          if (JSON.stringify(existing) !== JSON.stringify(recovery.current) || JSON.stringify(currentMetadata) !== JSON.stringify(recovery.metadata)) {
            fail('저장 충돌: 복구 중 다른 탭에서 커리어가 변경되었습니다. 슬롯을 다시 불러와 주세요.'); return;
          }
          if (existing && !recovery.preserveBackup) transaction.objectStore('backups').put(existing);
        } else if (existing) {
          const previous = existing.envelope;
          if (previous.career.revision > validated.revision) { fail('저장 충돌: 더 최신인 진행 기록이 있습니다. 슬롯을 다시 불러와 주세요.'); return; }
          if (previous.career.revision === validated.revision && previous.hash !== envelope.hash) { fail('저장 충돌: 같은 시점의 다른 진행 기록이 있습니다. 슬롯을 다시 불러와 주세요.'); return; }
          if (known && (known.revision !== previous.career.revision || known.hash !== previous.hash)) { fail('저장 충돌: 다른 탭에서 커리어가 변경되었습니다. 슬롯을 다시 불러와 주세요.'); return; }
          if (!known && previous.hash !== envelope.hash) { fail('저장 충돌: 기존 슬롯을 먼저 불러오거나 새 슬롯을 사용해 주세요.'); return; }
          if (previous.hash === envelope.hash) return; // An identical autosave must not displace the useful backup.
          transaction.objectStore('backups').put(existing);
        }
        const club = clubs.get(validated.player.clubId)!;
        const nextMetadata: SlotMetadata = {
          id: validated.id, name: `${validated.player.name} · ${validated.season.year}/${String(validated.season.year + 1).slice(-2)}`,
          playerName: validated.player.name, clubName: club.name, year: validated.season.year,
          age: validated.player.age, ovr: validated.player.ovr, updatedAt: envelope.savedAt,
          revision: validated.revision, hash: envelope.hash,
        };
        slots.put({ id: validated.id, envelope } satisfies StoredCareer);
        metadataStore.put(nextMetadata);
      };
      current.onsuccess = write;
      metadata.onsuccess = write;
      transaction.oncomplete = () => { knownVersions.set(validated.id, { revision: validated.revision, hash: envelope.hash }); resolve(); };
      transaction.onabort = () => reject(failure ?? storageError(transaction.error));
      transaction.onerror = () => reject(failure ?? storageError(transaction.error));
    });
  });
}

export async function saveCareer(career: Career): Promise<void> {
  return persistCareer(career);
}

export async function listSlots(): Promise<SaveSlot[]> {
  const database = await openDatabase();
  const rows = await new Promise<Metadata[]>((resolve, reject) => {
    const transaction = database.transaction('metadata', 'readonly');
    const request = transaction.objectStore('metadata').getAll();
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(storageError(transaction.error));
    transaction.onerror = () => reject(storageError(transaction.error));
  });
  return rows.filter((row): row is SlotMetadata => !row.deleted).map(({ hash: _hash, deleted: _deleted, ...slot }) => slot).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadCareer(id: string): Promise<Career> {
  text(id, '슬롯 ID');
  const snapshot = await readSlot(id);
  if (!snapshot.current || snapshot.metadata?.deleted) throw new Error('저장 슬롯을 찾을 수 없습니다. 다른 슬롯이나 JSON 백업을 사용해 주세요.');
  const envelope = await verifyEnvelope(snapshot.current.envelope);
  assert(envelope.career.id === id, '슬롯 ID와 저장 내용이 일치하지 않습니다.');
  knownVersions.set(id, { revision: envelope.career.revision, hash: envelope.hash });
  return envelope.career;
}

export async function deleteSlot(id: string): Promise<void> {
  text(id, '슬롯 ID');
  return enqueue(id, async () => {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['slots', 'backups', 'metadata'], 'readwrite');
      const metadata = transaction.objectStore('metadata');
      const request = metadata.get(id);
      request.onsuccess = () => {
        transaction.objectStore('slots').delete(id);
        transaction.objectStore('backups').delete(id);
        metadata.put({ id, revision: request.result?.revision ?? 0, deleted: true } satisfies Tombstone);
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(storageError(transaction.error));
      transaction.onerror = () => reject(storageError(transaction.error));
    });
    knownVersions.delete(id);
  });
}

export async function restoreBackup(id: string): Promise<Career> {
  text(id, '슬롯 ID');
  const snapshot = await readSlot(id);
  if (!snapshot.backup || snapshot.metadata?.deleted) throw new Error('복원할 이전 저장본이 없습니다. JSON 백업을 가져올 수 있습니다.');
  const envelope = await verifyEnvelope(snapshot.backup.envelope);
  assert(envelope.career.id === id, '백업 ID와 슬롯이 일치하지 않습니다.');
  let validCurrent: SaveEnvelope | undefined;
  if (snapshot.current) {
    try { validCurrent = await verifyEnvelope(snapshot.current.envelope); }
    catch { /* Restore the verified backup without turning the damaged slot into a backup. */ }
  }
  const revisionCandidates = [envelope.career.revision, validCurrent?.career.revision, snapshot.metadata?.revision]
    .filter((revision): revision is number => typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 && revision < 100_000_000);
  const restored = envelope.career;
  restored.revision = Math.max(...revisionCandidates) + 1;
  await persistCareer(restored, { current: snapshot.current, metadata: snapshot.metadata, preserveBackup: !validCurrent });
  return restored;
}

export async function exportCareer(career: Career): Promise<string> {
  return stringify(await envelopeFor(career));
}

/** Imported saves always become new slots; no existing game or legacy localStorage is overwritten. */
export async function importCareer(source: string): Promise<Career> {
  assert(typeof source === 'string' && new TextEncoder().encode(source).byteLength <= MAX_SAVE_BYTES, '저장 파일은 128MB 이하여야 합니다.');
  let parsed: unknown;
  try { parsed = JSON.parse(source); }
  catch { throw new Error('저장 파일을 읽을 수 없습니다. 올바른 JSON 백업을 선택해 주세요.'); }
  ensureSafeJSON(parsed);
  const envelope = await verifyEnvelope(parsed);
  const imported = envelope.career;
  imported.id = `career-${globalThis.crypto.randomUUID()}`;
  return imported;
}
