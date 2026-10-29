import {chromium as engine} from 'playwright';

// Read-only test inspection of both legacy envelopes and durable Blob + journal records.
// This is injected by the test runner, never exposed by the application.
function install(){
 window.__readKballStored=async record=>{
  if(record.envelope)return record.envelope.career;
  const source=record.encoding==='gzip'?await new Response(record.blob.stream().pipeThrough(new DecompressionStream('gzip'))).text():await record.blob.text();
  const c=JSON.parse(source).career;
  for(const entry of record.journal??[])for(const patch of entry.patches){
   let parent=c;for(const key of patch.path.slice(0,-1))parent=parent[key];const key=patch.path.at(-1);
   if(patch.op==='delete')delete parent[key];else if(patch.op==='length')parent[key].length=patch.value;else parent[key]=structuredClone(patch.value);
  }
  return c;
 };
}
export const chromium={async launch(options){
 const browser=await engine.launch(options),newContext=browser.newContext.bind(browser),newPage=browser.newPage.bind(browser);
 browser.newContext=async options=>{const context=await newContext(options);await context.addInitScript(install);return context;};
 browser.newPage=async options=>{const page=await newPage(options);await page.addInitScript(install);return page;};
 return browser;
}};
