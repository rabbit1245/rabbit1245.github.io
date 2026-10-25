import type {Award} from './types';
/** Real award names and organisers. Numerical voting below is a game model, never an official vote. */
export const AWARD_MODEL_VERSION='kball-awards-2.8';
export const AWARD_VERIFICATION_NOTE='게임 경기 기록으로 선정하는 모형입니다. 대상 연도의 공식 규정·평가 기간을 모두 검증한 결과는 아닙니다.';
export interface AwardRule {
  id: string; name: string; organiser: string; criterion: string; sourceUrl: string;
  metric: 'goals'|'assists'|'cleanSheets'|'performance'|'eleven';
  official?: boolean;
  tieBreak?: 'fewerAppsThenMinutes'|'unresolved';
  formation?: { defenders: number; midfielders: number; forwards: number };
}
const premier = 'https://www.premierleague.com/en/awards';
const kleague = 'https://www.kleague.com/';
const scorers = (id: string, name: string, organiser: string, sourceUrl: string): AwardRule => ({ id, name, organiser, sourceUrl, metric: 'goals', criterion: '해당 리그 정규시즌 최다 득점. 동률은 공동 수상으로 처리하는 게임 모형입니다.' });
export const LEAGUE_AWARD_RULES: Record<string, AwardRule[]> = {
  EN1: [
    scorers('golden-boot', '프리미어리그 골든 부트', 'Premier League', premier),
    { id: 'playmaker', name: '프리미어리그 플레이메이커', organiser: 'Premier League', sourceUrl: premier, metric: 'assists', criterion: '해당 프리미어리그 시즌 최다 도움. 동률 공동 수상.' },
    { id: 'golden-glove', name: '프리미어리그 골든 글러브', organiser: 'Premier League', sourceUrl: premier, metric: 'cleanSheets', criterion: '해당 프리미어리그 시즌 골키퍼 최다 무실점. 동률 공동 수상.' },
    { id: 'player-season', name: '프리미어리그 시즌의 선수', organiser: 'Premier League', sourceUrl: premier, metric: 'performance', criterion: '실제 상은 팬·전문가 투표로 선정합니다. 게임에서는 실제 시즌 기록·포지션별 기여·팀 성적·징계로 투표를 모형화합니다.' },
    { id: 'pfa-team', name: 'PFA 올해의 팀', organiser: 'Professional Footballers’ Association', sourceUrl: 'https://www.thepfa.com/awards', metric: 'eleven', formation: { defenders: 4, midfielders: 3, forwards: 3 }, criterion: '실제 상은 선수 투표로 선정합니다. 게임에서는 프리미어리그 시즌 기록으로 GK 1·DF 4·MF 3·FW 3을 선정합니다.' },
  ],
  KR1: [
    { ...scorers('top-scorer', 'K리그1 최다득점상', '한국프로축구연맹', kleague), tieBreak: 'fewerAppsThenMinutes', criterion: 'K리그1 최다 득점. 동률이면 적은 출전 경기, 이어 적은 출전 시간을 우선합니다.' },
    { id: 'mvp', name: 'K리그1 MVP', organiser: '한국프로축구연맹', sourceUrl: kleague, metric: 'performance', criterion: '실제 상은 감독·주장·미디어 투표로 선정합니다. 게임에서는 실제 시즌 기록·팀 성적·징계로 투표를 모형화합니다.' },
    { id: 'best-eleven', name: 'K리그1 베스트 일레븐', organiser: '한국프로축구연맹', sourceUrl: kleague, metric: 'eleven', formation: { defenders: 4, midfielders: 4, forwards: 2 }, criterion: '실제 상은 포지션별 투표로 선정합니다. 게임에서는 시즌 기록으로 GK 1·DF 4·MF 4·FW 2를 선정합니다.' },
  ],
  ES1: [scorers('pichichi', '피치치 트로피', 'MARCA', 'https://www.marca.com/futbol/primera-division/pichichi.html')],
  DE1: [scorers('torjaegerkanone', '분데스리가 득점왕 · Torjägerkanone', 'kicker', 'https://www.bundesliga.com/en/bundesliga/stats/players/goals')],
  IT1: [scorers('capocannoniere', '세리에 A 득점왕 · Capocannoniere', 'Lega Serie A', 'https://www.legaseriea.it/en/serie-a/statistiche')],
  FR1: [{ ...scorers('top-scorer', '리그 1 최다득점상', 'Ligue de Football Professionnel', 'https://ligue1.com/'), tieBreak: 'unresolved', criterion: '리그 1 최다 득점. 동률 시 비페널티 득점 등 공식 세부 기준에 필요한 기록이 없어 게임은 수상을 확정하지 않습니다.' }],
  JP1: [scorers('top-scorer', 'J1리그 득점왕', 'J.LEAGUE', 'https://www.jleague.jp/awards/')],
};
export const GLOBAL_AWARD_RULES = {
  ballonDor: { id: 'ballon-dor', name: '발롱도르', organiser: 'France Football', sourceUrl: 'https://ballondor.com/', criterion: '개인 활약과 결정력, 팀 성적과 업적, 품위와 페어플레이가 실제 심사 기준입니다. 게임에서는 동일 연도 클럽·국가대표 기록으로 이 기준을 모형화해 30인을 선정합니다.' },
  world11: { id: 'fifpro-world11', name: 'FIFPRO 월드 11', organiser: 'FIFPRO', sourceUrl: 'https://fifpro.org/en/supporting-players/player-influence/world11', criterion: '실제 상은 선수 투표입니다. 게임에서는 시즌 기록으로 GK 1·DF 3·MF 3·FW 3과 남은 필드 선수 중 최고 1명을 선정합니다.' },
};

/** Shared award definitions for the FIFA senior and U-20 World Cups. */
export const FIFA_TOURNAMENT_AWARD_RULES = {
  goldenBoot: { id: 'golden-boot', name: '골든 부트', organiser: 'FIFA', sourceUrl: 'https://www.fifa.com/', criterion: '본선 최다 득점, 동률이면 도움, 이어 적은 출전 시간을 우선합니다. 승부차기 득점은 포함하지 않습니다. 게임은 실제 본선의 기록만 비교합니다.' },
  goldenBall: { id: 'golden-ball', name: '골든 볼', organiser: 'FIFA', sourceUrl: 'https://www.fifa.com/', criterion: '실제 상은 대회 최우수 선수 선정입니다. 게임에서는 실제 본선의 평점·역할별 경기 기여·징계로 투표를 모형화하며, 능력치는 점수에 넣지 않습니다.' },
  goldenGlove: { id: 'golden-glove', name: '골든 글러브', organiser: 'FIFA', sourceUrl: 'https://www.fifa.com/', criterion: '실제 상은 대회 최우수 골키퍼 선정입니다. 게임에서는 실제 본선 골키퍼들의 선방·선방률·무실점·평점·징계로 투표를 모형화합니다.' },
};

/** Every league has a season team; unverified award names stay explicitly K볼 selections. */
export function leagueAwardRules(id:string,name:string):AwardRule[]{
 const rules=LEAGUE_AWARD_RULES[id]??[];
 if(rules.some(r=>r.metric==='eleven'))return rules;
 const official=id==='IT1';
 return [...rules,...(official?[{id:'season-mvp',name:'세리에 A 시즌 MVP',organiser:'Lega Serie A',sourceUrl:'https://www.legaseriea.it/',metric:'performance' as const,criterion:'실제 리그 출전·포지션별 활약·팀 성적을 비교하는 시즌 투표 모형.'}]:[]),{
  id:official?'aic-team':'season-eleven',name:official?'세리에 A 올해의 팀 · AIC':`언론 선정 · ${name} 베스트 11`,organiser:official?'Associazione Italiana Calciatori':'언론 평가 모형',sourceUrl:official?'https://www.assocalciatori.it/':'https://github.com/rabbit1245/rabbit1245.github.io',metric:'eleven',formation:{defenders:4,midfielders:3,forwards:3},official,
  criterion:'해당 리그 기록만으로 GK 1·DF 4·MF 3·FW 3을 비교합니다. 컵·국대 기록은 제외하며 실제 투표와 평가 일정은 게임 모형입니다.'
 }];
}

/** Preserve old adjudications and IDs, updating presentation only. */
export function awardForDisplay(a:Award):Award{
 if(!a.name.startsWith('K볼 선정'))return a;
 const club=/club|commercial/.test(a.category??'');
 return {...a,name:a.name.replace(/^K볼 선정/,club?'클럽 선정':'언론 선정'),organiser:club?'클럽 평가 모형':'언론 평가 모형',official:false};
}
