import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4194/Kball.html',out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/loading-2.11.2/after',source=process.env.KBALL_PERFORMANCE_SAVE||'test-results/coherence/large/career.json';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}),context=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce',acceptDownloads:true});
await context.addInitScript(()=>{
 window.__loadTiming=[];const W=window.Worker;let serial=0;
 window.Worker=new Proxy(W,{construct(T,args){const worker=new T(...args),index=++serial,post=worker.postMessage.bind(worker),start=new Map();worker.postMessage=function(data,...rest){start.set(data.id,{time:performance.now(),operation:data.operation??data.command?.type});const t=performance.now(),result=post(data,...rest);window.__loadTiming.push({kind:'copy-send',worker:index,operation:data.operation??data.command?.type,ms:performance.now()-t});return result;};worker.addEventListener('message',e=>{if(e.data.progress)return;const s=start.get(e.data.id);if(s){window.__loadTiming.push({kind:'worker',worker:index,operation:s.operation,ms:performance.now()-s.time,error:e.data.error});start.delete(e.data.id);}});return worker;}});
});
const p=await context.newPage(),errors=[],external=[],samples=[];p.setDefaultTimeout(240000);p.on('pageerror',e=>errors.push(String(e)));p.on('crash',()=>errors.push('renderer crash'));p.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)external.push(r.url());});
const browserCDP=await browser.newBrowserCDPSession();
async function ready(){await p.locator('.processing').waitFor({state:'hidden'});await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});assert.deepEqual(await p.getByRole('alert').allTextContents(),[]);}
async function timing(name,fn){await p.evaluate(()=>window.__loadTiming=[]).catch(()=>{});const t=Date.now();await fn();const sample={name,ms:Date.now()-t,workers:await p.evaluate(()=>window.__loadTiming)};samples.push(sample);console.log(name,sample.ms);await writeFile(path.join(out,'results.json'),JSON.stringify({browser:'Linux Chromium; localhost standalone HTML; not Windows Edge',url,source,sourceBytes:(await stat(source)).size,samples,errors,external},null,2));}
async function action(locator){await locator.click();await ready();}
async function metadata(){return p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['metadata','slots'],'readonly'),met=tx.objectStore('metadata').getAll(),slots=tx.objectStore('slots').getAll();tx.oncomplete=()=>{db.close();const m=met.result.find(x=>!x.deleted),s=slots.result.find(x=>x.id===m.id);resolve({year:m.year,revision:m.revision,ovr:m.ovr,bytes:s.blob.size,rawBytes:s.rawBytes,encoding:s.encoding,journal:s.journal.length});};};}));}
try{
 await timing('boot',async()=>{await p.goto(url,{waitUntil:'load'});await p.getByTestId('new-career').waitFor();});
 await timing('import-and-save',async()=>{await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(path.resolve(source));await ready();});
 await p.reload({waitUntil:'load'});await timing('load-slot',async()=>{await action(p.getByRole('button',{name:'이어서 플레이',exact:true}));});
 const initial=await metadata();
 await timing('training-open',async()=>{await p.getByTestId('player-tab').click();await p.getByTestId('player-view-training').click();await p.getByTestId('training-shooting').waitFor();});
 await timing('training-selection',async()=>{await p.getByTestId('training-shooting').click();assert.equal(await p.getByTestId('training-shooting').getAttribute('aria-pressed'),'true');});
 await timing('training-confirm',async()=>{await action(p.getByTestId('confirm-training'));});
 const trained=await metadata();assert.equal(trained.journal,1);assert.equal(trained.revision,initial.revision+1);
 await timing('transfer-open',async()=>{await p.getByTestId('transfer-window').click();await p.getByRole('dialog',{name:'계약과 다음 행선지'}).waitFor();await ready();});
 const dialog=p.getByRole('dialog',{name:'계약과 다음 행선지'}),renewal=dialog.locator('.offer').filter({hasText:'토트넘 홋스퍼'});assert.equal(await renewal.count(),1);
 await timing('transfer-accept',async()=>{await action(renewal.getByRole('button',{name:'제안 수락',exact:true}));});
 if(await dialog.isVisible())await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await timing('next-season',async()=>{await action(p.getByTestId('advance-half'));});assert.equal((await metadata()).year,initial.year+1);
 await timing('first-half',async()=>{await action(p.getByTestId('advance-half'));});
 await timing('second-half',async()=>{await action(p.getByTestId('advance-half'));});
 const progressed=await metadata();assert.equal(progressed.encoding,'gzip');assert.ok(progressed.rawBytes>initial.rawBytes);
 await timing('export-json',async()=>{await p.getByTestId('common-menu').click();const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('dialog').getByRole('button',{name:'JSON 내보내기',exact:true}).click()]);await d.saveAs(path.join(out,'progressed.json'));await p.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();});
 await p.reload({waitUntil:'load'});await timing('progressed-reload',async()=>{await action(p.getByRole('button',{name:'이어서 플레이',exact:true}));});assert.deepEqual(await metadata(),progressed);
 const targets=(await browserCDP.send('Target.getTargets')).targetInfos;assert.equal(targets.filter(t=>t.type==='worker').length,0,'large careers still release idle worker graphs');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await p.screenshot({path:path.join(out,'continued.png'),fullPage:false});
 await writeFile(path.join(out,'results.json'),JSON.stringify({browser:'Linux Chromium; localhost standalone HTML; not Windows Edge',url,source,sourceBytes:(await stat(source)).size,initial,trained,progressed,samples,retainedDedicatedWorkers:0,errors,external},null,2));
}catch(e){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(e),samples,errors},null,2));await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw e;}finally{await browser.close();}
