import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4184/Kball.html',out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/release-2.9.3/browser';
const fixture=process.env.KBALL_CAPTAIN_FIXTURE||'test-results/release-2.9.3/career/national-captain.json';
const source=JSON.parse(await readFile(fixture,'utf8')).career,proposal=source.systems.leadership.offers.find(o=>o.scope==='national'&&o.status==='pending'&&o.role==='captain');
assert.ok(proposal&&source.player.age<30&&source.systems.national.reputation<65);
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),checks=[],errors=[],external=[];
async function ready(p){await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await p.locator('.processing').waitFor({state:'hidden'});assert.deepEqual(await p.getByRole('alert').allTextContents(),[]);}
async function captain(p){await p.getByTestId('player-tab').click();await p.getByTestId('player-view-leadership').click();await p.getByTestId('captain-scope-national').click();}
async function state(p){return p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('slots'),get=tx.objectStore('slots').getAll();tx.oncomplete=async()=>{db.close();const c=await window.__readKballStored(get.result[0]);const data=JSON.stringify([c.history,c.systems.national.history,c.systems.national.matches]);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data))),n=>n.toString(16).padStart(2,'0')).join('');resolve({role:c.systems.leadership.nationalRole,terms:c.systems.leadership.terms.filter(t=>t.scope==='national'&&t.role!=='match'),offers:c.systems.leadership.offers,hash});};};}));}
try{
 for(const width of [1366,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(90000);p.on('pageerror',e=>errors.push(String(e)));p.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)external.push(r.url());});
  await p.goto(url,{waitUntil:'networkidle'});await context.setOffline(true);await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(fixture);await ready(p);assert.match(await p.getByTestId('game-version').innerText(),/2\.9\.3/);await captain(p);
  const text=await p.getByTestId('captain-assessment').innerText();for(const label of ['판단','집중','침착','팀워크','나이 가점 없음'])assert.ok(text.includes(label),label);
  await p.screenshot({path:`${out}/national-pending-${width}.png`,fullPage:true});const before=await state(p);await p.getByTestId('accept-captain-offer').click();await ready(p);const accepted=await state(p);assert.equal(accepted.role,'captain');assert.equal(accepted.terms.length,before.terms.length+1);assert.equal(accepted.terms.at(-1).apps,0);assert.equal(accepted.hash,before.hash);
  await context.setOffline(false);await p.reload({waitUntil:'networkidle'});await context.setOffline(true);await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(p);await captain(p);const reloaded=await state(p);assert.equal(reloaded.role,'captain');assert.equal(reloaded.hash,before.hash);assert.equal(await p.getByTestId('accept-captain-offer').count(),0);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:`${out}/national-accepted-${width}.png`,fullPage:true});
  checks.push({width,age:source.player.age,nationalReputation:source.systems.national.reputation,nationalApps:proposal.assessment.apps,mentalScore:proposal.assessment.mental.score,accepted:true,reloaded:true,pastRecordsUnchanged:true});console.log('Verified national captain:',width);await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(`${out}/results.json`,JSON.stringify({url,checks,errors,external},null,2)+'\n');
}finally{await browser.close();}
