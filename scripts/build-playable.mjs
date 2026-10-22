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
const inlineWorkerPlugin = {
  name: 'portable-worker',
  setup(builder) {
    builder.onLoad({ filter: /[/\\]game[/\\]client\.ts$/ }, async args => {
      let contents = await readFile(args.path, 'utf8');
      const original = "worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });";
      if (!contents.includes(original)) throw new Error('Worker entry changed; review the portable Worker adapter.');
      contents = contents.replace(original, `
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
await writeFile(path.join(directory, '읽어주세요.txt'), `K볼 · 바로 플레이\n\n1. ZIP 압축을 풉니다.\n2. Kball.html을 최신 Chrome 또는 Edge로 엽니다.\n3. 새 커리어 시작을 누르면 됩니다.\n\n별도 서버·설치·로그인 없이 동작하도록 게임, 선수 데이터와 구단 로고를 파일 안에 포함했습니다.\n저장은 브라우저에 보관됩니다. 파일 이름·위치 또는 브라우저를 바꾸기 전에는 저장 관리에서 JSON으로 내보내세요.\n\n현재 버전: K볼 2.4 · 도움 배분·재능별 전성기 성장 개선, 시즌 우승·내 개인 수상 표시, 설정의 치트 모드(능력치 직접 증가·노화 중지), 원시 데이터 없는 한국어 은퇴 TXT. 구단명·국가 매칭과 누락 선수단 전력 생성 오류 수정. 구단 기본 전력을 유지하고 시즌 성과는 완만한 팀 성장으로 반영합니다. 기존 저장은 다음 진행부터 구단 전력 기준을 보정하며 선수 능력치·계약·과거 결과는 보존합니다. 실제 시즌 성과에 따른 구단 재투자·전력 변화, 전체 리그 순위와 승무패, 실제 리그 개인 순위, 성장·스카우팅 개선, 국대 본선 자격·전력 반영, 전체 커리어 TXT 한 번에 다운로드. 화이트 중심·연두 포인트 화면, 시즌 종료 이적·재계약, 실력·성과·나이·리더십에 따른 주장 제의 수락·거절, 상단 실제 참여 대회, 라커룸 하단 이번 시즌 클럽·국대 통합 세부 기록. 라커룸·선수·커리어 3개 메뉴, 반시즌 진행, 연간 훈련, 성장 원인·계약 이력, 국가대표 실경기, 승강과 지속 세계, 수상·은퇴 기록.\n실제 데이터는 기존 2024/FC25 기반입니다. 국대 예선·본선과 국가별 승강은 명시된 게임 모델로 단순화하며 실제 2026 규정을 모두 재현한 것은 아닙니다. 국내 컵·클럽 대륙대회는 포함하지 않습니다.\n\n글꼴: Pretendard · SIL Open Font License. FONT-LICENSE.txt에 라이선스를 동봉했습니다.\n`);
await writeFile(path.join(directory,'FONT-LICENSE.txt'),fontLicense);
execFileSync('python3', ['-c', `from pathlib import Path\nfrom zipfile import ZipFile, ZIP_DEFLATED\np=Path('play')\nwith ZipFile(p/'Kball.zip','w',compression=ZIP_DEFLATED,compresslevel=9) as z:\n    z.write(p/'Kball.html','Kball.html')\n    z.write(p/'읽어주세요.txt','읽어주세요.txt')\n    z.write(p/'FONT-LICENSE.txt','FONT-LICENSE.txt')\n`], { stdio: 'inherit' });
console.log(`Portable game: play/Kball.html (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB), play/Kball.zip`);
