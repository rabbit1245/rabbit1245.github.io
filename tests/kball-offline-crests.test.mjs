import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4173/';
const out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/p272/offline';
const crests=JSON.parse(await readFile('src/game/catalog.json','utf8')).clubs.filter(c=>c[7]).map(c=>({id:c[0],src:c[7]}));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}),context=await browser.newContext(),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(url,{waitUntil:'networkidle'});
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:45000});
 // No crest has been requested by this landing page. Installation must prepare all of them.
 const cached=await page.evaluate(async crests=>Promise.all(crests.map(async c=>({id:c.id,ok:(await caches.match(new URL(c.src,location.href)))?.ok===true}))),crests);
 assert.ok(cached.every(c=>c.ok),'all known crests must be precached before the user visits their league');
 await context.setOffline(true);await page.reload({waitUntil:'networkidle'});await page.getByTestId('new-career').waitFor();
 const decoded=await page.evaluate(async crests=>{const rows=[];for(let i=0;i<crests.length;i+=30)rows.push(...await Promise.all(crests.slice(i,i+30).map(async c=>{const img=new Image();img.src=c.src;await img.decode();return {id:c.id,ok:img.naturalWidth>0&&img.naturalHeight>0};})));return rows;},crests);
 assert.equal(decoded.length,crests.length);assert.ok(decoded.every(c=>c.ok));assert.deepEqual(errors,[]);
 await writeFile(`${out}/results.json`,JSON.stringify({url,preCached:cached.length,decodedOffline:decoded.length,offlineReload:true,errors},null,2));console.log(JSON.stringify({preCached:cached.length,decodedOffline:decoded.length,offlineReload:true,errors}));
}finally{await browser.close();}
