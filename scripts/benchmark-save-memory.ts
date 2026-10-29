import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const file=process.env.KBALL_SAVE_BENCHMARK_SOURCE||'test-results/release-2.11.0/actual/career-5.json';
async function main(){
 if(process.argv.includes('--child')){
  const label=process.argv.at(-1)!,root=label==='before'?'/workspace/kball-2110-baseline':process.cwd(),storage=await import(pathToFileURL(`${root}/src/game/storage.ts`).href);
  let text=await readFile(file,'utf8');const bytes=Buffer.byteLength(text),c=JSON.parse(text).career;text='';global.gc?.();const startMemory=process.memoryUsage(),start=performance.now();
  const envelope=await storage.prepareEnvelope(c,label==='after'),elapsedMs=performance.now()-start,endMemory=process.memoryUsage();global.gc?.();
  console.log(JSON.stringify({label,bytes,elapsedMs,startMemory,endMemory,retainedMemory:process.memoryUsage(),peakRSS:process.resourceUsage().maxRSS*1024,hash:envelope.hash,ownedReference:envelope.career===c}));return;
 }
 const runs=[];for(let trial=0;trial<3;trial++)for(const label of trial%2?['after','before']:['before','after']){
  const r=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=3072','--import','tsx','scripts/benchmark-save-memory.ts','--child',label],{encoding:'utf8',maxBuffer:1024*1024});
  if(r.status!==0)throw Error(r.stderr||r.stdout||'save benchmark child failed');const row=JSON.parse(r.stdout.trim());runs.push({...row,trial});console.log(label,trial,Math.round(row.elapsedMs),row.peakRSS);
 }
 const median=(ns:number[])=>[...ns].sort((a,b)=>a-b)[1],summary=Object.fromEntries(['before','after'].map(label=>[label,{medianMs:median(runs.filter(r=>r.label===label).map(r=>r.elapsedMs)),medianPeakRSS:median(runs.filter(r=>r.label===label).map(r=>r.peakRSS))}]));
 if(new Set(runs.map(r=>r.hash)).size!==1)throw Error('The complete canonical checksums differ');
 const out='test-results/release-2.11.0';await mkdir(out,{recursive:true});await writeFile(`${out}/save-memory.json`,JSON.stringify({baseline:'2.10.2',version:'2.11.0',conditions:'Five actual seasons, identical JSON-owned Worker payload, isolated Node 20 processes, 3 alternating trials, full validation and canonical checksum in both versions; not a Windows Edge memory measurement.',allChecksumsIdentical:true,summary,runs},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
