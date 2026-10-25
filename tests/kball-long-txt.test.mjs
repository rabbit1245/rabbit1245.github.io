import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const expectedSeasons=Number(process.env.KBALL_EXPECTED_SEASONS||30);
const source=path.resolve(process.env.KBALL_LONG_SAVE||'test-results/long-career-30-seasons.json');
const output=path.resolve(process.env.KBALL_TEST_RESULTS_DIR||'test-results/pending-retirement/long-txt');
const envelope=JSON.parse(await readFile(source,'utf8')),career=envelope.career;
assert.equal(career.stage,'retired');assert.equal(career.history.length,expectedSeasons);await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}),errors=[],downloads=[];
const page=await browser.newPage({viewport:{width:1366,height:768},acceptDownloads:true});page.setDefaultTimeout(180_000);page.on('pageerror',e=>errors.push(String(e)));page.on('download',d=>downloads.push(d));
try{
  await page.goto(process.env.KBALL_TEST_URL||'http://127.0.0.1:4180/Kball.html',{waitUntil:'networkidle'});
  await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(source);await page.getByRole('heading',{level:1,name:'라커룸',exact:true}).waitFor();
  await page.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor();await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await page.getByRole('heading',{level:1,name:'라커룸',exact:true}).waitFor();
  const savedRecord=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('kball-careers',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('slots'),get=tx.objectStore('slots').getAll();tx.oncomplete=()=>{db.close();resolve(get.result.map(s=>({id:s.id,revision:s.envelope?.career.revision??s.journal?.at(-1)?.revision??s.revision,hash:s.envelope?.hash??s.journal?.at(-1)?.hash??s.versionHash})));};};}));
  const beforeRecord=await savedRecord();assert.equal(beforeRecord.length,1);assert.ok(Number.isInteger(beforeRecord[0].revision));
  await page.getByTestId('career-tab').click();const pending=page.waitForEvent('download');await page.getByTestId('career-text-download').click();const download=await pending;
  assert.deepEqual(await savedRecord(),beforeRecord,'TXT export keeps the imported slot ID, revision and save checksum unchanged');
  assert.equal(downloads.length,1);assert.equal(download.suggestedFilename(),`K볼_${career.player.name}_은퇴커리어.txt`);
  const target=path.join(output,download.suggestedFilename());await download.saveAs(target);const bytes=await readFile(target),text=bytes.toString('utf8');assert.equal(text.charCodeAt(0),0xfeff);assert.ok(!/(?<!\r)\n/.test(text));
  assert.equal((text.match(/\[\d{4}시즌\]/g)??[]).length,expectedSeasons);
  assert.doesNotMatch(text,/"profile"|"byCause"|"playerId"|"schemaVersion"|原本|L\. 원본 보존/);
  for(const h of career.history){assert.ok(text.includes(`[${h.year}시즌]`));assert.ok(text.includes(`${h.competitionName}`));}
  // Team medals share their title row instead of repeating the same win.
  for(const a of career.awards.filter(a=>a.category!=='commercial'))assert.ok(text.includes(a.name.replace(/^K볼 선정/,/club|commercial/.test(a.category??'')?'클럽 선정':'언론 선정').replace(/\s*(?:메달|트로피)$/, '')),a.name);
  const cups=[...(career.systems.clubCompetitions?.history??[]),...(career.systems.clubCompetitions?.current??[])];
  const dedupe=ms=>[...new Map(ms.map(m=>[m.fixtureId||m.id,m])).values()];
  const club=dedupe([...career.history.flatMap(h=>h.matches),...career.season.matches,...cups.flatMap(t=>t.matches)]);
  const national=dedupe([...career.systems.national.history.flatMap(h=>h.matches),...career.systems.national.matches]);
  const labels={apps:'출전 경기',starts:'선발 경기',minutes:'출전 시간(분)',goals:'득점(골)',assists:'도움(개)',shots:'슈팅(회)',shotsOnTarget:'유효 슈팅(회)',passes:'패스 시도(회)',passesCompleted:'패스 성공(회)',tackles:'태클 성공(회)',interceptions:'인터셉트(회)',saves:'선방(회)',goalsConceded:'실점(골)',cleanSheets:'무실점 경기',yellowCards:'경고(회)',redCards:'퇴장(회)',mom:'경기 최우수 선수(회)',keyPasses:'키패스(회)',dribbleAttempts:'드리블 시도(회)',dribblesCompleted:'드리블 성공(회)',tackleAttempts:'태클 시도(회)',aerialAttempts:'공중볼 경합 시도(회)',aerialWon:'공중볼 경합 성공(회)',shotsFaced:'피유효슈팅(회)',oneOnOneAttempts:'일대일 대응(회)',oneOnOneSaves:'일대일 선방(회)',penaltiesFaced:'피페널티(회)',penaltiesSaved:'페널티 선방(회)',crossesFaced:'피크로스(회)',crossesCaught:'크로스 포구(회)',sweepingAttempts:'스위핑 시도(회)',sweepingSuccesses:'스위핑 성공(회)',buildUpPasses:'빌드업 패스 시도(회)',buildUpCompleted:'빌드업 패스 성공(회)',longKicks:'롱킥 시도(회)',longKicksCompleted:'롱킥 성공(회)',handlingAttempts:'공 처리 시도(회)',handlingSuccesses:'공 처리 성공(회)',lateActions:'후반 행동(회)',lateSuccesses:'후반 행동 성공(회)'};
  const sum=(rows,key)=>rows.reduce((n,s)=>n+(s[key]??0),0);
  const readStat=(block,label)=>block.split('\r\n').find(l=>l.startsWith(label+': '))?.slice(label.length+2);
  const totals=text.slice(text.indexOf('B. 통산 총합'),text.indexOf('C. 연도별'));
  for(const [key,label] of Object.entries(labels)){
    const rows=[...career.history.map(h=>h.stats),...(!career.history.some(h=>h.year===career.season.year)?[career.season.playerStats]:[]),...dedupe(cups.flatMap(t=>t.matches)).map(m=>m.playerStats),...national.map(m=>m.playerStats)];
    const actual=readStat(totals,label),expected=sum(rows,key);if(expected>0||!actual?.includes('미보존'))assert.ok(Math.abs(Number(actual)-expected)<.01,`career ${label}`);
  }
  for(const h of career.history){
    const start=text.indexOf(`[${h.year}시즌]`),next=text.indexOf('[',start+1),block=text.slice(start,next<0?undefined:next).split('결승 기록:')[0];
    const rows=[h.stats,...dedupe(cups.filter(t=>t.year===h.year).flatMap(t=>t.matches)).map(m=>m.playerStats),...national.filter(m=>m.seasonYear===h.year).map(m=>m.playerStats)];
    for(const [key,label] of Object.entries(labels)){const actual=readStat(block,label),expected=sum(rows,key);if(expected>0||!actual?.includes('미보존'))assert.ok(Math.abs(Number(actual)-expected)<.01,`${h.year} ${label}`);}
    for(const label of ['소속팀:','몸값:','주급:','능력점수:','주장/부주장 여부:','부상 유무:','팀 수상:','개인 수상:','대회별 팀 성적:'])assert.ok(block.includes(label),`${h.year} ${label}`);
  }
  assert.match(text,new RegExp(`\\[${career.retiredYear??career.season.year}시즌\\] 은퇴`));
  assert.doesNotMatch(text,/전체 순위표|전체 대진|수동 노화|고정 능력치|훈련 이력|내 출전:|평점 합계|\/ 90분/);
  const eventDetails=new Set([...club,...national].flatMap(m=>m.events).map(e=>e.detail).filter(d=>d.length>20));
  for(const detail of eventDetails)assert.ok(!text.includes(detail),'minute-by-minute event descriptions are omitted');
  assert.ok(bytes.length<1024*1024,'30-season retirement report stays below 1 MB');
  await page.getByTestId('career-view-retirement').click();await page.getByTestId('retirement-record').waitFor();
  assert.ok((await page.locator('.retirement-facts').first().innerText()).includes('은퇴나이'));
  assert.doesNotMatch(await page.locator('.retirement-facts').first().innerText(),/\$|€/,'retirement identity uses readable Korean units without a stray currency prefix');
  assert.doesNotMatch(await page.locator('.retirement-facts').first().innerText(),/인기·상업|누적 주급|이적료|능력점수/);
  assert.doesNotMatch(text.slice(0,text.indexOf('B. 통산')),/능력점수:/);
  const retirementSeason=page.getByTestId(`retirement-season-${career.retiredYear??career.season.year}`);await retirementSeason.locator('summary').first().click();assert.ok((await retirementSeason.innerText()).includes('은퇴'));
  await page.screenshot({path:path.join(output,'retirement-desktop.png')});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(output,'retirement-mobile.png')});
  if(process.env.KBALL_EXPECTED_TXT)assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(await readFile(process.env.KBALL_EXPECTED_TXT)).digest('hex'),'browser download equals the engine’s complete TXT');
  assert.deepEqual(errors,[]);const report={source,saveBytes:(await readFile(source)).length,txtBytes:bytes.length,seasons:career.history.length,clubMatches:club.length,nationalMatches:national.length,newSeasonSnapshots:career.history.filter(h=>h.details).length,downloads:downloads.length,bom:true,crlf:true,rawJSON:false,annualAndCareerTotalsReconcile:true,eventTimelinesOmitted:true,readOnlyDownload:true,retirementSeasonMarked:true,mobileOverflow:false,reload:true,pageErrors:errors};
  await writeFile(path.join(output,'long-txt-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
