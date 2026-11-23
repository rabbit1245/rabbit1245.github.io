import {chromium as engine} from 'playwright';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

// Read-only test inspection of both legacy envelopes and durable Blob + journal records.
// This is injected by the test runner, never exposed by the application.
function install(decodeArchiveWire){
 const readJSON=async record=>JSON.parse(record.encoding==='gzip'
  ?await new Response(record.blob.stream().pipeThrough(new DecompressionStream('gzip'))).text()
  :await record.blob.text());
 window.__readKballStored=async record=>{
  if(record.envelope)return record.envelope.career;
  let c=(await readJSON(record)).career;
  for(const entry of record.journal??[]){
   if(entry.kind==='game-delta'){
    const p=entry.payload;
    const wire=p.format==='kball-game-delta-v2'?await decodeArchiveWire(p.blob):await readJSON(p);
    for(const ref of wire.reuse){let value=c;for(const k of ref.source)value=value[k];let parent=wire.career;for(const k of ref.target.slice(0,-1))parent=parent[k];parent[ref.target.at(-1)]=value;}
    c=wire.career;continue;
   }
   for(const patch of entry.patches){
   let parent=c;for(const key of patch.path.slice(0,-1))parent=parent[key];const key=patch.path.at(-1);
   if(patch.op==='delete')delete parent[key];else if(patch.op==='length')parent[key].length=patch.value;else parent[key]=structuredClone(patch.value);
  }
  }
  return c;
 };
}

let installSource;
export const chromium={async launch(options){
 const content=await (installSource??=build({
  stdin:{
   contents:`import {decodeArchiveWire} from './src/game/archive-wire.ts';\n(${install.toString()})(decodeArchiveWire);`,
   resolveDir:fileURLToPath(new URL('../',import.meta.url)),
  },
  bundle:true,platform:'browser',format:'iife',minify:true,write:false,
 }).then(result=>result.outputFiles[0].text));
 const browser=await engine.launch(options),newContext=browser.newContext.bind(browser),newPage=browser.newPage.bind(browser);
 browser.newContext=async options=>{const context=await newContext(options);await context.addInitScript({content});return context;};
 browser.newPage=async options=>{const page=await newPage(options);await page.addInitScript({content});return page;};
 return browser;
}};
