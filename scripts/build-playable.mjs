import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const directory = path.resolve('play');
await mkdir(directory, { recursive: true });

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
const saveWorker=await build({...shared,entryPoints:['src/game/save-worker.ts'],format:'iife',plugins:[cataloguePlugin(false),{name:'no-nested-save-worker',setup(builder){builder.onLoad({filter:/save-preparation\.ts$/},()=>({contents:"export function prepareSaveOffThread(){throw new Error('저장 검사 Worker 내부의 잘못된 중첩 요청입니다.');}",loader:'ts'}));}}]});
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
const compressed = gzipSync(javascript.contents, { level: 9 }).toString('base64');
const fontLicense = await readFile('public/FONT-LICENSE.txt','utf8');
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
</script><script type="text/plain" id="font-license">${fontLicense.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
await writeFile(path.join(directory, 'Kball.html'), html);
await writeFile(path.join(directory, '읽어주세요.txt'), `K볼 · 바로 플레이\n\n1. ZIP 압축을 풉니다.\n2. Kball.html을 최신 Chrome 또는 Edge로 엽니다.\n3. 새 커리어 시작을 누르면 됩니다.\n\n별도 서버·설치·로그인 없이 동작하도록 게임, 선수 데이터와 구단 로고를 파일 안에 포함했습니다.\n저장은 브라우저에 보관됩니다. 파일 이름·위치 또는 브라우저를 바꾸기 전에는 저장 관리에서 JSON으로 내보내세요.\n\n현재 버전: K볼 2.7\n\n훈련의 노화 버튼 → −1/−5/−10 선택 → 원하는 능력치 클릭: 해당 항목만 감소합니다. 자물쇠를 켠 능력치는 훈련·경기 성장·부상 저하·수동 노화·치트 조정에서 고정됩니다. 나이 증가에 따른 자동 능력치 감소는 없습니다.\n부상 버튼의 반 시즌/한 시즌은 182일/365일 동안 출전을 막고 팀 경기를 진행합니다. 시즌이 끝나면 이적·훈련을 결정한 뒤 다음 시즌에서 남은 기간을 이어갑니다. 기존 기록·부상 이력·복귀일은 보존됩니다.\n외부 이적 제안 6개(동급 3·하위 1·상위 1·극단적 랜덤 1), 재계약은 별도입니다. 금액은 저장된 유로를 게임 고정 환율 1유로=1,500원으로 환산해 표시하며 원본 계산은 유지합니다. 구단·리그·월간·국대 수상과 유니폼 판매 예상 순위를 실제 경기 기록으로 평가하고 K볼 자체 선정과 공식 수상 명칭을 구별합니다.\n국내 컵 17개와 UEFA 3개에 AFC 엘리트·리베르타도레스·CONCACAF 챔피언스컵·CAF 챔피언스리그·OFC 챔피언스리그를 연결했습니다. 직전 실제 우승자가 있을 때 국내/UEFA 슈퍼컵과 연례 FIFA 인터컨티넨털컵을 편성합니다. FIFA 클럽 월드컵은 2029년부터 4년 주기, 대륙별 자격으로 32팀·8개조·16강·결승 63경기를 진행합니다. 미래 개최국·일부 예선·미지원 국가 참가권·소속 리그에 따른 개최일·연장 생략은 표시된 게임 모형입니다. 미지원 국가의 초청 구단은 실존 구단명·추정 전력·(가상) 선수단을 쓰며 국내 리그 성적을 생성하지 않습니다.\nK3→K2는 연도별 라이선스 승인 명단과 결정전 규정 원문이 확인되어야 실제 결정전과 승강을 적용합니다. 현재 승인 명단이 미확인인 연도는 판정 보류 사유를 표시하며 우승만으로 강제 승격하지 않습니다. K4는 현재 명단에 없어 미지원입니다. 다른 국가의 기존 승강 모델은 플레이오프·연도별 규정 일부를 단순화합니다.\n기존 2024/FC25 국내 명단과 기존 저장은 유지됩니다. 공식 로고를 확보하지 못한 구단에는 중립 아이콘을 표시합니다. 진행 중 시즌에 새 국제대회나 과거 수상을 소급 생성하지 않으며 다음 시즌부터 적용합니다. 파일 이름·위치·브라우저를 바꾸기 전에 JSON 백업을 보관하세요.\n\n글꼴: Pretendard · SIL Open Font License. FONT-LICENSE.txt에 라이선스를 동봉했습니다.\n`);
await writeFile(path.join(directory,'FONT-LICENSE.txt'),fontLicense);
execFileSync('python3', ['-c', `from pathlib import Path\nfrom zipfile import ZipFile, ZIP_DEFLATED\np=Path('play')\nwith ZipFile(p/'Kball.zip','w',compression=ZIP_DEFLATED,compresslevel=9) as z:\n    z.write(p/'Kball.html','Kball.html')\n    z.write(p/'읽어주세요.txt','읽어주세요.txt')\n    z.write(p/'FONT-LICENSE.txt','FONT-LICENSE.txt')\n`], { stdio: 'inherit' });
console.log(`Portable game: play/Kball.html (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB), play/Kball.zip`);
