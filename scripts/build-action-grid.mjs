import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out='test-results/release-2.10.0',baseline=process.env.KBALL_ACTION_BASELINE||'/workspace/kball-action-benchmark/baseline';
const result=await build({entryPoints:['tests/action-grid-fixture.tsx'],bundle:true,write:false,outfile:`${out}/grid.js`,format:'iife',minify:true,jsx:'automatic',loader:{'.woff2':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'baseline-metrics',setup(b){b.onResolve({filter:/^baseline-stats$/},()=>({path:path.resolve(baseline,'src/components/StatsNine.tsx')}));}}]});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
await writeFile(`${out}/grid.html`,`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></html>`);
