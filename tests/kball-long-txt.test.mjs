import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const source=path.resolve(process.env.KBALL_LONG_SAVE||'test-results/long-career-30-seasons.json');
const output=path.resolve(process.env.KBALL_TEST_RESULTS_DIR||'test-results/v23/long-txt');
const envelope=JSON.parse(await readFile(source,'utf8')),career=envelope.career;
assert.equal(career.stage,'retired');assert.equal(career.history.length,30);await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}),errors=[],downloads=[];
const page=await browser.newPage({viewport:{width:1366,height:768},acceptDownloads:true});page.setDefaultTimeout(180_000);page.on('pageerror',e=>errors.push(String(e)));page.on('download',d=>downloads.push(d));
try{
  await page.goto(process.env.KBALL_TEST_URL||'http://127.0.0.1:4180/Kball.html',{waitUntil:'networkidle'});
  await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(source);await page.getByRole('heading',{level:1,name:'라커룸',exact:true}).waitFor();
  await page.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor();await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await page.getByRole('heading',{level:1,name:'라커룸',exact:true}).waitFor();
  await page.getByTestId('career-tab').click();const pending=page.waitForEvent('download');await page.getByTestId('career-text-download').click();const download=await pending;
  assert.equal(downloads.length,1);assert.equal(download.suggestedFilename(),`K볼_${career.player.name}_은퇴커리어.txt`);
  const target=path.join(output,download.suggestedFilename());await download.saveAs(target);const bytes=await readFile(target),text=bytes.toString('utf8');assert.equal(text.charCodeAt(0),0xfeff);assert.ok(!/(?<!\r)\n/.test(text));
  assert.equal((text.match(/\[\d{4}시즌\]/g)??[]).length,30);
  assert.doesNotMatch(text,/"profile"|"byCause"|"playerId"|"schemaVersion"|原本|L\. 원본 보존/);
  for(const h of career.history){assert.ok(text.includes(`[${h.year}시즌]`));assert.ok(text.includes(`${h.competitionName}`));}
  for(const a of career.awards)assert.ok(text.includes(a.name),a.name);
  const club=[...new Map([...career.history.flatMap(h=>h.matches),...career.season.matches].map(m=>[m.fixtureId||m.id,m])).values()];
  const national=[...new Map([...career.systems.national.history.flatMap(h=>h.matches),...career.systems.national.matches].map(m=>[m.fixtureId||m.id,m])).values()];
  const sourceMatches=[...club,...national];
  const matchSection=text.slice(text.indexOf('K. 전체 순위'),text.indexOf('L. 훈련'));
  const blocks=matchSection.split(/\r\n(?=\[\d{4}년 [^\r\n]* \/ [^\r\n]*\] )/).filter(block=>block.includes('내 출전:'));
  assert.equal(blocks.length,sourceMatches.length,'all club and international matches remain readable');
  const labels={apps:'출전 경기',minutes:'출전 시간(분)',goals:'득점(골)',assists:'도움(개)',saves:'선방(회)',cleanSheets:'무실점 경기',keyPasses:'키패스(회)',shotsOnTarget:'유효 슈팅(회)'};
  for(const [key,label] of Object.entries(labels)){
    const found=blocks.reduce((sum,block)=>{const line=block.split('\r\n').find(line=>line.startsWith(label+': '));return sum+(line&&/^\d+(?:\.\d+)?$/.test(line.slice(label.length+2))?Number(line.slice(label.length+2)):0);},0);
    const expected=sourceMatches.reduce((sum,m)=>sum+(m.playerStats[key]??0),0);assert.ok(Math.abs(found-expected)<.01,`${label}: all original matches reconcile`);
  }
  if(process.env.KBALL_EXPECTED_TXT)assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(await readFile(process.env.KBALL_EXPECTED_TXT)).digest('hex'),'browser download equals the engine’s complete TXT');
  assert.deepEqual(errors,[]);const report={source,saveBytes:(await readFile(source)).length,txtBytes:bytes.length,seasons:career.history.length,clubMatches:club.length,nationalMatches:national.length,newSeasonSnapshots:career.history.filter(h=>h.details).length,downloads:downloads.length,bom:true,crlf:true,rawJSON:false,readableMatchTotalsReconcile:true,reload:true,pageErrors:errors};
  await writeFile(path.join(output,'long-txt-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
