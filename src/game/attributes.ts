import type { AttributeKey, Player, Position, Talent } from './types';

export const POSITION_LABELS: Record<Position, string> = {
  GK: '골키퍼', CB: '센터백', LB: '왼쪽 풀백', RB: '오른쪽 풀백',
  LWB: '왼쪽 윙백', RWB: '오른쪽 윙백', CDM: '수비형 미드필더', CM: '중앙 미드필더',
  CAM: '공격형 미드필더', LM: '왼쪽 미드필더', RM: '오른쪽 미드필더',
  LW: '왼쪽 윙어', RW: '오른쪽 윙어', CF: '센터 포워드', SS: '세컨드 스트라이커', ST: '스트라이커',
};

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  finishing:'골 결정력',offTheBall:'오프더볼 움직임',pressing:'압박 능력',tackling:'태클 기술',skillMoves:'개인기',
  strength: '근력', stamina: '체력', speed: '속도', agility: '민첩성', jumping: '점프',
  ballControl: '볼 컨트롤', dribbling: '드리블', passing: '패스', crossing: '크로스',
  shooting: '슈팅', heading: '헤딩', defending: '수비지능', setPieces: '세트피스',
  decisions: '판단력', vision: '시야', anticipation: '예측력', positioning: '위치 선정',
  composure: '침착성', concentration: '집중력', teamwork: '팀워크',
  gkShotStopping: '선방', gkReflexes: '반사신경', gkHandling: '핸들링',
  gkAerialCommand: '공중 장악', gkOneOnOnes: '일대일 대응', gkPositioning: 'GK 위치 선정',
  gkDistribution: '배급', gkDefensiveOrganization: '수비 조율',
};

export const LEGACY_FIELD_ATTRIBUTES: AttributeKey[] = [
  'strength', 'stamina', 'speed', 'agility', 'jumping',
  'ballControl', 'dribbling', 'passing', 'crossing', 'shooting', 'heading', 'defending', 'setPieces',
  'decisions', 'vision', 'anticipation', 'positioning', 'composure', 'concentration', 'teamwork',
];

export const NEW_FIELD_ATTRIBUTES:AttributeKey[]=['finishing','offTheBall','pressing','tackling','skillMoves'];
export const FIELD_ATTRIBUTES:AttributeKey[]=[...LEGACY_FIELD_ATTRIBUTES,...NEW_FIELD_ATTRIBUTES];

export const GK_ATTRIBUTES: AttributeKey[] = [
  'gkShotStopping', 'gkReflexes', 'gkHandling', 'gkAerialCommand', 'gkOneOnOnes',
  'gkPositioning', 'gkDistribution', 'decisions', 'concentration', 'gkDefensiveOrganization',
];

/** Ordered core attributes. Every field attribute still contributes to the absolute OVR. */
export const LEGACY_POSITION_ATTRIBUTES: Record<Position, AttributeKey[]> = {
  GK: [...GK_ATTRIBUTES],
  CB: ['defending', 'positioning', 'anticipation', 'strength', 'heading', 'jumping', 'concentration', 'decisions'],
  LB: ['speed', 'stamina', 'defending', 'positioning', 'crossing', 'passing', 'anticipation', 'agility'],
  RB: ['speed', 'stamina', 'defending', 'positioning', 'crossing', 'passing', 'anticipation', 'agility'],
  LWB: ['stamina', 'speed', 'crossing', 'dribbling', 'passing', 'defending', 'positioning', 'teamwork'],
  RWB: ['stamina', 'speed', 'crossing', 'dribbling', 'passing', 'defending', 'positioning', 'teamwork'],
  CDM: ['defending', 'anticipation', 'positioning', 'passing', 'decisions', 'concentration', 'strength', 'vision'],
  CM: ['passing', 'vision', 'decisions', 'ballControl', 'stamina', 'positioning', 'teamwork', 'anticipation'],
  CAM: ['vision', 'passing', 'ballControl', 'dribbling', 'decisions', 'positioning', 'composure', 'shooting'],
  LM: ['crossing', 'passing', 'dribbling', 'speed', 'stamina', 'ballControl', 'vision', 'teamwork'],
  RM: ['crossing', 'passing', 'dribbling', 'speed', 'stamina', 'ballControl', 'vision', 'teamwork'],
  LW: ['dribbling', 'speed', 'agility', 'ballControl', 'shooting', 'composure', 'positioning', 'passing'],
  RW: ['dribbling', 'speed', 'agility', 'ballControl', 'shooting', 'composure', 'positioning', 'passing'],
  CF: ['ballControl', 'passing', 'vision', 'positioning', 'composure', 'shooting', 'decisions', 'dribbling'],
  SS: ['positioning', 'composure', 'shooting', 'ballControl', 'vision', 'passing', 'decisions', 'dribbling'],
  ST: ['shooting', 'positioning', 'composure', 'ballControl', 'anticipation', 'heading', 'speed', 'strength'],
};

export const POSITION_ATTRIBUTES:Record<Position,AttributeKey[]>={...LEGACY_POSITION_ATTRIBUTES,
 CB:['defending','tackling','positioning','anticipation','strength','heading','jumping','concentration'],
 LB:['speed','stamina','defending','tackling','positioning','crossing','passing','pressing'],
 RB:['speed','stamina','defending','tackling','positioning','crossing','passing','pressing'],
 LWB:['stamina','speed','crossing','dribbling','offTheBall','passing','pressing','tackling'],
 RWB:['stamina','speed','crossing','dribbling','offTheBall','passing','pressing','tackling'],
 CDM:['defending','tackling','pressing','anticipation','positioning','passing','decisions','concentration'],
 CM:['passing','vision','decisions','ballControl','stamina','pressing','offTheBall','teamwork'],
 CAM:['vision','passing','ballControl','skillMoves','decisions','offTheBall','composure','finishing'],
 LM:['crossing','passing','dribbling','skillMoves','speed','stamina','offTheBall','pressing'],
 RM:['crossing','passing','dribbling','skillMoves','speed','stamina','offTheBall','pressing'],
 LW:['dribbling','speed','skillMoves','ballControl','finishing','offTheBall','agility','composure'],
 RW:['dribbling','speed','skillMoves','ballControl','finishing','offTheBall','agility','composure'],
 CF:['ballControl','passing','vision','offTheBall','finishing','composure','decisions','skillMoves'],
 SS:['offTheBall','finishing','composure','ballControl','vision','passing','decisions','skillMoves'],
 ST:['finishing','offTheBall','shooting','positioning','composure','heading','anticipation','skillMoves'],
};

export const PLAY_STYLES: Record<Position, string[]> = {
  GK: ['스위퍼 키퍼', '슛 스토퍼', '빌드업 키퍼', '공중 지배자', '배급형 키퍼', '반사신경형 키퍼', '페널티 전문가', '수비 조율자', '전통형 골키퍼', '공격형 골키퍼'],
  CB: ['스토퍼', '커버형 수비수', '볼 플레이잉 수비수', '리베로', '공중볼 수비수', '대인 마커', '수비 리더', '빌드업 수비수', '전진형 수비수', '안정형 센터백'],
  LB: ['수비형 풀백', '오버래핑 풀백', '인버티드 풀백', '플레이메이커형 풀백', '왕복형 풀백', '크로스 전문가', '대인 수비형 풀백', '볼 운반형 풀백', '언더래핑 풀백', '전통형 풀백'],
  RB: ['수비형 풀백', '오버래핑 풀백', '인버티드 풀백', '플레이메이커형 풀백', '왕복형 풀백', '크로스 전문가', '대인 수비형 풀백', '볼 운반형 풀백', '언더래핑 풀백', '전통형 풀백'],
  LWB: ['공격형 윙백', '크로스 전문가', '돌파형 윙백', '인버티드 윙백', '왕복형 윙백', '플레이메이커형 윙백', '수비형 윙백', '언더래핑 윙백', '와이드 플레이메이커', '터치라인 윙백'],
  RWB: ['공격형 윙백', '크로스 전문가', '돌파형 윙백', '인버티드 윙백', '왕복형 윙백', '플레이메이커형 윙백', '수비형 윙백', '언더래핑 윙백', '와이드 플레이메이커', '터치라인 윙백'],
  CDM: ['앵커맨', '볼 위닝 미드필더', '딥라잉 플레이메이커', '하프백', '레지스타', '수비형 피벗', '홀딩 미드필더', '전진형 피벗', '압박형 미드필더', '수비 조율형 미드필더'],
  CM: ['박스투박스', '메짤라', '레지스타', '템포 조절자', '딥라잉 플레이메이커', '전진형 플레이메이커', '볼 위닝 미드필더', '왕복형 미드필더', '찬스 메이커', '연결형 미드필더'],
  CAM: ['엔간체', '트레콰르티스타', '쉐도우 플레이메이커', '침투형 미드필더', '전진형 플레이메이커', '찬스 메이커', '클래식 10번', '드리블형 플레이메이커', '와이드 플레이메이커', '공격형 미드필더'],
  LM: ['클래식 와이드 미드필더', '측면 플레이메이커', '크로스 전문가', '왕복형 미드필더', '인버티드 미드필더', '볼 운반형 미드필더', '수비형 측면 미드필더', '침투형 미드필더', '와이드 플레이메이커', '찬스 메이커'],
  RM: ['클래식 와이드 미드필더', '측면 플레이메이커', '크로스 전문가', '왕복형 미드필더', '인버티드 미드필더', '볼 운반형 미드필더', '수비형 측면 미드필더', '침투형 미드필더', '와이드 플레이메이커', '찬스 메이커'],
  LW: ['인사이드 포워드', '클래식 윙어', '인버티드 윙어', '드리블러', '와이드 플레이메이커', '스피드 윙어', '크로스 전문가', '침투형 윙어', '프레싱 윙어', '골 사냥꾼'],
  RW: ['인사이드 포워드', '클래식 윙어', '인버티드 윙어', '드리블러', '와이드 플레이메이커', '스피드 윙어', '크로스 전문가', '침투형 윙어', '프레싱 윙어', '골 사냥꾼'],
  CF: ['펄스 나인', '연계형 포워드', '딥라잉 포워드', '완성형 포워드', '쉐도우 스트라이커', '찬스 메이커', '테크니컬 포워드', '타깃형 포워드', '프레싱 포워드', '침투형 포워드'],
  SS: ['세컨드 스트라이커', '쉐도우 스트라이커', '펄스 나인', '연계형 포워드', '침투형 포워드', '찬스 메이커', '드리블형 포워드', '완성형 포워드', '프레싱 포워드', '골 사냥꾼'],
  ST: ['포처', '타깃맨', '프레싱 포워드', '완성형 스트라이커', '어드밴스드 포워드', '딥라잉 포워드', '공중볼 스트라이커', '침투형 스트라이커', '연계형 스트라이커', '골 사냥꾼'],
};

export const TALENT_LABELS: Record<Talent, string> = {
  SSS: '역사적인 재능', SS: '세계를 이끌 특급 재능', S: '세계적인 잠재력',
  A: '상위 리그의 핵심 자원', B: '우수한 프로의 가능성', C: '꾸준한 프로의 가능성', D: '노력으로 만드는 커리어',
};

const STYLE_EMPHASES: {pattern: RegExp; keys: AttributeKey[]}[] = [
  {pattern: /슛 스토퍼|반사신경|페널티/, keys: ['gkShotStopping', 'gkReflexes', 'gkOneOnOnes']},
  {pattern: /공중 지배|전통형 골키퍼/, keys: ['gkAerialCommand', 'gkHandling', 'gkPositioning']},
  {pattern: /스위퍼|공격형 골키퍼/, keys: ['gkOneOnOnes', 'gkDistribution', 'decisions']},
  {pattern: /배급형|빌드업 키퍼/, keys: ['gkDistribution', 'decisions', 'gkHandling']},
  {pattern: /수비 조율자/, keys: ['gkDefensiveOrganization', 'concentration', 'gkPositioning']},
  {pattern: /타깃|공중볼/, keys: ['heading', 'strength', 'jumping']},
  {pattern: /포처|골 사냥|침투|쉐도우/, keys: ['shooting', 'positioning', 'composure']},
  {pattern: /드리블|드리블러|돌파|인사이드|인버티드 윙어/, keys: ['dribbling', 'agility', 'ballControl']},
  {pattern: /스피드|어드밴스드/, keys: ['speed', 'positioning', 'shooting']},
  {pattern: /크로스|클래식 윙어|터치라인|클래식 와이드/, keys: ['crossing', 'speed', 'stamina']},
  {pattern: /오버래핑|언더래핑|왕복|박스투박스|메짤라/, keys: ['stamina', 'speed', 'positioning']},
  {pattern: /스토퍼|대인|볼 위닝|압박|프레싱/, keys: ['defending', 'strength', 'stamina']},
  {pattern: /커버|안정형|수비형|앵커맨|하프백|홀딩/, keys: ['anticipation', 'defending', 'positioning']},
  {pattern: /플레이메이커|레지스타|템포|엔간체|찬스|클래식 10|연계|연결|펄스|딥라잉/, keys: ['passing', 'vision', 'decisions']},
  {pattern: /볼 플레이잉|빌드업 수비|리베로|수비 리더|조율형/, keys: ['passing', 'decisions', 'defending']},
  {pattern: /볼 운반|테크니컬/, keys: ['ballControl', 'dribbling', 'passing']},
  {pattern: /완성형|공격형 미드필더|전진형/, keys: ['shooting', 'ballControl', 'decisions']},
  {pattern: /인버티드 풀백|인버티드 윙백|인버티드 미드필더/, keys: ['passing', 'decisions', 'positioning']},
];

/** Normalized weights form a global ability scale; club, league and talent do not enter this calculation. */
function originalAttributeWeights(position: Position, style: string,legacy=false): Partial<Record<AttributeKey, number>> {
  const attributes = position === 'GK' ? GK_ATTRIBUTES : legacy?LEGACY_FIELD_ATTRIBUTES:FIELD_ATTRIBUTES;
  const core = (legacy?LEGACY_POSITION_ATTRIBUTES:POSITION_ATTRIBUTES)[position];
  const weights: Partial<Record<AttributeKey, number>> = {};
  for (const key of attributes) weights[key] = 0.65;
  core.forEach((key, index) => { weights[key] = 3.7 - index * 0.25; });
  let emphasis = STYLE_EMPHASES.find(rule => rule.pattern.test(style))?.keys ?? core.slice(0, 3);
  if(!legacy&&position!=='GK'){
   if(/포처|골 사냥|침투|쉐도우/.test(style))emphasis=['finishing','offTheBall','composure'];
   else if(/드리블|돌파|인사이드|인버티드 윙어/.test(style))emphasis=['skillMoves','dribbling','agility'];
   else if(/프레싱|압박/.test(style))emphasis=['pressing','stamina','tackling'];
   else if(/스토퍼|대인|볼 위닝/.test(style))emphasis=['tackling','defending','strength'];
  }
  emphasis.forEach((key, index) => {
    if (attributes.includes(key)) weights[key] = (weights[key] ?? 0.65) + 2.0 - index * 0.3;
  });
  const total = Object.values(weights).reduce((sum, value) => sum + (value ?? 0), 0);
  for (const key of attributes) weights[key] = (weights[key] ?? 0) / total;
  return weights;
}

/** Preserve both published models for checksum validation and historical comparison. */
export const expanded2120Weights=(position:Position,style:string)=>originalAttributeWeights(position,style);
const FOUNDATION:Partial<Record<AttributeKey,number>>={stamina:.065,speed:.045,strength:.045,agility:.04,ballControl:.045,decisions:.045,teamwork:.045,concentration:.04};
const WEIGHT_CACHE=new Map<string,Partial<Record<AttributeKey,number>>>();
const FOUNDATION_REMAINDER=(1-Object.values(FOUNDATION).reduce((n,v)=>n+v!,0))/(FIELD_ATTRIBUTES.length-Object.keys(FOUNDATION).length);
/** Shared football fundamentals prevent non-core skills disappearing from OVR.
 * The remaining positional component preserves role/style differences. */
export function attributeWeights(position:Position,style:string,legacy=false):Partial<Record<AttributeKey,number>>{
 if(legacy)return originalAttributeWeights(position,style,true);
 const id=position+'|'+style,cached=WEIGHT_CACHE.get(id);if(cached)return cached;
 const role=originalAttributeWeights(position,style),keys=position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
 const result=Object.freeze(Object.fromEntries(keys.map(k=>[k,position==='GK'?.035+(role[k]??0)*.65:(FOUNDATION[k]??FOUNDATION_REMAINDER)*.7+(role[k]??0)*.3])));
 if(PLAY_STYLES[position].includes(style))WEIGHT_CACHE.set(id,result);return result;
}

/** Display the existing positional/type weights; never alter growth or OVR. */
export function attributeImportance(position:Position,style:string):Partial<Record<AttributeKey,0|1|2|3>>{
 const weights=attributeWeights(position,style),values=Object.values(weights) as number[],max=Math.max(...values),min=Math.min(...values);
 return Object.fromEntries(Object.entries(weights).map(([key,w])=>[key,w!>=min+(max-min)*.75-1e-9?3:w!>=min+(max-min)*.35-1e-9?2:1]));
}

/** Current mental excellence and established leadership use the same scale on and off the pitch. */
export function leadershipAbility(attributes:Player['attributes'],trait:number):number{
  const mental=((attributes.decisions??50)+(attributes.concentration??50)+(attributes.composure??50)+(attributes.teamwork??50))/4;
  return Math.round(Math.max(0,Math.min(100,Math.max(mental*.75+trait*.25,trait*.7+mental*.3)))*10)/10;
}
const boundedAbility=(raw:unknown)=>typeof raw==='number'&&Number.isFinite(raw)?Math.max(1,Math.min(120,raw)):1;
/** Earned display OVR is the comparison scale; actions still read actual skills. */
export function playingAbility(player:Pick<Player,'attributes'|'position'|'style'>&{ovr?:number}):number{
 if(player.ovr!==undefined)return player.ovr;
 return Object.entries(attributeWeights(player.position,player.style)).reduce((n,[k,w])=>n+boundedAbility(player.attributes[k as AttributeKey])*w!,0);
}
function weightedOverall(player:Pick<Player,'attributes'|'position'|'style'|'playSkills'|'skillMastery'>,weights:Partial<Record<AttributeKey,number>>):number{
 const base=Object.entries(weights).reduce((n,[k,w])=>n+boundedAbility(player.attributes[k as AttributeKey])*w!,0);
 const allowed=player.position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES,selected=[...new Set(player.playSkills??[])].filter(k=>allowed.includes(k));
 const bonus=selected.length>5?0:selected.reduce((n,k)=>n+Math.min(20,Math.max(0,player.skillMastery?.[k]??0),Math.max(0,(player.attributes[k]??0)-100))*.1,0);
 return Math.max(1,Math.min(130,Math.round(base+bonus)));
}
export const overall=(player:Pick<Player,'attributes'|'position'|'style'|'playSkills'|'skillMastery'>)=>weightedOverall(player,attributeWeights(player.position,player.style));
export const expanded2120Overall=(player:Pick<Player,'attributes'|'position'|'style'|'playSkills'|'skillMastery'>)=>weightedOverall(player,expanded2120Weights(player.position,player.style));
/** Convert comparison evidence only; the original historical number is never rewritten. */
export function reweightedOVR(value:number,attributes:Player['attributes'],position:Position,style:string):number{
 const old=expanded2120Weights(position,style),next=attributeWeights(position,style);
 const shift=Object.entries(next).reduce((n,[k,w])=>n+boundedAbility(attributes[k as AttributeKey])*(w!-(old[k as AttributeKey]??0)),0);
 return Math.max(1,Math.min(130,Math.round(value+shift)));
}
export function legacyOverall(player: Pick<Player, 'attributes'|'position'|'style'|'playSkills'>): number {
  const weights = attributeWeights(player.position, player.style,true);
  let value = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const raw = player.attributes[key as AttributeKey];
    const ability = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(1, Math.min(100, raw)) : 1;
    value += ability * (weight ?? 0);
  }
  const allowed=player.position==='GK'?GK_ATTRIBUTES:FIELD_ATTRIBUTES;
  const selected=[...new Set(player.playSkills??[])].filter(k=>allowed.includes(k));
  // Invalid selections must never produce an inflated rating; save/command validation rejects them.
  if(selected.length>5)return Math.max(1,Math.min(100,Math.round(value)));
  const fifth=Object.values(weights).sort((a,b)=>(b??0)-(a??0))[4]??1;
  const mastery=selected.reduce((n,k)=>n+Math.max(0,Math.min(1,((player.attributes[k]??0)-100)/10))*Math.min(1,(weights[k]??0)/fifth),0)/5;
  // Only earned 100+ skill growth closes the gap to the selected ceiling. Selecting alone adds zero.
  const ceiling=100+4*selected.length;
  return Math.max(1, Math.min(ceiling,120,Math.round(value+(120-value)*mastery)));
}
