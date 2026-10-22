/** Retained FC25 catalogue. Indexed once at module initialization, never per match. */
import rawCatalogue from './catalog.json';
import type { Club, League, Position, RosterPlayer } from './types';

type ClubRow = [string, string, string, string, string, number, string, string | null];
type LeagueRow = [string, string, string, number, boolean];
type PlayerRow = [string, string, Position, number, number];
type Catalogue = {
  metadata: {
    sourceVersion: string; sourceSeason: string; originalLeagueCount: number;
    playableLeagueCount: number; clubCount: number; countryCount: number;
    sourcePlayers: number; mappedRealPlayers: number; retainedRealPlayers: number;
    generatedPlayers: number; clubsWithGeneratedPlayers: number;
    unmatchedSourcePlayers: number; verified2026: boolean;
  };
  calibration: { version: number; legacyPower: Record<string, number>; leagueBaselines: Record<string, number> };
  leagues: LeagueRow[]; clubs: ClubRow[]; rosters: Record<string, PlayerRow[]>;
};
const catalogue = rawCatalogue as unknown as Catalogue;

export const CLUBS: Club[] = catalogue.clubs.map(([id, name, nativeName, country, leagueId, power, color, crest]) => ({
  id, name, nativeName, country, leagueId, power, color, ...(crest ? { crest } : {}),
}));
export const LEAGUES: League[] = catalogue.leagues.map(([id, name, country, tier, verified]) => ({ id, name, country, tier, verified }));
export const ROSTERS: Record<string, RosterPlayer[]> = Object.fromEntries(
  Object.entries(catalogue.rosters).map(([clubId, players]) => [clubId, players.map(([id, name, position, ovr, age]) => ({ id, name, clubId, position, ovr, age }))]),
);
const clubsById = new Map(CLUBS.map(club => [club.id, club]));
const leaguesById = new Map(LEAGUES.map(league => [league.id, league]));

export const COUNTRY_FLAGS: Record<string, string> = {
  '대한민국': '🇰🇷', '일본': '🇯🇵', '중국': '🇨🇳', '미국': '🇺🇸', '브라질': '🇧🇷',
  '이탈리아': '🇮🇹', '프랑스': '🇫🇷', '스페인': '🇪🇸', '독일': '🇩🇪', '영국': '🇬🇧',
  '잉글랜드': '🇬🇧', '포르투갈': '🇵🇹', '벨기에': '🇧🇪', '네덜란드': '🇳🇱', '튀르키예': '🇹🇷',
  '아르헨티나': '🇦🇷', '우루과이': '🇺🇾', '콜롬비아': '🇨🇴', '칠레': '🇨🇱', '에콰도르': '🇪🇨',
  '사우디아라비아': '🇸🇦', '멕시코': '🇲🇽', '캐나다': '🇨🇦', '스코틀랜드': '🇬🇧',
  '덴마크': '🇩🇰', '스위스': '🇨🇭', '폴란드': '🇵🇱', '노르웨이': '🇳🇴', '호주': '🇦🇺',
  '이란': '🇮🇷', '카타르': '🇶🇦', '크로아티아': '🇭🇷', '오스트리아': '🇦🇹', '세르비아': '🇷🇸',
  '체코': '🇨🇿', '스웨덴': '🇸🇪', '모로코': '🇲🇦', '세네갈': '🇸🇳', '나이지리아': '🇳🇬',
  '가나': '🇬🇭', '이집트': '🇪🇬', '카메룬': '🇨🇲', '남아프리카공화국': '🇿🇦', '뉴질랜드': '🇳🇿',
  '아일랜드': '🇮🇪', '웨일스': '🇬🇧', '북아일랜드': '🇬🇧', '우크라이나': '🇺🇦', '루마니아': '🇷🇴',
  '슬로바키아': '🇸🇰', '슬로베니아': '🇸🇮', '헝가리': '🇭🇺', '그리스': '🇬🇷', '핀란드': '🇫🇮',
  '아이슬란드': '🇮🇸', '코스타리카': '🇨🇷', '자메이카': '🇯🇲', '파나마': '🇵🇦', '페루': '🇵🇪',
  '파라과이': '🇵🇾', '베네수엘라': '🇻🇪', '볼리비아': '🇧🇴', '알제리': '🇩🇿', '튀니지': '🇹🇳',
  '말리': '🇲🇱', '코트디부아르': '🇨🇮', '잠비아': '🇿🇲', '콩고민주공화국': '🇨🇩', '앙골라': '🇦🇴',
  '우즈베키스탄': '🇺🇿', '이라크': '🇮🇶', '아랍에미리트': '🇦🇪', '인도': '🇮🇳', '인도네시아': '🇮🇩',
  '베트남': '🇻🇳', '태국': '🇹🇭', '필리핀': '🇵🇭', '싱가포르': '🇸🇬', '말레이시아': '🇲🇾',
};
export const COUNTRIES = [...new Set(CLUBS.map(club => club.country))];
export const NATIONALITIES = Object.keys(COUNTRY_FLAGS);
export const CATALOG_INFO = Object.freeze({ ...catalogue.metadata });
export const ROSTER_CALIBRATION = catalogue.calibration;
export const DATA_PROVENANCE = '기존 2024 / FC25 자료 기반 · 14개국, 43개 리그 단계 / 50개 진행 그룹. 실제 2026/27 명단이 아니며, 미매칭 선수단은 가상 선수로 보완합니다.';

export function getClub(id: string): Club {
  const club = clubsById.get(id);
  if (!club) throw new Error(`알 수 없는 구단입니다: ${id}`);
  return club;
}
export function getLeague(id: string): League {
  const league = leaguesById.get(id);
  if (!league) throw new Error(`알 수 없는 리그입니다: ${id}`);
  return league;
}
