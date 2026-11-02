import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'});
const out='test-results/expanded-2120/save-failure';await mkdir(out,{recursive:true});
try{
 const context=await b.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(90000);
 await p.goto(process.env.KBALL_TEST_URL||'http://127.0.0.1:4194/Kball.html');await p.getByTestId('new-career').waitFor();
 const source=await readFile('test-results/expanded-2120/fixtures/legacy.json','utf8');
 await p.evaluate(source=>new Promise((resolve,reject)=>{const e=JSON.parse(source),c=e.career,r=indexedDB.open('kball-careers',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['slots','metadata'],'readwrite');tx.objectStore('slots').put({id:c.id,format:'kball-blob-v1',revision:c.revision,hash:e.hash,versionHash:e.hash,writeId:crypto.randomUUID(),blob:new Blob([source],{type:'application/json'}),journal:[]});tx.objectStore('metadata').put({id:c.id,name:c.player.name,playerName:c.player.name,clubName:'구버전 검수 클럽',year:c.season.year,age:c.player.age,ovr:c.player.ovr,updatedAt:e.savedAt,revision:c.revision,hash:e.hash});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}),source);
 await p.addInitScript(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='slots')throw new DOMException('검수용 저장 공간 부족','QuotaExceededError');return put.apply(this,args);};});
 await p.reload();await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await p.getByTestId('save-status').filter({hasText:'저장 실패'}).waitFor({state:'attached'});await p.locator('.processing').waitFor({state:'hidden'});assert.match(await p.getByRole('alert').innerText(),/자동 저장에 실패/);
 await p.getByTestId('player-tab').click();assert.equal(await p.locator('.attribute-row').count(),25);assert.equal(await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).count(),0);await p.screenshot({path:`${out}/failure-visible.png`,fullPage:true});
 const original=await p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('slots','readonly'),s=tx.objectStore('slots').getAll();tx.oncomplete=async()=>{const c=await window.__readKballStored(s.result[0]);db.close();resolve({version:c.player.abilityVersion??null,attributes:Object.keys(c.player.attributes).length});};};r.onerror=()=>reject(r.error);}));assert.deepEqual(original,{version:null,attributes:20});
 await writeFile(`${out}/results.json`,JSON.stringify({injected:'QuotaExceededError on upgrade write',saveFailureRemainsVisible:true,unsavedExpandedPlayerRetained:true,originalDurableSaveUntouched:true,original},null,2));console.log('Upgrade save failure remains visible; original save is intact');
}finally{await b.close();}
