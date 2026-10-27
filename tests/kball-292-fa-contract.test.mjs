import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4184/Kball.html';
const out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/release-2.9.2/browser';
const fixtures=path.resolve(process.env.KBALL_FA_FIXTURE_DIR||'test-results/release-2.9.2/fixtures');
const version=JSON.parse(await readFile('package.json','utf8')).version;
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),errors=[],external=[],checks=[];
await mkdir(out,{recursive:true});
async function state(p){return p.evaluate(()=>new Promise((resolve,reject)=>{
 const r=indexedDB.open('kball-careers',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{
  const db=r.result,tx=db.transaction('slots'),get=tx.objectStore('slots').getAll();
  tx.oncomplete=async()=>{db.close();try{const c=await window.__readKballStored(get.result[0]),n=c.systems.national;
   const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v)))),n=>n.toString(16).padStart(2,'0')).join('');
   const historyCore=c.history.map(h=>({...h,...(h.details?{details:Object.fromEntries(Object.entries(h.details).filter(([key])=>key!=='clubDevelopment'))}:{})}));
   resolve({id:c.id,revision:c.revision,clubId:c.player.clubId,age:c.player.age,years:c.player.contractYears,wage:c.player.wage,stage:c.stage,week:c.season.week,offers:c.offers,locks:c.systems.attributeLocks??[],history:await digest(c.history),historyCore:await digest(historyCore),nationalHistory:await digest(n.history),faPerformers:n.history.flatMap(h=>h.matches).filter(m=>m.performers?.some(p=>p.id===c.player.id&&p.clubId==='FA')).length,apps:c.season.playerStats.apps});
  }catch(e){reject(e);}};tx.onabort=()=>reject(tx.error);
 };
}));}
async function ready(p){await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await p.locator('.processing').waitFor({state:'hidden'});assert.deepEqual(await p.getByRole('alert').allTextContents(),[]);}
async function changed(p,revision){const until=Date.now()+90000;while(Date.now()<until){assert.deepEqual(await p.getByRole('alert').allTextContents(),[]);const c=await state(p);if(c.revision>revision){await ready(p);return c;}await new Promise(r=>setTimeout(r,250));}throw Error('saved revision did not advance');}
async function open(file,width){const context=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(90000);
 await context.addInitScript(()=>localStorage.setItem('kball-reduced-motion','true'));
 p.on('pageerror',e=>errors.push(String(e)));p.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)external.push(r.url());});
 await p.goto(url,{waitUntil:'networkidle'});await context.setOffline(true);await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(path.join(fixtures,file));await ready(p);
 assert.ok((await p.getByTestId('game-version').innerText()).includes(version));return {context,p};
}
async function reload(context,p){await context.setOffline(false);await p.reload({waitUntil:'networkidle'});await context.setOffline(true);await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(p);}
try{
 const {context,p}=await open('fa-national.json',1366);const before=await state(p);assert.equal(before.clubId,'FA');assert.ok(before.faPerformers>0);
 await p.getByTestId('player-tab').click();await p.getByTestId('player-view-training').click();await p.getByTestId('lock-shooting').click();let saved=await changed(p,before.revision);assert.ok(saved.locks.includes('shooting'));
 await p.getByTestId('common-menu').click();await p.getByRole('button',{name:'지금 저장',exact:true}).click();await ready(p);
 const download=p.waitForEvent('download');await p.getByRole('button',{name:'JSON 내보내기',exact:true}).click();const file=await download;await file.saveAs(path.join(out,'fa-export.json'));const exported=JSON.parse(await readFile(path.join(out,'fa-export.json'),'utf8')).career;assert.equal(exported.player.clubId,'FA');assert.ok(exported.systems.national.history.flatMap(h=>h.matches).some(m=>m.performers?.some(row=>row.clubId==='FA')));
 await p.getByRole('button',{name:'닫기',exact:true}).click();await reload(context,p);saved=await state(p);assert.equal(saved.nationalHistory,before.nationalHistory);assert.equal(saved.history,before.history);assert.ok(saved.locks.includes('shooting'));await p.screenshot({path:path.join(out,'fa-reloaded.png'),fullPage:true});
 checks.push({case:'FA international history imports, autosaves, explicitly saves, exports and reloads offline',faPerformers:saved.faPerformers});await context.close();

 for(const width of [1366,390]){
  const {context,p}=await open('legacy-expired-veteran.json',width);const old=await state(p);assert.equal(old.clubId,'FA');assert.equal(old.offers.length,6);assert.ok(old.offers.every(o=>o.years===1));
  await p.getByTestId('transfer-window').click();const revised=await changed(p,old.revision);assert.equal(revised.offers.length,7);assert.ok(revised.offers.every(o=>/:offseason-v\d+:/.test(o.id)));
  const offer=revised.offers.find(o=>o.clubId==='EN1_01');assert.ok(offer&&offer.years>=2&&offer.fee===0);assert.equal(revised.history,old.history);
  const card=p.locator('.offer').filter({hasText:'전 소속팀 재계약'});assert.equal(await card.count(),1);assert.match(await card.innerText(),/프리미어리그/);await card.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,`return-offer-${width}.png`),fullPage:true});
  await card.getByRole('button',{name:'제안 수락'}).click();const signed=await changed(p,revised.revision);assert.equal(signed.clubId,'EN1_01');assert.equal(signed.years,offer.years);
  // The normal season transition attaches the just-computed club development report.
  // Every archived match, stat and contract must remain identical.
  await p.getByRole('button',{name:'닫기',exact:true}).click();await p.getByTestId('advance-half').click();const next=await changed(p,signed.revision);assert.equal(next.clubId,'EN1_01');assert.equal(next.week,0);assert.equal(next.years,offer.years);assert.equal(next.historyCore,old.historyCore);
  await reload(context,p);const loaded=await state(p);assert.equal(loaded.clubId,'EN1_01');assert.equal(loaded.years,offer.years);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  checks.push({case:'Legacy one-year offers refresh once; former-club return signs, starts next year and reloads',width,age:loaded.age,years:loaded.years});console.log('Verified former-club return:',width);await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(path.join(out,'results.json'),JSON.stringify({url,checks,errors,external},null,2));console.log(JSON.stringify({checks,errors,external}));
}finally{await browser.close();}
