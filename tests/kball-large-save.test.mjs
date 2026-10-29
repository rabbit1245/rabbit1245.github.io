import { chromium } from './stored-careers.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.KBALL_TEST_URL || 'http://127.0.0.1:4173/';
const sourcePath = path.resolve(process.env.KBALL_LARGE_SAVE_FILE || 'test-results/long-career-30-seasons.json');
const results = path.resolve(process.env.KBALL_TEST_RESULTS_DIR || 'test-results/browser-large-save');
const size = (await stat(sourcePath)).size;
assert.ok(size > 64 * 1024 * 1024, `Expected a real save above the previous 64MB limit; received ${size} bytes`);
assert.ok(size <= 1024 * 1024 * 1024, 'The actual thirty-season save must fit the documented 1GB resource guard');
await mkdir(results, { recursive: true });

// Release the large source JSON heap before the browser imports another copy.
const expected = JSON.parse(execFileSync(process.execPath, ['-e', `
  const envelope=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')),c=envelope.career;
  const add=(s,r)=>{for(const [key,value]of Object.entries(r))s[key]=Number(((s[key]||0)+value).toFixed(2));return s;};
  const sum=rows=>rows.reduce(add,{});
  const club=sum([...c.history.map(h=>h.stats),...(!c.history.some(h=>h.year===c.season.year)?[c.season.playerStats]:[])]);
  const n=c.systems.national,seen=new Set(),nationalMatches=[...n.history.flatMap(h=>h.matches),...n.matches].filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return true;});
  const national=sum(nationalMatches.map(m=>m.playerStats));
  process.stdout.write(JSON.stringify({format:envelope.format,id:c.id,playerId:c.player.id,playerName:c.player.name,position:c.player.position,seed:c.seed,stage:c.stage,year:c.season.year,revision:c.revision,historyCount:c.history.length,matchCount:c.history.reduce((s,h)=>s+h.matches.length,0),nationalMatchCount:nationalMatches.length,club,national,all:sum([club,national])}));
`, sourcePath], { encoding: 'utf8', maxBuffer: 64 * 1024 }));
assert.equal(expected.format, 'kball-save');
assert.equal(expected.historyCount, 30);
assert.equal(expected.stage, 'retired');
console.log(`Large save source verified: ${(size/1024/1024).toFixed(2)}MB, ${expected.historyCount} seasons, ${expected.matchCount} club matches`);

const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const errors=[];let page;

async function storedSummary() {
 return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('kball-careers',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
  const db=request.result,tx=db.transaction(['metadata','slots'],'readonly'),metadata=tx.objectStore('metadata').getAll(),slots=tx.objectStore('slots').getAll();
  tx.oncomplete=async()=>{db.close();try{
   const active=metadata.result.filter(m=>!m.deleted);if(active.length!==1){resolve({slotCount:active.length});return;}
   const record=slots.result.find(r=>r.id===active[0].id),c=await window.__readKballStored(record),logicalHash=record.envelope?.hash??record.journal?.at(-1)?.hash??record.versionHash;
   const add=(s,r)=>{for(const [key,value]of Object.entries(r))s[key]=Number(((s[key]||0)+value).toFixed(2));return s;},sum=rows=>rows.reduce(add,{});
   const club=sum([...c.history.map(h=>h.stats),...(!c.history.some(h=>h.year===c.season.year)?[c.season.playerStats]:[])]),n=c.systems.national,seen=new Set();
   const nationalMatches=[...n.history.flatMap(h=>h.matches),...n.matches].filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return true;}),national=sum(nationalMatches.map(m=>m.playerStats));
   resolve({slotCount:active.length,id:c.id,playerId:c.player.id,playerName:c.player.name,position:c.player.position,seed:c.seed,stage:c.stage,year:c.season.year,revision:c.revision,historyCount:c.history.length,matchCount:c.history.reduce((s,h)=>s+h.matches.length,0),nationalMatchCount:nationalMatches.length,metadataMatchesHash:active[0].hash===logicalHash,club,national,all:sum([club,national])});
  }catch(e){reject(e);}};tx.onabort=()=>reject(tx.error);
 }}));
}
async function waitSaved(label) {
  const deadline=Date.now()+180_000;
  while(Date.now()<deadline){
    const state=await page.evaluate(()=>({status:document.querySelector('[data-testid="save-status"]')?.textContent||'',alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)}));
    if(state.alerts.length)throw new Error(`${label}: ${state.alerts.join(' | ')}`);
    if(state.status.includes('자동 저장됨')){await page.locator('.processing').waitFor({state:'hidden'});return;}
    await new Promise(resolve=>setTimeout(resolve,400));
  }
  throw new Error(`${label}: large save did not finish importing and persisting`);
}
function validateStored(actual) {
  assert.equal(actual.slotCount,1);assert.notEqual(actual.id,expected.id);assert.equal(actual.playerId,expected.playerId);assert.equal(actual.playerName,expected.playerName);assert.equal(actual.seed,expected.seed);assert.equal(actual.stage,'retired');assert.equal(actual.historyCount,30);assert.equal(actual.year,expected.year);assert.equal(actual.matchCount,expected.matchCount);assert.equal(actual.nationalMatchCount,expected.nationalMatchCount);assert.equal(actual.metadataMatchesHash,true);
  for(const scope of ['club','national','all'])assert.deepEqual(actual[scope],expected[scope],`${scope} totals must survive large-file import and save`);
}
async function verifyDOM() {
  await page.getByTestId('career-tab').click();await page.getByTestId('career-view-retirement').click();await page.getByRole('heading',{name:`${expected.playerName}의 은퇴 기록`}).waitFor();assert.equal(await page.getByTestId('retire-career').count(),0);await page.getByTestId('career-view-records').click();await page.getByRole('button',{name:'통산',exact:true}).click();
  for(const scope of ['all','club','national']){
    const values=await page.getByTestId(`records-scope-${scope}`).evaluate(button=>[...button.children].slice(1).map(e=>e.textContent));const stats=expected[scope];
    assert.equal(Number(values[0].replace(/[^\d]/g,'')),stats.apps||0,`${scope} DOM apps`);assert.equal(Number(values[1].replace(/[^\d]/g,'')),stats.minutes||0,`${scope} DOM minutes`);assert.equal(Number(values[2].replace(/[^\d]/g,'')),stats.goals||0,`${scope} DOM goals`);assert.equal(Number(values[3].replace(/[^\d]/g,'')),stats.assists||0,`${scope} DOM assists`);assert.equal(values[4],stats.ratingCount?(stats.ratingSum/stats.ratingCount).toFixed(2):'—',`${scope} DOM rating`);
  }
  await page.getByTestId('records-scope-all').click();assert.equal(await page.getByTestId('role-metrics').locator('.stat-detail').count(),expected.position==='GK'?10:12);
}
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(90_000);page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(baseURL,{waitUntil:'networkidle'});await page.getByTestId('new-career').waitFor();
  const started=Date.now();await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(sourcePath);await waitSaved('initial import');const imported=await storedSummary();validateStored(imported);console.log('Large save import and IndexedDB persistence verified');await verifyDOM();
  const importMs=Date.now()-started;console.log('Large save DOM totals verified');
  await page.locator('.record-book').screenshot({path:path.join(results,'kball-large-save-records.png')});
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await waitSaved('reload');const reloaded=await storedSummary();validateStored(reloaded);assert.equal(reloaded.id,imported.id);await verifyDOM();assert.deepEqual(errors,[]);
  const report={passed:['actual thirty-season save above 64MB imported into a new slot','File import and persistent IndexedDB slot accepted the actual large save','retired state, all 30 seasons and every match count preserved','combined/club/national DOM totals match source before and after reload'],baseURL,bytes:size,importMs,historyCount:expected.historyCount,matchCount:expected.matchCount,nationalMatchCount:expected.nationalMatchCount,pageErrors:errors};
  await writeFile(path.join(results,'large-save-results.json'),JSON.stringify(report,null,2));console.log('Kball large-save browser verification passed:',JSON.stringify(report));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(results,'large-save-failure.png'),fullPage:false}).catch(()=>{});await writeFile(path.join(results,'large-save-results.json'),JSON.stringify({failure:String(error),bytes:size,pageErrors:errors},null,2));throw error;}finally{await browser.close();}
