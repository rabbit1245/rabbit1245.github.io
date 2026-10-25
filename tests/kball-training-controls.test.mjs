import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4173/';
const out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/p272/controls';
const fixture=process.env.KBALL_CONTROLS_FIXTURE||'test-results/career-completed.json';
const previous=JSON.parse(await readFile(fixture,'utf8')).career;
const version=JSON.parse(await readFile('package.json','utf8')).version;
const portable=/\.html(?:[?#]|$)/.test(url),checks=[],errors=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'});
let page;
async function ready(p){await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await p.locator('.processing').waitFor({state:'hidden'});}
async function state(p,name){return p.evaluate(name=>new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('slots'),get=tx.objectStore('slots').getAll();tx.oncomplete=async()=>{db.close();const c=(await Promise.all(get.result.map(window.__readKballStored))).find(c=>c.player.name===name);resolve({revision:c.revision,training:c.training,attributes:c.player.attributes,locks:c.systems.attributeLocks??[],aging:c.systems.manualAging??[],stage:c.stage,year:c.season.year,plan:c.systems.trainingPlan,stats:c.season.playerStats,history:c.history.map(h=>({year:h.year,stats:h.stats}))});};};}),name);}
async function training(p){await p.getByTestId('player-tab').click();await p.getByTestId('player-view-training').click();}
async function setup(){const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(String(e)));await p.goto(url,{waitUntil:'networkidle'});if(portable)await context.setOffline(true);return {context,p};}
async function fit(p){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
async function importOffseason(p){await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(fixture);await ready(p);await p.getByTestId('transfer-window').click();await p.getByRole('button',{name:'현재 구단에 잔류',exact:true}).click();await ready(p);const close=p.getByRole('dialog').getByRole('button',{name:'닫기',exact:true});if(await close.count())await close.click();}
try{
 const {context,p}=await setup();page=p;
 await p.getByTestId('new-career').click();const d=p.getByRole('dialog');await d.getByLabel('선수 이름',{exact:true}).fill('조작 검수');
 await d.getByTestId('next-creation-step').click();await d.getByLabel('시작 소속',{exact:true}).selectOption('senior');await d.getByTestId('next-creation-step').click();
 while(await d.locator('.training-row[aria-pressed="true"]').count())await d.locator('.training-row[aria-pressed="true"]').first().click();
 assert.equal(await d.getByTestId('create-career').isEnabled(),true);await d.getByTestId('create-career').click();await ready(p);
 assert.ok((await p.getByTestId('game-version').textContent()).includes(version));assert.deepEqual((await state(p,'조작 검수')).training,[]);await training(p);
 assert.equal(await p.locator('.training-row[aria-pressed="true"]').count(),0);checks.push('A new career starts with zero checked attributes and preserves an empty plan');
 await p.getByTestId('lock-shooting').click();await ready(p);
 const lock=p.getByTestId('lock-shooting');assert.equal(await lock.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(46, 107, 59)');assert.equal(await lock.evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
 const partial=await state(p,'조작 검수');assert.equal(partial.locks.length,1);await p.getByTestId('lock-all-attributes').click();await ready(p);
 let c=await state(p,'조작 검수');assert.equal(c.locks.length,20);assert.equal(c.revision,partial.revision+1);assert.equal(await p.getByTestId('lock-all-attributes').getAttribute('aria-pressed'),'true');
 await p.getByTestId('lock-all-attributes').click();await ready(p);assert.deepEqual((await state(p,'조작 검수')).locks,[]);
 await p.getByTestId('lock-all-attributes').click();await ready(p);c=await state(p,'조작 검수');checks.push('Individual locks turn solid green; whole-player locking and unlocking each use one atomic command');
 await p.getByTestId('manual-aging').getByRole('button',{name:'노화',exact:true}).click();await p.getByRole('button',{name:'−5',exact:true}).click();assert.equal(await p.getByTestId('training-shooting').isEnabled(),true);
 await p.getByTestId('training-shooting').click();await ready(p);const aged=await state(p,'조작 검수');assert.equal(aged.attributes.shooting,Math.max(0,c.attributes.shooting-5));assert.deepEqual(aged.locks,c.locks);
 for(const [key,value]of Object.entries(c.attributes))if(key!=='shooting')assert.equal(aged.attributes[key],value);
 assert.equal(aged.aging.at(-1).key,'shooting');assert.equal(aged.aging.at(-1).amount,5);checks.push('Manual −5 changes exactly the locked target and retains all locks');
 await p.screenshot({path:`${out}/locked-aging-desktop.png`,fullPage:true});
 for(const width of [1366,1920,390]){await p.setViewportSize({width,height:width===390?844:768});await fit(p);const box=await p.getByTestId('lock-all-attributes').boundingBox();assert.ok(box&&box.width>0&&box.x>=0&&box.x+box.width<=width+1);await p.screenshot({path:`${out}/controls-${width}.png`,fullPage:true});}
 await context.setOffline(false);await p.reload({waitUntil:'networkidle'});if(portable)await context.setOffline(true);await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(p);await training(p);
 const reloaded=await state(p,'조작 검수');assert.deepEqual(reloaded.attributes,aged.attributes);assert.deepEqual(reloaded.locks,aged.locks);assert.equal(await p.getByTestId('lock-all-attributes').getAttribute('aria-pressed'),'true');checks.push('Desktop/mobile controls fit and adjusted values plus locks survive reload');
 await p.setViewportSize({width:1366,height:768});await importOffseason(p);assert.equal(await p.getByTestId('advance-half').isEnabled(),true);
 await p.getByTestId('training-plan').click();assert.equal(await p.locator('.training-row[aria-pressed="true"]').count(),0);assert.equal(await p.getByTestId('confirm-training').isEnabled(),true);
 await p.getByTestId('confirm-training').click();await ready(p);assert.deepEqual((await state(p,previous.player.name)).training,[]);await p.getByTestId('advance-half').click();await ready(p);
 let next=await state(p,previous.player.name);assert.equal(next.stage,'season');assert.equal(next.year,previous.season.year+1);assert.deepEqual(next.training,[]);assert.deepEqual(next.attributes,previous.player.attributes);assert.deepEqual(next.history,previous.history.map(h=>({year:h.year,stats:h.stats})));
 checks.push('An explicitly empty offseason plan starts the next season and keeps prior records and attributes');await context.close();
 const direct=await setup();page=direct.p;await importOffseason(direct.p);assert.equal(await direct.p.getByTestId('advance-half').isEnabled(),true);await direct.p.getByTestId('advance-half').click();await ready(direct.p);
 next=await state(direct.p,previous.player.name);assert.equal(next.year,previous.season.year+1);assert.deepEqual(next.training,[]);assert.equal(next.plan.confirmed,true);assert.deepEqual(next.attributes,previous.player.attributes);checks.push('Next season also starts directly without opening or confirming training; old selections are not carried forward');
 await direct.context.close();assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({url,portable,checks,errors},null,2));console.log(JSON.stringify({url,checks,errors}));
}catch(error){await page?.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
