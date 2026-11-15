# K볼 2.14.3 — 실제 장기 저장의 불러오기·진행 복구

사용자가 제공한 분할 ZIP 7개를 합쳐 172,640,077바이트의 복구 아카이브를 읽었습니다. 원본 SHA-256은 `02c350d9ed5cc347d10f1b0220a138dd169d1125cbda8a28a063a2afb8247139`입니다. 실제 세이브와 분할 파일은 공개 저장소에 포함하지 않습니다.

## 재현한 문제

현재 저장과 이전 백업의 gzip 스트림은 모두 정상 완료됐고 모든 진행 변경 Blob의 SHA-256이 원장과 일치했습니다. 기존 코어 검증으로 현재 저장을 리비전 950, 35세, 2044년 17라운드, 과거 18시즌까지 읽었습니다. 기준 스냅샷은 895,575,491바이트이고 최신 커리어 JSON은 1,093,115,348바이트입니다.

브라우저에서는 검증 후 Worker가 전체 커리어를 `postMessage`로 복사할 때 `Data cannot be cloned, out of memory`가 발생했습니다. 최신 커리어는 기존 1GiB 자원 제한도 19,373,524바이트 초과했습니다. 비압축 Blob 전체를 전달하는 중간 수정에서도 다음 진행의 Blob 읽기가 실패해, 최종 전송은 생성 단계부터 압축 스트림으로 처리합니다.

## 수정

- 6시즌 이상 커리어를 Worker로 보낼 때와 검증한 커리어를 받을 때, JSON을 제한된 UTF-8 조각으로 생성하고 backpressure가 있는 gzip 스트림으로 전달합니다. 거대한 객체 메시지와 비압축 커리어 Blob 전체를 피합니다. 수신 측은 크기 검사를 유지하며 분할 해석합니다.
- 검증 Worker의 원본 그래프를 해제한 뒤 화면의 수신 그래프를 구성합니다. 경기 Worker의 장기 커리어 해제 정책은 유지합니다.
- canonical JSON의 순서·바이트·기존 SHA-256을 유지하면서 점진적으로 해시를 계산합니다. 체크섬용 커리어 전체 버퍼 복사들을 제거합니다.
- 지원 JSON 자원 한도를 2GiB로 조정합니다. 나이·시즌을 제한하거나 경기·이벤트·수상·원장을 삭제하지 않습니다. 경기 규칙과 능력치 밸런스는 변경하지 않습니다.
- `.kball-recovery` 파일을 저장 가져오기에서 선택할 수 있습니다. 아카이브 구조, 현재 스냅샷, 변경 해시 체인, 전체 커리어를 검증하고 새 슬롯으로 가져옵니다. 원본과 백업은 덮어쓰지 않으며 이전 백업으로 자동 후퇴하지 않습니다.

## 사용

새 ZIP을 풀고 최신 Chrome/Edge에서 `Kball.html`을 엽니다. 기존 파일과 브라우저 프로필을 유지하면 원래 슬롯에서 이어갈 수 있습니다. 다른 위치에서 실행했다면 **저장 가져오기**로 원래 `.kball-recovery`를 선택하세요. 분할 ZIP은 먼저 모두 같은 폴더에 놓고 압축을 풀어야 합니다. 분할 파일 자체를 게임에 넣지 않습니다.

실제 Windows Edge와 사용자 PC 자체의 메모리·저장 공간은 이 환경에서 확인할 수 없습니다. 검수 환경과 결과는 아래 증거에 기록합니다.

## 재현 검사 실행

`node --max-old-space-size=6144 --import tsx scripts/audit-recovery.ts <원본.kball-recovery> <보고서.json>`으로 아카이브와 현재 저장을 검증하고, 과거 시즌의 전체 필드 canonical SHA-256을 계산할 수 있습니다. 두 번째 파일 검사에는 마지막 인수로 원본의 과거 시즌 수와 대표팀 과거 시즌 수를 주면 그 구간을 대조할 수 있습니다.

`tests/kball-real-recovery.test.mjs`는 로컬 테스트 서버에 최종 HTML과 비공개 `user-recovery.bin`을 제공한 상태에서 실제 IndexedDB 슬롯을 주입하고, 4회 연속 진행·원본 보관 다운로드·페이지를 닫고 다시 여는 검수를 수행합니다. `KBALL_TEST_URL`과 `KBALL_TEST_RESULTS_DIR`로 테스트 주소와 비공개 결과 폴더를 지정합니다. 테스트 세이브를 공개 서버에 올리는 절차가 아닙니다.

## 최종 검수 결과

- 실제 원본에서 4회 연속 진행: 리비전 **950 → 967 → 968 → 985 → 1002**, **35세·2044년 → 36세·2045년**. 매 단계 자동 저장과 메타데이터/실제 저장 해시 일치. 단독 HTML에서 페이지를 닫고 다시 열어 동일한 리비전 1002와 논리 해시를 불러왔습니다. [브라우저 결과](validation/release-2.14.3/browser.json).
- 진행 후 복구 아카이브를 다시 내보냈습니다. 원래 기준 스냅샷과 변경 원장 25개, 원본 Blob 파트 8개가 바이트 그대로 보존됐습니다. [원본 바이트 대조](validation/release-2.14.3/preserved-source-bytes.json).
- 진행 후 아카이브를 **전체 코어 검증으로 다시 읽고**, 원래 18시즌·클럽 602경기의 전체 필드 SHA-256과 원래 대표팀 과거 기록 47개의 전체 필드 SHA-256을 각각 대조했습니다. 두 해시 모두 일치합니다. 요약 숫자만 비교한 검사가 아닙니다. [원본](validation/release-2.14.3/original-audit.json), [진행 후](validation/release-2.14.3/progress-audit.json).
- 저장·변경 원장·압축/분할 읽기·복구·점진 해시·Worker 수명 관련 회귀 **43개 통과**. 마지막 전체 스냅샷 인코딩과 비동기 저장 Worker 검사 **2개 통과**. [43개](validation/release-2.14.3/storage-transfer.tap), [마지막 검사](validation/release-2.14.3/snapshot-final.tap).
- TypeScript, 웹 프로덕션 빌드, 단독 HTML/ZIP 빌드 통과. 최종 ZIP CRC와 내부 HTML/버전 확인. 새 점진 SHA-256 의존성의 MIT 라이선스를 단독 HTML과 ZIP에 동봉했습니다. 실 진행 검수 HTML과 최종 HTML은 추가된 비실행 라이선스 문구 외에 바이트가 동일합니다. [빌드](validation/release-2.14.3/build.txt), [아티팩트](validation/release-2.14.3/artifact.json).

검수는 Linux Chromium 154의 localhost에서 수행했습니다. 브라우저 힙 한도는 기본 실행과 검수 실행 모두 4,395,630,592바이트로 같았습니다. Windows Edge 사용자 환경의 직접 실행을 검수한 결과는 아닙니다.

관리형 Chromium의 `file://` 시작 검사는 브라우저 관리자 정책(`ERR_BLOCKED_BY_ADMINISTRATOR`)에 막혔습니다. 이 제한을 변경하지 않았으며, 실제 단독 HTML의 전체 세이브 검수는 localhost에서 완료했습니다. [시작 검사 기록](validation/release-2.14.3/file-startup.json).

## 배포

[K볼 2.14.3 ZIP 다운로드](https://raw.githubusercontent.com/rabbit1245/rabbit1245.github.io/44459afa8bda13b1c22edbcaa292cd8ae556fb62/Kball.zip) · 21,651,050바이트. 공개 URL에서 HTTP 200으로 다시 내려받아 SHA-256, ZIP CRC, 내부 HTML, 안내문 버전과 MIT 라이선스를 확인했습니다. [공개 다운로드 증거](validation/release-2.14.3/public-download.json).
