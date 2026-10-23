/** Supported-world tournament rules; regional qualification outside the catalogue is not invented. */
export const DOMESTIC_CUPS = [
 {id:'FA',name:'FA컵',country:'영국',max:128,legsFrom:0,note:'지원 잉글랜드 구단 · 단판 · 결승 중립'},
 {id:'EFL',name:'카라바오컵',country:'영국',max:128,leagueCup:true,legsFrom:4,note:'잉글랜드 1~4부 · 4강만 홈·원정 · 결승 단판'},
 {id:'DFB',name:'DFB 포칼',country:'독일',max:64,legsFrom:0,note:'지원 상위 64구단 · 단판'},
 {id:'COPA',name:'코파 델 레이',country:'스페인',max:128,legsFrom:4,note:'리저브 제외 · 4강만 홈·원정 · 결승 단판'},
 {id:'COPPA',name:'코파 이탈리아',country:'이탈리아',max:44,legsFrom:4,note:'지원 상위 44구단 · 4강만 홈·원정 · 결승 단판'},
 {id:'CDF',name:'쿠프 드 프랑스',country:'프랑스',max:128,legsFrom:0,note:'지원 구단 토너먼트 · 단판'},
 {id:'KNVB',name:'KNVB 베이커',country:'네덜란드',max:64,legsFrom:0,note:'리저브 제외 · 단판'},
 {id:'TACA',name:'타사 드 포르투갈',country:'포르투갈',max:128,legsFrom:4,note:'4강만 홈·원정 · 결승 단판'},
 {id:'TACALIGA',name:'타사 다 리가',country:'포르투갈',max:8,leagueCup:true,legsFrom:0,note:'1부 상위 6팀·2부 상위 2팀 · 단판'},
 {id:'CROKY',name:'벨기에 컵',country:'벨기에',max:64,legsFrom:4,note:'4강만 홈·원정 · 결승 단판'},
 {id:'TURKIYE',name:'튀르키예 컵',country:'튀르키예',max:64,legsFrom:0,note:'게임 지원 구단 단판 토너먼트 · 실제 시즌별 조별 형식은 축약'},
 {id:'KOREA',name:'코리아컵',country:'대한민국',max:64,legsFrom:0,note:'지원 K1·K2·K3 · 미지원 지역 예선 제외 · 단판'},
 {id:'EMPEROR',name:'천황배',country:'일본',max:128,legsFrom:0,note:'지원 J리그 구단 · 지역 예선은 축약 · 단판'},
 {id:'LEVain',name:'J리그 YBC 르방컵',country:'일본',max:64,leagueCup:true,legsFrom:8,note:'지원 J1·J2·J3 · 8강·4강 홈·원정 · 결승 단판'},
 {id:'CHINA',name:'중국 FA컵',country:'중국',max:64,legsFrom:0,note:'지원 구단 · 단판'},
 {id:'BRASIL',name:'코파 두 브라질',country:'브라질',max:128,legsFrom:32,note:'지원 구단 · 32강부터 홈·원정 · 결승은 게임 단판 중립'},
 {id:'USOPEN',name:'US 오픈컵',country:'미국',max:128,legsFrom:0,note:'지원 미국 구단 · 캐나다 구단 제외 · 단판'},
] as const;
export const EUROPEAN_COUNTRIES=['영국','스페인','독일','이탈리아','프랑스','포르투갈','네덜란드','벨기에','튀르키예'];
export const CONTINENTAL_CUPS=[{id:'UCL',name:'UEFA 챔피언스리그',rounds:8},{id:'UEL',name:'UEFA 유로파리그',rounds:8},{id:'UECL',name:'UEFA 컨퍼런스리그',rounds:6}] as const;
export const CUP_MODEL='지원 국가·구단 안에서 참가권 배분과 예선을 축약합니다. UEFA는 36팀·8/8/6경기, 1~8위 16강 직행·9~24위 플레이오프, 이후 홈·원정과 단판 결승입니다. 대회 간 탈락 이동은 없습니다. 지원 구단 안에서 리그 페이즈 추첨의 포트·동일 협회 제한을 축약합니다. 정규 90분(홈·원정은 합계) 동률이면 연장을 생략하고 승부차기를 진행합니다. 최초 시즌은 구단 전력 시드, 다음 시즌부터 실제 리그·컵 성적을 사용합니다.';
