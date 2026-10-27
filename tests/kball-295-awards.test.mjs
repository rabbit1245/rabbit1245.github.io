import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4187/Kball.html';
const out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/release-2.9.5/awards-ui';
const fixtures=process.env.KBALL_AWARDS_FIXTURES||'test-results/release-2.9.5/fixtures';
const report=JSON.parse(await readFile(path.join(fixtures,'../actual-season.json'),'utf8'));
const layout=JSON.parse(await readFile(path.join(fixtures,'../layout-fixture.json'),'utf8'));
const version=JSON.parse(await readFile('package.json','utf8')).version;
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),errors=[],external=[],checks=[];
await mkdir(out,{recursive:true});
async function ready(p){await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await p.locator('.processing').waitFor({state:'hidden'});assert.deepEqual(await p.getByRole('alert').allTextContents(),[]);}
try{
  for(const [width,file]of [[1366,'season.json'],[390,'season.json'],[390,'retired.json'],[1366,'layout-retired.json'],[390,'layout-retired.json']]){
    const expected=file.startsWith('layout-')?layout.newAwards:report.newAwards;
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(90000);
    p.on('pageerror',e=>errors.push(String(e)));p.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)external.push(r.url());});
    await p.goto(url,{waitUntil:'networkidle'});await context.setOffline(true);await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(path.resolve(fixtures,file));await ready(p);assert.ok((await p.getByTestId('game-version').innerText()).includes(version));
    await p.getByTestId('career-tab').click();await p.getByTestId('career-view-awards').click();
    const panel=p.getByTestId('season-honours');for(const a of expected)assert.ok((await panel.innerText()).includes(a.name),`${width} ${a.name} missing`);
    await p.getByLabel('수상 범위',{exact:true}).selectOption('league');assert.ok((await panel.innerText()).includes('라리가 시즌 최우수 선수'));
    await p.getByLabel('수상 범위',{exact:true}).selectOption('world');for(const a of expected.filter(a=>/^layout:(UCL|UEL|UECL):|^UCL:/.test(a.id)))assert.ok((await panel.innerText()).includes(a.name));
    await p.getByLabel('수상 범위',{exact:true}).selectOption('all');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await panel.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,`${width}-${file}.png`),fullPage:true});
    const pending=p.waitForEvent('download');await p.getByTestId('career-text-download').click();const download=await pending;await download.saveAs(path.join(out,`${width}-${file}.txt`));
    const text=await readFile(path.join(out,`${width}-${file}.txt`),'utf8');for(const a of expected)assert.ok(text.includes(a.name));
    await context.setOffline(false);await p.reload({waitUntil:'networkidle'});await context.setOffline(true);await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(p);
    await p.getByTestId('career-tab').click();await p.getByTestId('career-view-awards').click();for(const a of expected)assert.ok((await p.getByTestId('season-honours').innerText()).includes(a.name));
    checks.push({width,file,actualSeason:!file.startsWith('layout-'),syntheticRecords:file.startsWith('layout-'),newAwards:expected.map(a=>a.name),filters:true,retirementTXT:true,reload:true,noOverflow:true});console.log('Verified new European awards:',width,file);await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(path.join(out,'results.json'),JSON.stringify({version,url,checks,errors,external},null,2)+'\n');
}finally{await browser.close();}
