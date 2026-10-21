import { LEAGUES } from './data';
import type { LeagueRule } from './revision-types';

/** Sources identify the governing body; they do not certify the retained catalogue as a 2026 season. */
export const LEAGUE_MODEL_POLICY = '2024/FC25 명단을 유지한 게임용 승강 모델입니다. 공식 기관 링크는 참고 출처이며 2026 규정·라이선스·리저브팀 자격을 전부 검증했다는 뜻이 아닙니다. 정규리그는 홈·원정 2회전으로 통일하며, 분리리그·지역조 재편·일부 플레이오프를 단순화합니다. 멕시코 리그는 현재 자료에 없습니다.';

const sources: Record<string, string> = {
  '대한민국':'https://www.kleague.com/', '일본':'https://www.jleague.jp/',
  '중국':'https://www.thecfa.cn/', '미국':'https://www.mlssoccer.com/',
  '브라질':'https://www.cbf.com.br/', '이탈리아':'https://www.figc.it/',
  '프랑스':'https://www.fff.fr/', '스페인':'https://rfef.es/',
  '독일':'https://www.dfb.de/', '영국':'https://www.efl.com/',
  '포르투갈':'https://www.fpf.pt/', '벨기에':'https://www.rbfa.be/',
  '네덜란드':'https://www.knvb.nl/', '튀르키예':'https://www.tff.org/',
};

// Slots crossing each tier boundary. Grouped divisions share the upper division's slots.
const relegationSlots: Record<string, number> = {
  KR1:1, JP1:3, JP2:3, CN1:2, CN2:2, BR1:4, BR2:4,
  IT1:3, IT2:4, FR1:3, FR2:3, ES1:3, ES2:4, DE1:3, DE2:3,
  EN1:3, EN2:3, PT1:3, PT2:2, BE1:2, BE2:2, NL1:3, TR1:4, TR2:3,
};

export const LEAGUE_RULES: Record<string, LeagueRule> = Object.fromEntries(LEAGUES.map(league => {
  const upper = LEAGUES.filter(other => other.country === league.country && other.tier === league.tier - 1);
  const lower = LEAGUES.filter(other => other.country === league.country && other.tier === league.tier + 1);
  const peers = LEAGUES.filter(other => other.country === league.country && other.tier === league.tier);
  const closed = league.country === '미국';
  const blockedUpper = league.id === 'KR3' || league.id === 'NL3';
  const blockedLower = league.id === 'KR2' || league.id === 'NL2';
  const relegation = closed || blockedLower || lower.length === 0 ? 0 : (relegationSlots[league.id] ?? 0);
  const promotion = closed || blockedUpper || upper.length === 0 ? 0
    : Math.floor((relegationSlots[upper[0].id] ?? 0) / peers.length);
  let note = '정규 순위에 따른 승강 인원은 게임 모델입니다. 실제 플레이오프·라이선스·리저브팀 자격은 단순화하며 2026 규정으로 검증되지 않았습니다.';
  if (peers.length > 1) note += ' 지역조 승자는 우선 선발하고 남는 승격 자리는 승점/경기·득실/경기로 비교합니다. 강등팀은 비워진 조 자리를 채워 조별 정원을 유지합니다.';
  if (league.id === 'KR1' || league.id === 'KR2') note = 'K1 최하위와 K2 우승은 직접 교환합니다. K1 하위 두 팀과 K2 2·3위는 단판 모델 플레이오프를 치르며 동점이면 K1 잔류입니다. 실제 K2 준플레이오프와 2026 세부 규정은 재현하지 않습니다. K2↔K3는 참가 자격·라이선스 확인 전 자동 승강하지 않습니다.';
  if (league.id === 'KR3') note = 'K2 참가 자격·라이선스·2026 연결 규정이 검증되지 않아 K2↔K3 자동 승강을 적용하지 않습니다.';
  if (closed) note = 'MLS·USL·MLS NEXT Pro는 서로 다른 폐쇄형 대회로 취급하며 자동 승강하지 않습니다. MLS의 컨퍼런스·플레이오프는 정규리그 모델로 단순화합니다.';
  if (league.id === 'NL2' || league.id === 'NL3') note += ' 프로·아마추어 연결과 리저브팀 자격이 확인되지 않아 2↔3부 자동 승강은 적용하지 않습니다.';
  if (league.country === '일본') note += ' 일본의 2026 특별대회·추춘제 전환은 별도 재현하지 않으며 7월 시작의 정상 시즌 모델을 사용합니다.';
  return [league.id, {
    id:league.id, country:league.country,
    startMonth:['대한민국','중국','미국','브라질'].includes(league.country) ? 1 : 7,
    promotion, relegation,
    ...(upper.length === 1 && !closed && !blockedUpper ? {upperLeagueId:upper[0].id} : {}),
    ...(lower.length === 1 && !closed && !blockedLower ? {lowerLeagueId:lower[0].id} : {}),
    automatic:!closed && !blockedUpper,
    note, sourceUrl:sources[league.country], medalApps:league.id === 'EN1' ? 5 : 1,
  } satisfies LeagueRule];
}));

export function getLeagueRule(id: string): LeagueRule {
  const rule = LEAGUE_RULES[id];
  if (!rule) throw new Error(`알 수 없는 리그 규정입니다: ${id}`);
  return rule;
}
