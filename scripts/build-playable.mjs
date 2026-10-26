import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const directory = path.resolve('play');
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const crestCatalogue = JSON.parse(await readFile('src/game/catalog.json', 'utf8'));
const crestCount = crestCatalogue.clubs.filter(club => club[7]).length;
const missingCrestCount = crestCatalogue.clubs.length - crestCount;
const crestAdditions = JSON.parse(await readFile('data/crest-additions-2.9.1.json', 'utf8'));
const originalCrestCount = crestAdditions.clubs.filter(club => club.method === 'original-kball-crest').length;
const checkOnly = process.argv.includes('--check-only');

function cataloguePlugin(embedCrests) {
  return {
    name: 'portable-catalogue',
    setup(builder) {
      builder.onLoad({ filter: /[/\\]game[/\\]catalog\.json$/ }, async args => {
        const catalogue = JSON.parse(await readFile(args.path, 'utf8'));
        for (const club of catalogue.clubs) {
          if (embedCrests && club[7]) {
            const svg = await readFile(club[7]);
            club[7] = `data:image/svg+xml;base64,${svg.toString('base64')}`;
          } else club[7] = null;
        }
        return { contents: JSON.stringify(catalogue), loader: 'json' };
      });
    },
  };
}

const shared = { bundle: true, minify: true, write: false, target: 'es2022', platform: 'browser', logLevel: 'warning' };
const worker = await build({ ...shared, entryPoints: ['src/game/worker.ts'], format: 'iife', plugins: [cataloguePlugin(false)] });
const workerSource = worker.outputFiles[0].text;
new Function(workerSource); // Parse before embedding; never interpret replacement metacharacters in generated code.
const saveWorker=await build({...shared,entryPoints:['src/game/save-worker.ts'],format:'iife',plugins:[cataloguePlugin(false),{name:'no-nested-save-worker',setup(builder){builder.onLoad({filter:/save-preparation\.ts$/},()=>({contents:"export function prepareSaveOffThread(){throw new Error('저장 Worker 중첩 요청');} export const decodeSaveOffThread=prepareSaveOffThread,checkpointOffThread=prepareSaveOffThread,verifyFileOffThread=prepareSaveOffThread; export function cancelCheckpointPreparation(){}",loader:'ts'}));}}]});
const saveWorkerSource=saveWorker.outputFiles[0].text;
new Function(saveWorkerSource);
const inlineWorkerPlugin = {
  name: 'portable-worker',
  setup(builder) {
    builder.onLoad({filter:/save-preparation\.ts$/},async args=>{
      let contents=await readFile(args.path,'utf8');
      const original="worker = new Worker(new URL('./save-worker.ts', import.meta.url), { type: 'module' });";
      if(!contents.includes(original))throw new Error('Review portable save worker adapter');
      contents=contents.replace(original,()=>`const blobURL=URL.createObjectURL(new Blob([${JSON.stringify(saveWorkerSource)}],{type:'text/javascript'}));worker=new Worker(blobURL);setTimeout(()=>URL.revokeObjectURL(blobURL),30000);`);
      return {contents,loader:'ts',resolveDir:path.dirname(args.path)};
    });
    builder.onLoad({ filter: /[/\\]game[/\\]client\.ts$/ }, async args => {
      let contents = await readFile(args.path, 'utf8');
      const original = "worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });";
      if (!contents.includes(original)) throw new Error('Worker entry changed; review the portable Worker adapter.');
      contents = contents.replace(original, () => `
        const blobURL = URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], {type:'text/javascript'}));
        worker = new Worker(blobURL);
        setTimeout(() => URL.revokeObjectURL(blobURL), 30_000);
      `);
      return { contents, loader: 'ts', resolveDir: path.dirname(args.path) };
    });
  },
};
const application = await build({
  ...shared,
  entryPoints: ['src/main.tsx'],
  outfile: path.join(directory, 'bundle.js'),
  format: 'iife',
  loader: { '.woff2': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.PROD': 'false' },
  plugins: [cataloguePlugin(true), inlineWorkerPlugin],
});
const javascript = application.outputFiles.find(file => file.path.endsWith('.js'));
const css = application.outputFiles.find(file => file.path.endsWith('.css'));
if (!javascript || !css) throw new Error('Missing portable application outputs.');
if (checkOnly) {
  new Function(javascript.text);
  console.log('Portable application and both Blob Worker adapters validated; no HTML or ZIP written.');
  process.exit(0);
}
await mkdir(directory, { recursive: true });
const compressed = gzipSync(javascript.contents, { level: 9 }).toString('base64');
const fontLicense = await readFile('public/FONT-LICENSE.txt','utf8');
const crestLicense = await readFile('public/CREST-LICENSE.txt','utf8');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>K볼 — 바로 플레이</title><meta name="theme-color" content="#ffffff"><style>${css.text}</style></head>
<body><div id="root"><div style="padding:12vh 8vw;font-family:system-ui,sans-serif;color:#13221d"><h1>K볼</h1><p id="boot-status">당신의 축구 인생을 준비하고 있습니다…</p></div></div>
<script>
(async () => {
  try {
    if (!globalThis.DecompressionStream) throw new Error('최신 Chrome 또는 Edge에서 열어 주세요.');
    const binary = atob('${compressed}');
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const source = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const script = document.createElement('script');
    script.textContent = source;
    document.body.appendChild(script);
  } catch (error) {
    document.getElementById('boot-status').textContent = '실행하지 못했습니다. ' + error.message;
  }
})();
</script><script type="text/plain" id="font-license">${fontLicense.replace(/<\/script/gi,'<\\/script')}</script><script type="text/plain" id="crest-license">${crestLicense.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
await writeFile(path.join(directory, 'Kball.html'), html);
await writeFile(path.join(directory, '읽어주세요.txt'), `K볼 · 바로 플레이\n\n1. ZIP 압축을 풉니다.\n2. Kball.html을 최신 Chrome 또는 Edge로 엽니다.\n3. 새 커리어 시작을 누르면 됩니다.\n\n별도 서버·설치·로그인 없이 동작하도록 게임, 선수 데이터와 구단 로고를 파일 안에 포함했습니다.\n저장은 브라우저에 보관됩니다. 파일 이름·위치 또는 브라우저를 바꾸기 전에는 저장 관리에서 JSON으로 내보내세요.\n\n현재 버전: K볼 ${version}\n플레이스타일은 훈련창 하단에서 최대 5개를 선택합니다. 선택만으로 능력치·OVR이 오르지 않으며, 해당 능력치의 성장 상한이 110으로 열립니다. 포지션 핵심 5개를 실제로 육성하면 OVR 120에 도달할 수 있습니다. 스킬은 삭제할 수 있고 100 초과 숙련은 종료되며 변경 전 수치는 저장 이력에 보존됩니다. 은퇴 기록에는 보유한 연도별 플레이스타일만 표시하며 통산에는 넣지 않습니다. 낭만 평가의 점수·서사는 은퇴 기록에 출력하지 않습니다.\n발롱도르·FIFA 올해의 선수·FIFA Men's 11·FIFPRO 월드 11·야신·FIFA 골키퍼·코파·유러피언 골든슈는 구분합니다. 수상은 게임 내 실제 경기 기록으로 평가한 모형이며 실제 공식 투표 결과를 뜻하지 않습니다.\n훈련에 체크한 능력치만 자동 성장합니다. 체크하지 않은 능력치는 훈련·출전 경험·자연 발달로 증가하지 않습니다. 0개 선택으로 시작하거나 다음 시즌에 넘어갈 수 있으며, 미확정 훈련 계획은 선택 없이 다음 시즌을 시작합니다.\n초록색 자물쇠는 자동 변동을 막습니다. 전체 잠금을 다시 누르면 모두 해제됩니다. 직접 누른 수동 노화는 잠금 중에도 적용되고 잠금은 유지됩니다.\n모바일 순위표·경기 목록에서 로고를 숨기던 스타일을 제거했습니다. 파리·인테르와 소규모 구단의 실제 엠블럼을 모바일·다운로드판에서 검증합니다.\n현재 명단 ${crestCatalogue.clubs.length}개 구단 중 ${crestCount}개에 구단 배지를 연결했습니다. 기존·구버전·전신 구단 자료 ${crestCount - originalCrestCount}개와 사용자 요청으로 만든 비공식 창작 SVG ${originalCrestCount}개를 포함합니다(일부 리저브 공용). ${missingCrestCount ? `아직 확보하지 못한 ${missingCrestCount}개는 중립 아이콘입니다.` : `누락된 구단 로고는 없습니다.`} 로고는 HTML 안에 포함되어 오프라인에서도 표시됩니다.\n\n환경설정에서 치트를 켜면 훈련의 노화 버튼 왼쪽에 치트 버튼이 생깁니다. +1/+5/+10 선택 후 능력치를 누르면 일반 100, 스킬 110 상한까지 증가합니다. 작은 성장분도 누적하여 스킬이 100 부근에서 반올림으로 멈추지 않습니다.
훈련의 노화 버튼 → −1/−5/−10 선택 → 원하는 능력치 클릭: 해당 항목만 감소합니다. 자물쇠를 켠 능력치는 훈련·경기 성장·치트 조정에서 고정됩니다. 수동 노화와 부상 처리는 잠금 중에도 사용할 수 있고 잠금은 유지됩니다. 나이 증가에 따른 자동 능력치 감소는 없습니다.\n라커룸의 부상 버튼에서 클럽 5·10·20경기 또는 시즌 남은 전체 경기를 선택합니다. 전·후반기 시작 전 선택하며 오프시즌에는 다음 시즌을 예약합니다. 해당 기간 국대도 출전 제외됩니다. 팀 경기는 정상 진행하고 클럽·국대 실제 결장 수와 시즌 전체 결장을 은퇴 기록에 남깁니다. 자동 능력치 감소는 없으며 수동 노화만 능력치를 깎습니다. 이전 형식의 182/365일 부상 저장은 기존 기간을 보존합니다.\n\n작은 잠금·훈련·치트 변경은 먼저 안전하게 저장하고 전체 기록은 배경에서 합쳐 장기 저장의 클릭 지연을 줄였습니다. 실제 경기 계산과 과거 세부 기록은 유지합니다. 은퇴 TXT는 기본 정보·통산·연도별 기록·팀과 개인 수상·결승 결과로 정리했습니다.\n이적 제안 옆에 소속 리그와 국가를 표시하며 현재 주급·역할·기량 변화·수요·예산에 맞게 주급을 제안합니다. FA는 이적료 없이 합류하며 FA의 시즌 중 계약은 같은 시즌 달력을 쓰는 리그에서 제안합니다. 계약 만료 시 재계약을 강제하지 않고 FA로 전환합니다. 이적 창의 직접 계약 해지로도 FA가 될 수 있습니다. 무소속 중에는 클럽 출전·주급 없이 반 시즌씩 진행하고 전·후반기 소속 기간을 은퇴 기록에 남깁니다. 외부 이적 제안 6개, 재계약은 별도입니다. 금액은 저장된 유로를 게임 고정 환율 1유로=1,500원으로 환산해 표시하며 원본 계산은 유지합니다. 구단·리그·월간·국대 수상과 유니폼 판매 예상 순위를 실제 경기 기록으로 평가하고 언론·클럽 평가 모형과 실존 수상 명칭을 구별합니다.\n국내 컵 17개와 UEFA 3개에 AFC 엘리트·리베르타도레스·CONCACAF 챔피언스컵·CAF 챔피언스리그·OFC 챔피언스리그를 연결했습니다. 직전 실제 우승자가 있을 때 국내/UEFA 슈퍼컵과 연례 FIFA 인터컨티넨털컵을 편성합니다. FIFA 클럽 월드컵은 2029년부터 4년 주기, 대륙별 자격으로 32팀·8개조·16강·결승 63경기를 진행합니다. 미래 개최국·일부 예선·미지원 국가 참가권·소속 리그에 따른 개최일·연장 생략은 표시된 게임 모형입니다. 미지원 국가의 초청 구단은 실존 구단명·추정 전력·(가상) 선수단을 쓰며 국내 리그 성적을 생성하지 않습니다.\nK3→K2는 연도별 라이선스 승인 명단과 결정전 규정 원문이 확인되어야 실제 결정전과 승강을 적용합니다. 현재 승인 명단이 미확인인 연도는 판정 보류 사유를 표시하며 우승만으로 강제 승격하지 않습니다. K4는 현재 명단에 없어 미지원입니다. 다른 국가의 기존 승강 모델은 플레이오프·연도별 규정 일부를 단순화합니다.\n기존 2024/FC25 국내 명단과 기존 저장은 유지됩니다. 공식 로고를 확보하지 못한 구단에는 중립 아이콘을 표시합니다. 진행 중 시즌에 새 국제대회나 과거 수상을 소급 생성하지 않으며 다음 시즌부터 적용합니다. 파일 이름·위치·브라우저를 바꾸기 전에 JSON 백업을 보관하세요.\n\n글꼴: Pretendard · SIL Open Font License. FONT-LICENSE.txt에 라이선스를 동봉했습니다.\n구단 SVG 출처와 저장소 라이선스는 CREST-LICENSE.txt에 동봉했습니다.\n`);
await writeFile(path.join(directory,'FONT-LICENSE.txt'),fontLicense);
await writeFile(path.join(directory,'CREST-LICENSE.txt'),crestLicense);
execFileSync('python3', ['-c', `from pathlib import Path\nfrom zipfile import ZipFile, ZIP_DEFLATED\np=Path('play')\nwith ZipFile(p/'Kball.zip','w',compression=ZIP_DEFLATED,compresslevel=9) as z:\n    z.write(p/'Kball.html','Kball.html')\n    z.write(p/'읽어주세요.txt','읽어주세요.txt')\n    z.write(p/'FONT-LICENSE.txt','FONT-LICENSE.txt')\n    z.write(p/'CREST-LICENSE.txt','CREST-LICENSE.txt')\n`], { stdio: 'inherit' });
console.log(`Portable game: play/Kball.html (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB), play/Kball.zip`);
