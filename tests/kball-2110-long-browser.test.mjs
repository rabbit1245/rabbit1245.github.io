import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4194/Kball.html',out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/release-2.11.0/long-browser';
const source=process.env.KBALL_LONG_SOURCE||'test-results/release-2.11.0/actual/career-5.json';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),context=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce',acceptDownloads:true}),page=await context.newPage();
page.setDefaultTimeout(240000);const errors=[],external=[],steps=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('crash',()=>errors.push('renderer crash'));page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)external.push(r.url());});
const cdp=await context.newCDPSession(page);
async function ready(){await page.locator('.processing').waitFor({state:'hidden'});await page.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor();assert.deepEqual(await page.getByRole('alert').allTextContents(),[]);}
// Read the small metadata store only. Re-parsing a 120–180 MB career on every
// progress poll would measure the test harness's memory pressure, not the game.
async function metadata(){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('metadata','readonly'),get=tx.objectStore('metadata').getAll();tx.oncomplete=()=>{db.close();resolve(get.result.filter(r=>!r.deleted)[0]);};tx.onabort=()=>reject(tx.error);};}));}
async function action(locator){await locator.click();await page.locator('.processing').waitFor({state:'visible'});await ready();}
async function sales(){const d=page.getByTestId('season-details-disclosure');if(await d.getAttribute('open')===null)await d.locator(':scope > summary').click();return page.getByTestId('locker-season-details').getByTestId('shirt-units').innerText();}
async function reload(){await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready();}
async function exportJSON(name){await page.getByTestId('common-menu').click();const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('dialog').getByRole('button',{name:'JSON 내보내기',exact:true}).click()]);const file=path.join(out,name);await download.saveAs(file);await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();return {file,bytes:(await stat(file)).size};}
try{
 await page.goto(url,{waitUntil:'networkidle'});await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(path.resolve(source));await ready();
 const initial=await metadata();assert.equal(initial.year,2030);assert.equal(initial.ovr,90);const initialSales=await sales();await reload();assert.equal(await sales(),initialSales);
 for(let y=0;y<3;y++){
  await page.getByTestId('transfer-window').click();const dialog=page.getByRole('dialog',{name:'계약과 다음 행선지'});await dialog.waitFor();
  const renewal=dialog.locator('.offer').filter({hasText:'토트넘 홋스퍼'});assert.equal(await renewal.count(),1);
  await action(renewal.getByRole('button',{name:'제안 수락',exact:true}));if(await dialog.isVisible())await dialog.getByRole('button',{name:'닫기',exact:true}).click();
  await action(page.getByTestId('advance-half'));let meta=await metadata();assert.equal(meta.year,initial.year+y+1);
  await action(page.getByTestId('advance-half'));await action(page.getByTestId('advance-half'));meta=await metadata();
  const units=await sales(),memory=await cdp.send('Runtime.getHeapUsage');assert.ok(/^\d[\d,]*장$/.test(units));
  await page.getByTestId('career-tab').click();await page.getByTestId('career-view-awards').click();const awards=page.getByTestId('award-disclosure');assert.ok(await awards.count()>0);
  const first=awards.first();assert.equal(await first.getAttribute('open'),null);assert.equal(await first.getByTestId('award-criteria').isVisible(),false);const revision=(await metadata()).revision;
  await first.locator(':scope > summary').click();assert.ok(await first.getByTestId('award-criteria').isVisible());await first.locator(':scope > summary').click();assert.equal((await metadata()).revision,revision,'disclosure does not mutate/save a career');
  await page.getByTestId('locker-tab').click();await reload();assert.equal(await sales(),units);assert.equal((await metadata()).year,meta.year);
  const row={year:meta.year,ovr:meta.ovr,shirtUnits:units,revision:meta.revision,mainPageHeapUsed:memory.usedSize,mainPageHeapTotal:memory.totalSize,saveReload:true};steps.push(row);console.log('LONG YEAR',JSON.stringify(row));await writeFile(path.join(out,'progress.json'),JSON.stringify(steps,null,2)+'\n');
 }
 const exported=await exportJSON('eight-seasons.json');assert.ok(exported.bytes>120000000);await page.getByTestId('career-tab').click();await page.getByTestId('career-view-retirement').click();page.once('dialog',d=>d.accept());await action(page.getByTestId('retire-career'));
 const [txt]=await Promise.all([page.waitForEvent('download'),page.getByTestId('career-text-download').click()]);await txt.saveAs(path.join(out,'eight-seasons.txt'));
 await page.screenshot({path:path.join(out,'eight-seasons-retirement.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(path.join(out,'results.json'),JSON.stringify({initialYears:5,additionalActualWorldSeasons:3,totalActualWorldSeasons:8,metadataOnlyPolling:true,errors,external,steps,exported,retirementTXT:true},null,2)+'\n');
}catch(e){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(e),errors,steps},null,2));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
