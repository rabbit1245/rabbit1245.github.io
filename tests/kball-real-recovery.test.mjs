import {chromium} from 'playwright';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const url=process.env.KBALL_TEST_URL||'http://localhost:8189/Kball.html';
const recoveryFile=process.env.KBALL_RECOVERY_FILE;
const results=path.resolve(process.env.KBALL_TEST_RESULTS_DIR||'test-results/real-recovery');
const commands=Number(process.env.KBALL_TEST_COMMANDS??4);
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||
 (process.env.PLAYWRIGHT_BROWSERS_PATH?undefined:'/usr/bin/chromium');
const timeout=360_000;
const report={url,steps:[]};
await mkdir(results,{recursive:true});
const profile=await mkdtemp(path.join(results,'browser-'));
let context;

async function open(){
 context=await chromium.launchPersistentContext(profile,{executablePath,headless:true,reducedMotion:'reduce'});
 const page=context.pages()[0]??await context.newPage();
 page.on('pageerror',error=>{report.pageErrors??=[];report.pageErrors.push(String(error));});
 page.on('crash',()=>{report.crashed=true;});
 await page.goto(url);
 await page.getByTestId('new-career').waitFor();
 return page;
}

async function seed(page){
 if(recoveryFile){
  await page.evaluate(()=>{
   const input=document.createElement('input');
   input.type='file';
   input.id='private-fixture';
   document.body.append(input);
  });
  await page.locator('#private-fixture').setInputFiles(recoveryFile);
 }
 await page.evaluate(async useFile=>{
  // Prefer a File from Playwright so the user's archive never needs to be served.
  const blob=useFile?document.querySelector('#private-fixture').files[0]
   :await(await fetch(new URL('user-recovery.bin',location.href))).blob();
  const magic='KBALL-RECOVERY-V1\n';
  if(await blob.slice(0,magic.length).text()!==magic)throw Error('Unexpected recovery file');
  const header=magic.length+4;
  const length=new DataView(await blob.slice(magic.length,header).arrayBuffer()).getUint32(0,true);
  const manifest=JSON.parse(await blob.slice(header,header+length).text());
  let offset=header+length;
  const parts=manifest.parts.map(part=>{
   const slice=blob.slice(offset,offset+part.bytes,part.type);
   offset+=part.bytes;
   return slice;
  });
  const restore=source=>{
   const row=source.data;
   return {...row,blob:parts[row.blob.index],journal:row.journal.map(entry=>entry.kind==='game-delta'
    ?{...entry,payload:{...entry.payload,blob:parts[entry.payload.blob.index]}}:entry)};
  };
  await new Promise((resolve,reject)=>{
   const request=indexedDB.open('kball-careers',1);
   request.onupgradeneeded=()=>{
    for(const name of ['slots','metadata','backups'])if(!request.result.objectStoreNames.contains(name))
     request.result.createObjectStore(name,{keyPath:'id'});
   };
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction(['slots','metadata','backups'],'readwrite');
    tx.objectStore('slots').put(restore(manifest.current));
    tx.objectStore('metadata').put(manifest.metadata);
    if(manifest.backup)tx.objectStore('backups').put(restore(manifest.backup));
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onabort=()=>{db.close();reject(tx.error);};
   };
  });
 },!!recoveryFile);
}

function head(page){
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('kball-careers');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   const db=request.result,tx=db.transaction(['slots','metadata']);
   const slots=tx.objectStore('slots').getAll(),meta=tx.objectStore('metadata').getAll();
   tx.oncomplete=()=>{
    db.close();
    const stored=slots.result[0],metadata=meta.result[0],tail=stored.journal.at(-1);
    const hash=tail?.hash??stored.versionHash;
    resolve({revision:tail?.revision??stored.revision,hash,checkpoint:stored.revision,journal:stored.journal.length,
     age:metadata.age,year:metadata.year,metadataMatchesHash:metadata.hash===hash});
   };
   tx.onabort=()=>{db.close();reject(tx.error);};
  };
 }));
}
async function resume(page){
 const start=Date.now();
 await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();
 await page.getByTestId('advance-half').waitFor({timeout});
 assert.deepEqual(await page.getByRole('alert').allTextContents(),[]);
 return Date.now()-start;
}
const writeReport=()=>writeFile(path.join(results,'results.json'),JSON.stringify(report,null,2));

try{
 let page=await open();
 report.browser=context.browser()?.version()??await page.evaluate(()=>navigator.userAgent);
 report.protocol=await page.evaluate(()=>location.protocol);
 await seed(page);
 await page.reload();
 await page.evaluate(()=>{
  window.measuredLoadPhases=[];
  window.addEventListener('kball-loading',event=>{
   const phase=event.detail.phase;
   if(window.measuredLoadPhases.at(-1)?.phase!==phase)
    window.measuredLoadPhases.push({phase,ms:Math.round(performance.now())});
  });
 });
 report.initialLoadMs=await resume(page);
 report.loadPhases=await page.evaluate(()=>window.measuredLoadPhases);
 report.initial=await head(page);
 assert.ok(report.initial.metadataMatchesHash);
 console.log('INITIAL',JSON.stringify({ms:report.initialLoadMs,...report.initial}));
 await writeReport();
 for(let step=0;step<commands;step++){
  const advance=page.getByTestId('advance-half');
  const action=await advance.innerText();
  const start=Date.now();
  await advance.click({timeout});
  await page.locator('.processing').waitFor({state:'hidden',timeout});
  assert.deepEqual(await page.getByRole('alert').allTextContents(),[]);
  assert.match(await page.getByTestId('save-status').innerText(),/자동 저장됨/);
  const saved=await head(page);
  assert.ok(saved.metadataMatchesHash);
  assert.ok(saved.revision>(report.steps.at(-1)?.revision??report.initial.revision));
  const result={action,ms:Date.now()-start,...saved};
  report.steps.push(result);
  console.log('SAVED',JSON.stringify(result));
  await writeReport();
 }
 const beforeClose=await head(page);
 if(commands){
  assert.equal(beforeClose.age,report.initial.age+1);
  assert.equal(beforeClose.year,report.initial.year+1);
  await page.getByTestId('common-menu').click();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'원본 저장 보관',exact:true}).click();
  await (await download).saveAs(path.join(results,'progress.kball-recovery'));
 }
 await context.close();
 context=undefined;
 page=await open();
 report.reconnectMs=await resume(page);
 report.reconnect=await head(page);
 assert.deepEqual(report.reconnect,beforeClose);
 assert.deepEqual(report.pageErrors??[],[]);
 assert.ok(!report.crashed);
 report.passed=true;
 console.log('RECONNECTED',JSON.stringify({ms:report.reconnectMs,...report.reconnect}));
 await writeReport();
}catch(error){
 report.error=String(error);
 await writeReport();
 throw error;
}finally{
 await context?.close();
 await rm(profile,{recursive:true,force:true});
}
