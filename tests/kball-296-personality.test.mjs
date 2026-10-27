import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';

const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4188/Kball.html',out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/release-2.9.6/personality-ui';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const fixtures=[[1366,process.env.KBALL_PERSONALITY_LARGE_FIXTURE||'test-results/release-2.9.4/liverpool/career.json'],[390,process.env.KBALL_PERSONALITY_SMALL_FIXTURE||'test-results/release-2.9.5/fixtures/season.json']];
const labels={leadership:'리더십',stardom:'스타성',fairPlay:'페어 능력',clutch:'승부사',winning:'유관력'};
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),errors=[],external=[],checks=[];
async function ready(p){await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await p.locator('.processing').waitFor({state:'hidden'});assert.deepEqual(await p.getByRole('alert').allTextContents(),[]);}
async function head(p){return p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('slots'),q=t.objectStore('slots').getAll();t.oncomplete=()=>{db.close();resolve(q.result.map(c=>({id:c.id,revision:c.journal?.at(-1)?.revision??c.revision??c.envelope?.career.revision,journal:c.journal?.length??0}))[0]);};};}));}
async function training(p){await p.getByTestId('player-tab').click();await p.getByTestId('player-view-training').click();}
try{
  for(const [width,file]of fixtures){
    const original=JSON.parse(await readFile(file,'utf8')).career,context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(180000);
    await context.addInitScript(()=>{window.__gameRequests=[];const Native=window.Worker;window.Worker=class extends Native{postMessage(data,...rest){if(data?.command)window.__gameRequests.push(data.command.type);return super.postMessage(data,...rest);}};});
    p.on('pageerror',e=>errors.push(String(e)));p.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)external.push(r.url());});
    await p.goto(url,{waitUntil:'networkidle'});await context.setOffline(true);await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(path.resolve(file));await ready(p);assert.ok((await p.getByTestId('game-version').innerText()).includes(version));await training(p);
    const before=await head(p);assert.ok(Number.isInteger(before.revision));const disclosure=p.getByTestId('personality-disclosure');assert.equal(await disclosure.getAttribute('open'),null);
    await p.getByTestId('personality-toggle').click();const times=[];
    for(const [key,label]of Object.entries(labels)){const start=performance.now();await p.getByRole('button',{name:`${label} 올리기`,exact:true}).click();times.push(performance.now()-start);assert.match(await p.getByTestId(`personality-${key}`).innerText(),/^6/);assert.equal(await p.locator('.processing:visible').count(),0);}
    assert.equal((await head(p)).revision,before.revision);assert.deepEqual(await p.evaluate(()=>window.__gameRequests),[]);
    await p.getByTestId('personality-toggle').click();assert.equal(await disclosure.getAttribute('open'),null);assert.ok((await p.getByTestId('personality-toggle').innerText()).includes('저장 전 수정 있음'));await p.getByTestId('personality-toggle').click();assert.match(await p.getByTestId('personality-leadership').innerText(),/^6/);
    await p.getByRole('button',{name:'변경 취소',exact:true}).click();for(const key of Object.keys(labels))assert.match(await p.getByTestId(`personality-${key}`).innerText(),/^5/);assert.equal((await head(p)).revision,before.revision);
    for(const label of Object.values(labels))for(let i=0;i<5;i++){const start=performance.now();await p.getByRole('button',{name:`${label} 올리기`,exact:true}).click();times.push(performance.now()-start);assert.equal(await p.locator('.processing:visible').count(),0);}
    assert.equal((await head(p)).revision,before.revision);assert.deepEqual(await p.evaluate(()=>window.__gameRequests),[]);
    const start=performance.now();await p.getByTestId('save-personality').click();await ready(p);const saved=await head(p),saveMs=performance.now()-start;assert.equal(saved.revision,before.revision+1);assert.deepEqual(await p.evaluate(()=>window.__gameRequests),[]);assert.equal(await p.getByTestId('save-personality').isDisabled(),true);
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.getByTestId('personality-panel').scrollIntoViewIfNeeded();assert.equal(await p.getByTestId('personality-winning').evaluate(el=>getComputedStyle(el).color),'rgb(32, 33, 36)');await p.screenshot({path:`${out}/personality-${width}.png`,fullPage:true});
    await p.getByTestId('common-menu').click();const pending=p.waitForEvent('download');await p.getByRole('button',{name:'JSON 내보내기',exact:true}).click();const download=await pending;await download.saveAs(`${out}/export-${width}.json`);const exported=JSON.parse(await readFile(`${out}/export-${width}.json`,'utf8')).career;
    assert.deepEqual(exported.systems.personality,{leadership:10,stardom:10,fairPlay:10,clutch:10,winning:10});assert.deepEqual(exported.player.attributes,original.player.attributes);assert.equal(exported.player.ovr,original.player.ovr);assert.equal(exported.history.length,original.history.length);
    await context.setOffline(false);await p.reload({waitUntil:'networkidle'});await context.setOffline(true);await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(p);await training(p);assert.equal(await p.getByTestId('personality-disclosure').getAttribute('open'),null);await p.getByTestId('personality-toggle').click();for(const key of Object.keys(labels))assert.match(await p.getByTestId(`personality-${key}`).innerText(),/^10/);
    times.sort((a,b)=>a-b);checks.push({width,fixture:file,fixtureBytes:(await stat(file)).size,historySeasons:original.history.length,defaultCollapsed:true,unsavedEditsDoNotChangeRevision:true,cancel:true,collapseKeepsDraft:true,oneSaveRevision:true,gameWorkerRequests:0,editMedianMs:Math.round(times[Math.floor(times.length/2)]),editP95Ms:Math.round(times[Math.floor(times.length*.95)]),saveMs:Math.round(saveMs),abilitiesUnchanged:true,export:true,reload:true,noOverflow:true});console.log('Verified batch personality',JSON.stringify(checks.at(-1)));await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(`${out}/results.json`,JSON.stringify({version,url,checks,errors,external},null,2)+'\n');
}finally{await browser.close();}
