import {build} from 'esbuild';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';

// Exercise the portable save adapter without creating a playable HTML or ZIP.
const shared={bundle:true,minify:true,write:false,platform:'browser',target:'es2022',format:'iife'};
const worker=await build({...shared,entryPoints:['src/game/save-worker.ts'],plugins:[{name:'no-nested-save-worker',setup(b){b.onLoad({filter:/save-preparation\.ts$/},()=>({contents:"export function prepareSaveOffThread(){throw Error('nested Worker');}export const decodeSaveOffThread=prepareSaveOffThread,checkpointOffThread=prepareSaveOffThread,verifyFileOffThread=prepareSaveOffThread,exportJSONOffThread=prepareSaveOffThread;export function cancelCheckpointPreparation(){}",loader:'ts'}));}}]});
const source=worker.outputFiles[0].text;
new Function(source);
const adapter=await build({...shared,stdin:{contents:"import * as rpc from './src/game/save-preparation';globalThis.__saveRPC=rpc;",resolveDir:process.cwd()},plugins:[{name:'portable-worker-adapter',setup(b){b.onLoad({filter:/save-preparation\.ts$/},async args=>{
 const original="worker = new Worker(new URL('./save-worker.ts', import.meta.url), { type: 'module' });";
 const code=await readFile(args.path,'utf8');assert.ok(code.includes(original));
 return {contents:code.replace(original,()=>`const blobURL=URL.createObjectURL(new Blob([${JSON.stringify(source)}],{type:'text/javascript'}));worker=new Worker(blobURL);setTimeout(()=>URL.revokeObjectURL(blobURL),30000);`),resolveDir:path.dirname(args.path),loader:'ts'};
});}}]});
const fixture=gunzipSync(await readFile('tests/fixtures/v272-offseason.json.gz')).toString('utf8'),envelope=JSON.parse(fixture);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.route('**/portable-worker-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><title>저장 Worker 검사</title></html>'}));
 await page.goto(new URL('/portable-worker-harness',process.env.KBALL_TEST_URL||'http://127.0.0.1:4173/').href);
 await page.addScriptTag({content:adapter.outputFiles[0].text});
 const result=await page.evaluate(async text=>{
  const c=await window.__saveRPC.verifyFileOffThread(text),prepared=await window.__saveRPC.prepareSaveOffThread(c);
  const decoded=await window.__saveRPC.decodeSaveOffThread(prepared.record);
  const bytes=new TextEncoder().encode(JSON.stringify(decoded.career)),digest=await crypto.subtle.digest('SHA-256',bytes);
  return {format:prepared.record.format,isBlob:prepared.record.blob instanceof Blob,blobBytes:prepared.record.blob.size,canonicalHash:prepared.record.hash,returnedFullCareer:'career' in prepared,revision:decoded.career.revision,roundTripSHA256:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};
 },fixture);
 assert.equal(result.format,'kball-blob-v1');assert.equal(result.isBlob,true);assert.equal(result.returnedFullCareer,false);assert.equal(result.canonicalHash,envelope.hash);
 assert.equal(result.roundTripSHA256,createHash('sha256').update(JSON.stringify(envelope.career)).digest('hex'));assert.deepEqual(errors,[]);
 const out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/pending-performance/blob-worker';await mkdir(out,{recursive:true});
 await writeFile(path.join(out,'results.json'),JSON.stringify({...result,errors,fileProtocolTested:false},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
