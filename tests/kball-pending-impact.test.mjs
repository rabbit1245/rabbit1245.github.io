import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4173/';
const fixtures=process.env.KBALL_UI_FIXTURES_DIR||'test-results';
const out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/pending-impact';
const completed=`${fixtures}/career-completed.json`,baseline=`${fixtures}/career-baseline.json`;
const old=JSON.parse(await readFile(completed,'utf8')).career,initial=JSON.parse(await readFile(baseline,'utf8')).career;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}),context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],checks=[];
page.setDefaultTimeout(240000);page.on('pageerror',e=>errors.push(String(e)));
async function ready(){await page.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await page.locator('.processing').waitFor({state:'hidden'});assert.deepEqual(await page.getByRole('alert').allTextContents(),[]);}
async function training(){await page.getByTestId('player-tab').click();await page.getByTestId('player-view-training').click();}
async function state(stage){return page.evaluate(stage=>new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('slots'),get=tx.objectStore('slots').getAll();tx.oncomplete=async()=>{db.close();const c=(await Promise.all(get.result.map(window.__readKballStored))).find(c=>c.stage===stage);resolve({stage:c.stage,year:c.season.year,attributes:c.player.attributes,stats:c.season.playerStats,history:c.history.map(h=>h.stats),locks:c.systems.attributeLocks??[],injuries:c.systems.manualInjuries??[],week:c.season.week});};};}),stage);}
try{
 await page.goto(url,{waitUntil:'networkidle'});await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(completed);await ready();await training();
 if(await page.getByTestId('lock-all-attributes').getAttribute('aria-pressed')!=='true'){await page.getByTestId('lock-all-attributes').click();await ready();}
 assert.equal(await page.getByRole('button',{name:'부상',exact:true}).isEnabled(),true);await page.getByRole('button',{name:'부상',exact:true}).click();await page.getByRole('button',{name:'반 시즌',exact:true}).click();await ready();
 let c=await state('offseason');assert.equal(c.locks.length,20);assert.equal(c.injuries.at(-1).pendingNextSeason,true);assert.equal(c.injuries.at(-1).missed.length,0);assert.deepEqual(c.attributes,old.player.attributes);assert.deepEqual(c.stats,old.season.playerStats);assert.deepEqual(c.history,old.history.map(h=>h.stats));checks.push('All-attribute locks permit offseason injury scheduling without changing past records or abilities');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/queued-mobile.png`,fullPage:true});
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready();await training();c=await state('offseason');assert.equal(c.injuries.at(-1).pendingNextSeason,true);assert.equal(await page.getByTestId('lock-all-attributes').getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:'부상',exact:true}).isDisabled(),true);checks.push('The queued injury and green lock state survive reload; duplicate injuries stay blocked');
 await page.setViewportSize({width:1366,height:768});await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(baseline);await ready();await training();
 if(await page.getByTestId('lock-all-attributes').getAttribute('aria-pressed')!=='true'){await page.getByTestId('lock-all-attributes').click();await ready();}
 await page.getByRole('button',{name:'부상',exact:true}).click();await page.getByRole('button',{name:'반 시즌',exact:true}).click();await page.locator('.processing').waitFor({state:'visible'});await ready();
 c=await state('season');assert.ok(c.week>initial.season.week);assert.equal(c.locks.length,20);assert.deepEqual(c.attributes,initial.player.attributes);assert.equal(c.stats.apps,initial.season.playerStats.apps);assert.ok(c.injuries.at(-1).missed.length>0);await page.screenshot({path:`${out}/locked-injury-progress.png`,fullPage:true});checks.push('During the season, a real injury command advances team games through the worker while all locks and abilities remain intact');
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({url,checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
