import type {Club,RosterPlayer,Position} from './types';
/** Real clubs outside the retained domestic leagues. Power is an explicit game estimate;
 * squads are marked fictional. These guests cannot receive invented domestic standings. */
const groups:[string,string,[string,string,number][]][]=[
 ['SA','사우디아라비아',[['HILAL','알힐랄',80],['NASSR','알나스르',78],['ITTIHAD','알이티하드',77],['AHLI','알아흘리',78]]],
 ['QA','카타르',[['SADD','알사드',72],['DUHAIL','알두하일',71],['RAYYAN','알라이얀',70],['GHARAFA','알가라파',69]]],
 ['AE','아랍에미리트',[['AIN','알아인',71],['SHABAB','샤바브 알아흘리',70],['WASL','알와슬',71]]],
 ['IR','이란',[['PERSEPOLIS','페르세폴리스',71],['ESTEGHLAL','에스테그랄',70]]],
 ['UZ','우즈베키스탄',[['PAKHTAKOR','파흐타코르',65],['NASAF','나사프',66]]],
 ['IQ','이라크',[['SHORTA','알쇼르타',67],['QUWA','알쿠와 알자위야',65]]],
 ['AU','호주',[['MARINERS','센트럴코스트 매리너스',66],['CITY','멜버른 시티',67]]],
 ['TH','태국',[['BURIRAM','부리람 유나이티드',67],['BANGKOK','방콕 유나이티드',64]]],
 ['EG','이집트',[['AHLY','알아흘리',76],['ZAMALEK','자말렉',72],['PYRAMIDS','피라미즈',73],['MASRY','알마스리',66]]],
 ['MA','모로코',[['WYDAD','위다드 카사블랑카',72],['RAJA','라자 카사블랑카',71],['FAR','AS FAR',70],['BERKANE','RS 베르칸',70]]],
 ['TN','튀니지',[['ESPERANCE','에스페랑스 튀니스',72],['ETOILE','에투알 뒤 사엘',67]]],
 ['DZ','알제리',[['BEL','CR 벨루이즈다드',68],['ALGER','MC 알제',67]]],
 ['ZA','남아프리카공화국',[['SUNDOWNS','마멜로디 선다운스',73],['PIRATES','올랜도 파이리츠',69],['CHIEFS','카이저 치프스',65],['STELLEN','스텔렌보스',66]]],
 ['CD','콩고민주공화국',[['MAZEMBE','TP 마젬베',68],['VITA','AS 비타 클루브',65]]],
 ['AO','앙골라',[['PETRO','페트루 아틀레티쿠',67],['SAGRADA','사그라다 에스페란사',63]]],
 ['TZ','탄자니아',[['YANGA','영 아프리칸스',67],['SIMBA','심바 SC',66]]],
 ['SD','수단',[['HILAL','알힐랄 옴두르만',66],['MERRIKH','알메리크',64]]],
 ['CI','코트디부아르',[['ASEC','ASEC 미모자',64],['STADE','스타드 아비장',61]]],
 ['NZ','뉴질랜드',[['AUCKLAND','오클랜드 시티',58],['WELLINGTON','웰링턴 올림픽',53]]],
 ['FJ','피지',[['REWA','레와',49],['BA','바 FC',48]]],
 ['VU','바누아투',[['IFIRA','이피라 블랙 버드',48],['GALAXY','갤럭시 FC',47]]],
 ['SB','솔로몬제도',[['SOLOMON','솔로몬 워리어스',49],['HENDERSON','헨더슨 일스',48]]],
 ['PF','타히티',[['PIRAE','AS 피레',51],['VENUS','AS 베누스',49]]],
 ['PG','파푸아뉴기니',[['HEKARI','헤카리 유나이티드',50],['LAE','라에 시티',48]]],
 ['WS','사모아',[['LUPE','루페 올레 소아가',45],['SOGI','소기 SC',42]]],
 ['NC','뉴칼레도니아',[['HIENGHENE','이앙겐 스포르',49],['MAGENTA','AS 마장타',49]]],
 ['AR','아르헨티나',[['RIVER','리버 플레이트',78],['BOCA','보카 주니어스',77],['RACING','라싱 클루브',76],['ESTUDIANTES','에스투디안테스',74]]],
 ['CO','콜롬비아',[['NACIONAL','아틀레티코 나시오날',73],['MILLONARIOS','미요나리오스',72]]],
 ['EC','에콰도르',[['LDU','LDU 키토',74],['IDV','인디펜디엔테 델 바예',74]]],
 ['UY','우루과이',[['PENAROL','페냐롤',73],['NACIONAL','클루브 나시오날',73]]],
 ['PY','파라과이',[['OLIMPIA','올림피아',72],['CERRO','세로 포르테뇨',72]]],
 ['MX','멕시코',[['MONTERREY','몬테레이',77],['PACHUCA','파추카',75],['LEON','클루브 레온',73],['AMERICA','클루브 아메리카',78],['TIGRES','티그레스 UANL',77],['CRUZ','크루스 아술',77],['GUADALAJARA','과달라하라',73],['PUMAS','푸마스 UNAM',72]]],
 ['CR','코스타리카',[['SAPRISSA','데포르티보 사프리사',66],['ALAJUELENSE','알라후엘렌세',67]]],
 ['HN','온두라스',[['OLIMPIA','CD 올림피아',64],['MOTAGUA','모타과',63]]],
];
export const INTERNATIONAL_CLUBS:Club[]=groups.flatMap(([code,country,clubs])=>clubs.map(([key,name,power])=>({id:`INT_${code}_${key}`,name,nativeName:name,country,leagueId:`INT:${code}`,power,color:'#64706b'})));
export const INTERNATIONAL_LEAGUES=groups.map(([code,country])=>({id:`INT:${code}`,name:`${country} 국제대회 초청 구단`,country,tier:1,verified:false}));
const positions:Position[]=['GK','GK','CB','CB','CB','LB','RB','CDM','CM','CM','CAM','LW','RW','ST','ST','LM','RM','CF'];
const rosterCache=new Map<string,RosterPlayer[]>();
export function internationalRoster(id:string):RosterPlayer[]{
 const existing=rosterCache.get(id);if(existing)return existing;
 const club=INTERNATIONAL_CLUBS.find(c=>c.id===id);if(!club)return[];
 const rows=positions.map((position,i)=>({id:`guest:${id}:${i}`,clubId:id,name:`${club.name} ${position}${i+1} (가상)`,position,ovr:Math.max(35,club.power+(i%5)-2),age:23+i%8}));rosterCache.set(id,rows);return rows;
}
