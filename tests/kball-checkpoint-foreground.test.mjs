import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4194/Kball.html';
const source=process.env.KBALL_PERFORMANCE_SAVE||'test-results/coherence/large/career.json';
const out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/late-2114/foreground';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'});
const context=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'});
await context.addInitScript(()=>{
 window.__checkpointTrace=[];const W=window.Worker;let serial=0;
 window.Worker=new Proxy(W,{construct(T,args){
  const w=new T(...args),id=++serial,post=w.postMessage.bind(w),terminate=w.terminate.bind(w),operations=new Map();
  w.postMessage=function(data,...rest){const op=data.operation??data.command?.type;operations.set(data.id,op);window.__checkpointTrace.push({kind:'send',id,op});return post(data,...rest);};
  w.addEventListener('message',e=>{if(!e.data.progress)window.__checkpointTrace.push({kind:'done',id,op:operations.get(e.data.id),error:e.data.error});});
  w.terminate=()=>{window.__checkpointTrace.push({kind:'stop',id});return terminate();};return w;
 }});
});
const p=await context.newPage(),errors=[];p.setDefaultTimeout(180000);p.on('pageerror',e=>errors.push(String(e)));
async function ready(){await p.locator('.processing').waitFor({state:'hidden'});await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor();assert.deepEqual(await p.getByRole('alert').allTextContents(),[]);}
async function summary(){return p.evaluate(()=>new Promise((resolve,reject)=>{
 const r=indexedDB.open('kball-careers');r.onerror=()=>reject(r.error);r.onsuccess=()=>{
  const db=r.result,tx=db.transaction('slots'),get=tx.objectStore('slots').getAll();
  tx.oncomplete=async()=>{db.close();try{const record=get.result[0],c=await window.__readKballStored(record);resolve({revision:c.revision,journal:record.journal.length,club:c.player.clubId,locks:c.systems.attributeLocks,history:c.history.map(h=>({year:h.year,stats:h.stats,matches:h.matches.map(m=>m.fixtureId)})),stats:c.season.playerStats});}catch(e){reject(e);}};
 };
}));}
try{
 await p.goto(url,{waitUntil:'load'});await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(source);await ready();const before=await summary();
 await p.getByTestId('player-tab').click();await p.getByTestId('player-view-training').click();await p.getByTestId('lock-shooting').click();await ready();
 await p.waitForFunction(()=>window.__checkpointTrace.some(e=>e.kind==='send'&&e.op==='checkpoint'));
 await p.getByTestId('locker-tab').click();await p.getByTestId('transfer-window').click();await ready();
 const dialog=p.getByRole('dialog',{name:'계약과 다음 행선지'}),renewal=dialog.locator('.offer').filter({hasText:'토트넘 홋스퍼'});
 await renewal.getByRole('button',{name:'제안 수락',exact:true}).click();await ready();
 const trace=await p.evaluate(()=>window.__checkpointTrace),checkpoint=trace.find(e=>e.kind==='send'&&e.op==='checkpoint');
 assert.ok(trace.some(e=>e.kind==='stop'&&e.id===checkpoint.id),'foreground contract cancels the competing checkpoint Worker');
 assert.ok(!trace.some(e=>e.kind==='done'&&e.op==='checkpoint'&&e.id===checkpoint.id),'the checkpoint was interrupted rather than merely completing before the contract');
 const after=await summary();assert.equal(after.journal,0);assert.ok(after.revision>before.revision);assert.equal(after.club,before.club);assert.deepEqual(after.history,before.history);assert.deepEqual(after.stats,before.stats);assert.notDeepEqual(after.locks,before.locks);
 await p.reload({waitUntil:'load'});await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready();assert.deepEqual(await summary(),after);assert.deepEqual(errors,[]);
 await writeFile(out+'/results.json',JSON.stringify({url,source,version:await p.getByTestId('game-version').textContent(),checkpointInterrupted:true,renewalSaved:true,historyAndStatsPreserved:true,controlChangePreserved:true,reload:true,trace,errors},null,2));
 console.log('Foreground contract safely interrupted background compaction; journal, history and reload verified.');
}catch(e){await writeFile(out+'/failure.json',JSON.stringify({error:String(e),trace:await p.evaluate(()=>window.__checkpointTrace).catch(()=>null),errors},null,2));throw e;}finally{await browser.close();}
