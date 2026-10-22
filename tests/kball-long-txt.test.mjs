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
  const appendix=text.slice(text.indexOf('\r\n{\r\n',text.indexOf('L. 원본 보존'))+2),raw=JSON.parse(appendix);
  assert.deepEqual(raw.profile,career.player);assert.equal(raw.history.length,30);
  for(const [i,h] of career.history.entries()){
    assert.ok(text.includes(`[${h.year}시즌]`));assert.deepEqual(raw.history[i].stats,h.stats);assert.deepEqual(raw.history[i].details,h.details);
    assert.deepEqual(raw.history[i].matches,h.matches.map(m=>({...m,performers:m.performers?.filter(p=>p.id===career.player.id)})));
  }
  assert.deepEqual(raw.awards,career.awards);assert.deepEqual(raw.transfers,career.transfers);assert.deepEqual(raw.economics,career.systems.economics);assert.deepEqual(raw.leadership,career.systems.leadership);
  assert.deepEqual(raw.growthReports,career.systems.growthReports);assert.deepEqual(raw.season.playerStats,career.season.playerStats);assert.deepEqual(raw.season.table,career.season.table);
  assert.equal(raw.national.history.length,career.systems.national.history.length);
  for(const [i,h] of career.systems.national.history.entries()){
    const exported=raw.national.history[i];assert.equal(exported.competitionId,h.competitionId);assert.equal(exported.result,h.result);assert.deepEqual(exported.stats,h.stats);assert.equal(exported.matches.length,h.matches.length);
    for(const [j,m] of h.matches.entries()){assert.equal(exported.matches[j].fixtureId,m.fixtureId);assert.deepEqual(exported.matches[j].playerStats,m.playerStats);}
  }
  assert.equal(raw.national.teamResults.length,career.systems.national.teamResults.length);
  for(const [i,r] of career.systems.rankings.entries()){assert.equal(raw.rankings[i].playerRank,r.playerRank);assert.equal(raw.rankings[i].world11.some(p=>p.playerId===career.player.id),r.world11.some(p=>p.playerId===career.player.id));assert.ok(raw.rankings[i].candidates.every(p=>p.playerId===career.player.id));}
  if(process.env.KBALL_EXPECTED_TXT)assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(await readFile(process.env.KBALL_EXPECTED_TXT)).digest('hex'),'browser download equals the engine’s complete TXT');
  assert.deepEqual(errors,[]);const report={source,saveBytes:(await readFile(source)).length,txtBytes:bytes.length,seasons:raw.history.length,clubMatches:raw.history.reduce((s,h)=>s+h.matches.length,0),newSeasonSnapshots:raw.history.filter(h=>h.details).length,downloads:downloads.length,bom:true,crlf:true,allOriginalOwnSeasonData:true,reload:true,pageErrors:errors};
  await writeFile(path.join(output,'long-txt-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
