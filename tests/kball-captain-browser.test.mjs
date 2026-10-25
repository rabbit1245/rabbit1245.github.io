import { chromium } from './stored-careers.mjs';
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.KBALL_TEST_URL||'http://127.0.0.1:4173/';
const directory=path.resolve(process.env.KBALL_CAPTAIN_RESULTS_DIR||'test-results/v22');
const fixture=path.resolve(process.env.KBALL_CAPTAIN_FIXTURE||path.join(directory,'captain-offer.json'));
const source=JSON.parse(await readFile(fixture,'utf8')).career;
const pending=source.systems.leadership.offers.find(o=>o.scope==='club'&&o.status==='pending');
assert.equal(pending?.role,'captain');
assert.equal(source.systems.leadership.clubRole,'none');
const formalBefore=source.systems.leadership.terms.filter(t=>t.scope==='club'&&t.role!=='match').length;
assert.ok(source.history.length>=2&&pending.assessment.apps>=40,'fixture must have genuine multi-season appearances');
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const errors=[],completed=[];
let currentPage;
async function stored(page){
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('kball-careers',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{
      const db=req.result,tx=db.transaction('slots','readonly'),read=tx.objectStore('slots').getAll();
      tx.oncomplete=async()=>{db.close();resolve((await Promise.all(read.result.map(window.__readKballStored))).map(c=>{return{id:c.id,revision:c.revision,commands:c.processedCommands,leadership:c.systems.leadership};}));};tx.onabort=()=>reject(tx.error);
    };
  }));
}
async function ready(page){await page.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await page.locator('.processing').waitFor({state:'hidden'});}
async function state(page,predicate,label){
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){
    const rows=await stored(page),found=rows.find(predicate);if(found){await ready(page);return found;}
    const alerts=await page.getByRole('alert').allTextContents();if(alerts.length)throw new Error(`${label}: ${alerts.join(' | ')}`);
    await new Promise(resolve=>setTimeout(resolve,250));
  }throw new Error(`Timed out: ${label}`);
}
async function openCaptain(page){await page.getByTestId('player-tab').click();await page.getByTestId('player-view-leadership').click();await page.getByTestId('captain-assessment').waitFor();}
async function importFixture(viewport){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();currentPage=page;page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(baseURL,{waitUntil:'networkidle'});await page.getByTestId('new-career').waitFor();
  await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(fixture);
  const initial=await state(page,c=>c.leadership.offers.some(o=>o.id===pending.id&&o.status==='pending'),'pending proposal import');
  assert.notEqual(initial.id,source.id,'import must use an independent slot');
  assert.equal(initial.leadership.clubRole,'none');
  await openCaptain(page);
  const nationalRow=await page.getByTestId('national-competition-status').textContent();
  if(nationalRow.includes('참여 대회 없음'))assert.notEqual((await page.locator('.strip-national b').textContent()).trim(),'소집','summary must not report a stale previous-season call-up');
  assert.equal(await page.getByTestId('captain-offer').count(),1);
  assert.ok((await page.locator('.captain-view-heading').textContent()).includes('일반 선수'));
  assert.equal(await page.locator('.captain-basis-grid > div').count(),6);
  const assessment=await page.getByTestId('captain-assessment').textContent();
  for(const label of ['팀 위상','내 실력','리더십','신뢰','평점'])assert.ok(assessment.includes(label),`visible criterion ${label}`);
  return {context,page,initial};
}
async function noOverflow(page,label){const sizes=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(sizes.document<=sizes.viewport+1,`${label}: ${JSON.stringify(sizes)}`);}
try{
  const {context,page,initial}=await importFixture({width:1366,height:768});
  await page.screenshot({path:path.join(directory,'kball-captain-pending.png'),fullPage:true});
  await page.getByTestId('accept-captain-offer').click();
  const accepted=await state(page,c=>c.id===initial.id&&c.leadership.offers.some(o=>o.id===pending.id&&o.status==='accepted'),'captain acceptance');
  assert.equal(accepted.leadership.clubRole,'captain');
  const terms=accepted.leadership.terms.filter(t=>t.scope==='club'&&t.role!=='match');assert.equal(terms.length,formalBefore+1);assert.equal(terms.at(-1).apps,0);assert.equal(terms.at(-1).startYear,source.season.year);assert.equal(terms.at(-1).startRound,source.season.week);
  assert.equal(accepted.commands.length,initial.commands.length+1,'one response executes exactly one command');
  assert.equal(await page.getByTestId('accept-captain-offer').count(),0);assert.ok((await page.getByTestId('captain-offer-state').textContent()).includes('주장 역할'));
  await page.screenshot({path:path.join(directory,'kball-captain-accepted.png'),fullPage:true});
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(page);await openCaptain(page);
  const reloaded=await state(page,c=>c.id===initial.id&&c.leadership.clubRole==='captain','accepted role reload');assert.deepEqual(reloaded.leadership,accepted.leadership);assert.equal(await page.getByTestId('captain-offer').count(),0);await noOverflow(page,'captain desktop');
  completed.push('real simulated multi-season proposal, criteria, explicit acceptance, zero retroactive captain appearances and durable reload');
  await context.close();
  const mobile=await importFixture({width:390,height:844});
  await noOverflow(mobile.page,'mobile pending captain');
  await mobile.page.screenshot({path:path.join(directory,'kball-captain-mobile-pending.png'),fullPage:true});
  await mobile.page.getByTestId('decline-captain-offer').click();
  const declined=await state(mobile.page,c=>c.id===mobile.initial.id&&c.leadership.offers.some(o=>o.id===pending.id&&o.status==='declined'),'captain decline');
  assert.equal(declined.leadership.clubRole,'none');assert.equal(declined.leadership.terms.filter(t=>t.scope==='club'&&t.role!=='match').length,formalBefore);assert.equal(declined.commands.length,mobile.initial.commands.length+1);assert.equal(await mobile.page.getByTestId('captain-offer').count(),0);
  await mobile.page.reload({waitUntil:'networkidle'});await mobile.page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(mobile.page);await openCaptain(mobile.page);
  const declinedReload=await state(mobile.page,c=>c.id===mobile.initial.id,'declined reload');assert.deepEqual(declinedReload.leadership,declined.leadership);await noOverflow(mobile.page,'mobile declined captain');
  completed.push('independent mobile import, decline preserves role and formal terms, saved decline survives reload with no horizontal overflow');
  await mobile.context.close();assert.deepEqual(errors,[]);
  await writeFile(path.join(directory,'captain-browser-report.json'),JSON.stringify({completed,errors,fixture:{completedSeasons:source.history.length,actualClubAppearances:pending.assessment.apps,role:pending.role}},null,2));
  console.log(JSON.stringify({completed,errors},null,2));
}catch(error){if(currentPage&&!currentPage.isClosed())await currentPage.screenshot({path:path.join(directory,'kball-captain-failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();}
