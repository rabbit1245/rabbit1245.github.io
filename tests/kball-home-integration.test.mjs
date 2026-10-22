import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4173/';
const fixtures=process.env.KBALL_UI_FIXTURES_DIR||'test-results';
const output=process.env.KBALL_TEST_RESULTS_DIR||'test-results/home-integration';
await mkdir(output,{recursive:true});
const baseline=JSON.parse(await readFile(path.join(fixtures,'career-baseline.json'),'utf8')).career;
const completed=JSON.parse(await readFile(path.join(fixtures,'career-completed.json'),'utf8')).career;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),page=await context.newPage();
const errors=[],passed=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(30000);
async function ready(){await page.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor();await page.locator('.processing').waitFor({state:'hidden'});}
async function home(){await page.getByTestId('locker-tab').click();await page.getByTestId('locker-core').waitFor();}
async function importFixture(name){await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(path.join(fixtures,name));await page.getByRole('heading',{name:'라커룸',exact:true,level:1}).waitFor();await ready();}
async function noOverflow(label){const sizes=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert.ok(sizes[0]<=sizes[1]+1,`${label}: ${sizes}`);}
async function fingerprint(stage){return page.evaluate(stage=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('kball-careers',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
  const db=request.result,tx=db.transaction('slots','readonly'),read=tx.objectStore('slots').getAll();
  tx.oncomplete=async()=>{db.close();try{const c=read.result.find(r=>r.envelope.career.stage===stage).envelope.career;const bytes=new TextEncoder().encode(JSON.stringify({player:c.player,season:c.season,history:c.history,awards:c.awards,systems:c.systems,revision:c.revision}));resolve(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''));}catch(e){reject(e);}};
 };
}),stage);}
try{
 await page.goto(url,{waitUntil:'networkidle'});await importFixture('career-baseline.json');const before=await fingerprint('season');
 assert.equal(await page.getByTestId('summary-talent').textContent(),`재능 ${baseline.player.talent}`);
 for(const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:390,height:844}]){
  await page.setViewportSize(viewport);await noOverflow('home');
  assert.ok(await page.getByTestId('advance-half').isVisible());
  if(viewport.width>=1366){const box=await page.getByTestId('locker-core').boundingBox();assert.ok(box.y+box.height<=viewport.height+1,`home core fits ${viewport.width}: ${JSON.stringify(box)}`);}
  const clipped=await page.locator('.locker-shortcuts button').evaluateAll(buttons=>buttons.some(button=>button.getBoundingClientRect().right>innerWidth));assert.equal(clipped,false);
  await page.screenshot({path:path.join(output,`home-${viewport.width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:1366,height:768});
 await page.getByTestId('quick-training').click();assert.equal(await page.getByTestId('player-view-training').getAttribute('aria-current'),'page');
 for(const [key,value] of Object.entries(baseline.player.attributes))assert.equal(await page.getByTestId(`training-${key}`).locator('strong').textContent(),String(Math.round(value)));
 passed.push('one-click training displays all actual current attributes');await home();
 for(const view of ['national','awards','seasons']){await page.getByTestId(`quick-${view}`).click();assert.equal(await page.getByTestId(`career-view-${view}`).getAttribute('aria-pressed'),'true');await noOverflow(view);await home();}
 passed.push('national, awards and season history open their existing view in one click');
 const disclosure=page.getByTestId('season-details-disclosure');assert.equal(await disclosure.getAttribute('open'),null);
 await disclosure.locator('summary').click();assert.equal(await page.getByTestId('locker-season-details').locator('.stat-detail:visible').count(),9);
 const homeApps=await page.getByTestId('locker-season-details').locator('.shared-stats b').first().textContent();
 await page.getByRole('button',{name:'대회별 · 경기별 전체 기록',exact:true}).click();
 assert.equal(await page.getByTestId('career-view-records').getAttribute('aria-pressed'),'true');
 assert.equal(await page.getByTestId('records-scope-all').locator('span').first().textContent(),homeApps);
 await home();assert.equal(await fingerprint('season'),before,'navigation and expanding preserve every actual stored record');
 passed.push('all nine metrics remain expandable and reconcile with the detailed record book without save mutations');
 await importFixture('career-completed.json');const closedBefore=await fingerprint('offseason');
 const preview=await page.getByTestId('honours-preview').textContent();
 if(completed.history[0].rank===1)assert.ok(preview.includes(completed.history[0].competitionName),'actual champion is named before expanding');
 await page.getByTestId('honours-disclosure').locator('summary').click();assert.ok(await page.getByRole('heading',{name:'우승한 대회',exact:true}).isVisible());
 await page.screenshot({path:path.join(output,'home-honours-expanded.png'),fullPage:true});
 assert.equal(await page.getByTestId('quick-training').count(),0,'unconfirmed offseason training has one primary path');
 assert.equal(await page.getByTestId('training-plan').count(),1);assert.equal(await page.getByTestId('advance-half').isDisabled(),true);
 await page.getByTestId('league-leaders-more').click();const own=page.getByTestId('league-own-rank');assert.ok((await own.textContent()).includes(completed.player.name));assert.ok((await own.textContent()).includes(`${completed.season.playerStats.goals}골`));
 await page.getByRole('button',{name:'도움',exact:true}).click();assert.ok((await own.textContent()).includes(`${completed.season.playerStats.assists}도움`));
 await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
 assert.equal(await fingerprint('offseason'),closedBefore);
 passed.push('2.4 completed save retains named titles, gated offseason choices and actual goal/assist rankings');
 await page.setViewportSize({width:390,height:844});await noOverflow('mobile completed season');await page.screenshot({path:path.join(output,'home-completed-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'home-integration-results.json'),JSON.stringify({passed,pageErrors:errors},null,2));console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
