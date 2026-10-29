import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const url=process.env.KBALL_TEST_URL||pathToFileURL(path.resolve('play/Kball.html')).href,out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/release-2.11.0/local-file';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),context=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce',acceptDownloads:true}),p=await context.newPage();p.setDefaultTimeout(180000);const errors=[],http=[];p.on('pageerror',e=>errors.push(String(e)));p.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)http.push(r.url());});
async function ready(){await p.locator('.processing').waitFor({state:'hidden'});await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});assert.deepEqual(await p.getByRole('alert').allTextContents(),[]);}
try{
 await p.goto(url,{waitUntil:'load'});await context.setOffline(true);await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(path.resolve('test-results/release-2.11.0/fixtures/legacy-broken.json'));await ready();
 await p.getByTestId('advance-half').click();await p.locator('.processing').waitFor({state:'visible'});await ready();
 await p.getByTestId('common-menu').click();const [download]=await Promise.all([p.waitForEvent('download'),p.getByRole('dialog').getByRole('button',{name:'JSON 내보내기',exact:true}).click()]);const file=path.join(out,'local-half.json');await download.saveAs(file);await p.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
 if(url.startsWith('http'))await context.setOffline(false);await p.reload({waitUntil:'load'});await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready();assert.deepEqual(errors,[]);assert.deepEqual(http,[]);
 await writeFile(path.join(out,'results.json'),JSON.stringify({scheme:new URL(url).protocol,browser:'Linux Chromium; not Windows Edge',legacyRecovery:true,actualHalfProgress:true,IndexedDBAutosave:true,BlobJSONExport:true,reload:true,exportedBytes:(await stat(file)).size,errors,http},null,2)+'\n');console.log('Offline local-file progression, save, export and reload passed');
}catch(e){
 if(String(e).includes('ERR_BLOCKED_BY_ADMINISTRATOR')){await writeFile(path.join(out,'results.json'),JSON.stringify({scheme:'file:',skipped:true,reason:'Managed cloud browser policy blocks file:// navigation; no policy bypass attempted.',HTTPStandaloneTestsSeparate:true},null,2)+'\n');console.log('SKIP: managed browser policy blocks file:// navigation');}
 else throw e;
}finally{await browser.close();}
