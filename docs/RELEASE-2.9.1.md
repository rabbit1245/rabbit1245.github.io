# K볼 2.9.1

2026-10-26 · 배포 완료. 구단 배지 57개 보완.

2.9.0에서 비어 있던 57개 구단의 배지를 모두 연결했다. **913개 구단에 배지가 표시되고 표시 누락은 0개**다. 기존·과거·전신 구단 자료 906개와 사용자 요청으로 제작한 비공식 창작 SVG 7개를 포함한다. 창작 배지를 실제 공식 엠블럼으로 표시하지 않는다.

마지막 11개 중 아래 4개는 구버전·전신 자료다.

| 현재 구단 | 사용한 과거 배지 |
| --- | --- |
| 리라-리르서 베를라르 | Lyra TSV |
| 벨리시아 빌전 | Spouwen-Mopertingen |
| 몽스 | RAEC Mons |
| 튀비즈-브렌 | AFC Tubize |

울산시민·여주·센트럴 밸리 푸에고·노던 콜로라도 헤일스톰·니노버·스토케·뱅슈에는 각각 구분되는 작은 창작 SVG를 넣었다. 원본 파일의 제목과 출처 목록에 비공식 창작임을 기록했다. 이 7개는 외부 이미지나 글꼴 다운로드 없이 표시된다.

50개 외부 원본과 7개 창작 SVG의 원본·출력 SHA-256을 [출처 목록](../data/crest-additions-2.9.1.json)에 기록했다. 전부 assets/crests/와 카탈로그 ID에 연결하며 단일 HTML 안에도 포함한다. [창작 원본](../data/original-crests/)도 저장소에 보존한다. 가져오기 도구는 원본 해시·구단 이름·SVG 외부 참조를 검증한 뒤 파일을 갱신하고, 전체 배지 검사에는 표시 누락 0개 검증을 추가했다. 설명서·라이선스에 창작/구버전 구분과 출처를 동봉한다.

구단 ID·이름·국가·리그·기본 전력·색상 등 로고 경로 외 데이터가 2.9.0과 동일함을 대조했다. 시뮬레이션·성장·이적·수상·세이브·은퇴 기록 로직은 바꾸지 않는다. 기존 저장도 같은 구단 ID로 새 배지를 사용한다. 파일을 바꾸기 전 JSON 백업을 내보내고 새 HTML에서 가져오면 된다.

타입 검사, 웹/단일 HTML 빌드, 전체 배지 완성도 검사, 57개 자산 재생성·해시 대조가 통과했다. 브라우저에서는 전체 913개 디코딩과 웹 오프라인 캐시·재접속, 새 57개의 PC·모바일 선택 화면과 13개 리그 그룹 순위표를 검증했다. 기존 전체 플레이 검사도 11항목을 통과했다. 페이지 오류와 다운로드판 외부 HTTP 요청은 0건이다. Windows Edge의 file 실행을 직접 측정한 결과와 구별해, 동일 HTML의 localhost·오프라인·Blob Worker·저장·재실행을 검증했다.

- [배지 전체 검사](validation/kball-2.9.1-crests.json)
- [추가 57개 선택 화면·순위표](validation/release-2.9.1/new-portable.json)
- [913개 다운로드판 디코딩·기존 구단 표시·재실행](validation/release-2.9.1/portable.json)
- [913개 웹 오프라인 캐시](validation/release-2.9.1/web-offline.json)
- [기존 플레이 11항목](validation/release-2.9.1/playable-flow.json)
- [기존 구단 데이터 보존](validation/release-2.9.1/catalogue-preservation.json)
- [57개 배지 대조 이미지](validation/release-2.9.1/added-crests.png)

[K볼 2.9.1 ZIP 다운로드](https://github.com/rabbit1245/rabbit1245.github.io/raw/737d7de4f74326d546d3c1c911cd894d99439b80/Kball.zip?download=1)

ZIP **21,505,693바이트** · SHA-256 `f16f235e97991f5a3571d74cd475f5100ee6fbfd2552800a7fd05b3e822c182c`. 공개 주소의 HTTP 200·application/zip 응답에서 다시 받은 파일의 해시·CRC·동봉 HTML이 검수본과 일치한다.

소스 구현 `6f5499d29efa40434766d090943b6ffd067ff866` · 다운로드 배포 `737d7de4f74326d546d3c1c911cd894d99439b80`.

[공개 다운로드 검증](validation/release-2.9.1/public-download.json) · [실제 다운로드판 실행 검증](validation/release-2.9.1/public-smoke.json).

실제로 내려받은 HTML에서도 913개 배지 디코딩, PC·모바일 표시, 오프라인·저장·재실행 검증이 통과했고 페이지 오류와 외부 요청은 0건이다.
