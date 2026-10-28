import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {ACTION_COUNTERS,sumStats} from '../src/game/math.ts';
import {actionCoverage,ACTION_LABELS} from '../src/game/action-metrics.ts';
import {careerMatchLedger,careerRecordTotals,buildCareerText} from '../src/game/career-text.ts';
import {seasonOverview,newestMatchFirst} from '../src/game/season-overview.ts';

const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4190/Kball.html';
const root=process.env.KBALL_ACTION_RESULTS||'test-results/release-2.10.0',out=`${root}/records-ui`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}),errors=[],external=[],checks=[];
const fixtures=[['CB',1366,`${root}/careers/CB-season.json`],['GK',390,`${root}/careers/GK-season.json`],['legacy',1366,'test-results/release-2.9.5/fixtures/season.json'],['mixed',390,`${root}/careers/legacy-mixed.json`],['retired',1366,`${root}/careers/CB-retired.json`],['long',1366,`${root}/careers/long-mixed.json`]];
async function ready(p){await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await p.locator('.processing').waitFor({state:'hidden'});assert.deepEqual(await p.getByRole('alert').allTextContents(),[]);}
async function metrics(locator,stats,position){
  assert.equal(await locator.locator('.stat-detail').count(),position==='GK'?10:12);
  const coverage=actionCoverage(stats),keys=position==='GK'?['punches']:ACTION_COUNTERS.filter(k=>k!=='punches');
  for(const key of keys){const tile=locator.getByTestId(`metric-${key}`);assert.equal(await tile.locator(':scope > span').innerText(),ACTION_LABELS[key]);assert.equal(await tile.locator(':scope > strong').innerText(),coverage.known?`${stats[key]??0}${coverage.partial?'*':''}`:'미집계');}
}
try{
  for(const [label,width,file]of fixtures){
    const original=JSON.parse(await readFile(file,'utf8')).career,position=original.player.position,ledger=careerMatchLedger(original),all=[...ledger.club,...ledger.national],totals=careerRecordTotals(original);
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',acceptDownloads:true}),p=await context.newPage();p.setDefaultTimeout(180000);
    p.on('pageerror',e=>errors.push(String(e)));p.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)external.push(r.url());});
    await p.goto(url,{waitUntil:'networkidle'});await context.setOffline(true);const start=performance.now();await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(path.resolve(file));await ready(p);const importMs=performance.now()-start;
    assert.ok((await p.getByTestId('game-version').innerText()).includes('2.10.0'));
    await p.getByTestId('season-details-disclosure').locator('summary').click();await metrics(p.getByTestId('locker-season-details').getByTestId('role-metrics'),seasonOverview(original).combined,position);
    await p.getByTestId('career-tab').click();await p.getByTestId('career-view-records').click();await p.getByRole('button',{name:'통산',exact:true}).click();
    for(const scope of ['all','club','national']){await p.getByTestId(`records-scope-${scope}`).click();await metrics(p.getByTestId('role-metrics'),totals[scope],position);}
    await p.getByTestId('records-scope-all').click();const competition=all.find(m=>m.playerPlayed&&m.competitionId)?.competitionId;assert.ok(competition);
    await p.getByLabel('기록 대회',{exact:true}).selectOption(competition);const filtered=all.filter(m=>m.competitionId===competition);await metrics(p.getByTestId('role-metrics'),sumStats(filtered.map(m=>m.playerStats)),position);
    await p.getByTestId('record-match-ledger').click();await p.locator('.match-row').first().click();const match=[...filtered].sort(newestMatchFirst)[0];await metrics(p.getByRole('dialog').getByTestId('role-metrics'),match.playerStats,position);await p.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
    const [txt]=await Promise.all([p.waitForEvent('download'),p.getByTestId('career-text-download').click()]);await txt.saveAs(`${out}/${label}.txt`);assert.equal(await readFile(`${out}/${label}.txt`,'utf8'),buildCareerText(original));
    await p.getByTestId('career-view-records').click();await p.getByLabel('기록 대회',{exact:true}).selectOption('all');await p.getByRole('button',{name:`핵심 ${position==='GK'?10:12}개 지표`,exact:true}).click();await p.getByTestId('role-metrics').scrollIntoViewIfNeeded();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:`${out}/${label}-${width}.png`,fullPage:true});
    await p.getByTestId('common-menu').click();const [download]=await Promise.all([p.waitForEvent('download'),p.getByRole('dialog').getByRole('button',{name:'JSON 내보내기',exact:true}).click()]);const exportPath=`${out}/${label}.json`;await download.saveAs(exportPath);const exported=JSON.parse(await readFile(exportPath,'utf8')).career;
    assert.deepEqual(careerRecordTotals(exported),totals);assert.deepEqual(careerMatchLedger(exported),ledger);assert.deepEqual(exported.player.attributes,original.player.attributes);assert.deepEqual(exported.history.map(h=>h.stats),original.history.map(h=>h.stats));assert.equal(exported.player.ovr,original.player.ovr);
    await context.setOffline(false);await p.reload({waitUntil:'networkidle'});await context.setOffline(true);await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(p);await p.getByTestId('career-tab').click();await p.getByTestId('career-view-records').click();await p.getByRole('button',{name:'통산',exact:true}).click();await metrics(p.getByTestId('role-metrics'),totals.all,position);
    checks.push({fixture:label,width,bytes:(await stat(file)).size,seasons:original.history.length,importMs:Math.round(importMs),locker:true,careerScopes:true,competition:true,match:true,txtExactMatch:true,JSONExport:true,reload:true,coverage:actionCoverage(totals.all),abilitiesAndPastStatsUnchanged:true,noOverflow:true});console.log('Verified records',JSON.stringify(checks.at(-1)));await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(`${out}/results.json`,JSON.stringify({url,checks,errors,external},null,2)+'\n');
}finally{await browser.close();}
