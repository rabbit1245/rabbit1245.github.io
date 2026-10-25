import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4173/',source=process.env.KBALL_REALISM_SAVE||'test-results/pending-274/native-year-1.json',out=process.env.KBALL_TEST_RESULTS_DIR||'test-results/pending-274/realism-ui';
const c=JSON.parse(await readFile(source,'utf8')).career;await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}),page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(120000);
async function saved(){await page.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor();await page.locator('.processing').waitFor({state:'hidden'});assert.deepEqual(await page.getByRole('alert').allTextContents(),[]);}
try{
 await page.goto(url,{waitUntil:'networkidle'});await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(source);await page.getByRole('heading',{level:1,name:'라커룸',exact:true}).waitFor();await saved();
 assert.ok((await page.getByTestId('game-version').textContent()).includes('2.8.0'));
 await page.getByTestId('player-tab').click();await page.getByTestId('player-view-leadership').click();await page.getByTestId('captain-scope-national').click();
 const assessment=await page.getByTestId('captain-assessment').innerText();assert.ok(assessment.includes('포르투갈'));assert.match(assessment,/주전 평균 OVR \d+/);await page.screenshot({path:out+'/national-assessment.png'});
 await page.getByTestId('career-tab').click();await page.getByTestId('career-view-national').click();const national=await page.locator('.national-status').innerText();assert.match(national,/성인/);assert.ok(c.systems.national.matches.some(m=>m.playerPlayed),'the source really has actual international appearances');
 await page.getByTestId('career-view-awards').click();assert.ok((await page.locator('body').innerText()).includes('세리에 A 올해의 팀 · AIC'));await page.screenshot({path:out+'/awards.png'});
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await saved();await page.getByTestId('career-tab').click();await page.getByTestId('career-view-seasons').click();assert.ok((await page.locator('body').innerText()).includes(String(c.history[0].year)));
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/annual-mobile.png'});
 assert.deepEqual(errors,[]);const result={url,source,version:'2.8.0',nationalAssessment:assessment,actualNationalStatus:national,leagueTeamOfYearVisible:true,reload:true,annualRecordPreserved:true,mobileOverflow:false,errors};await writeFile(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}
