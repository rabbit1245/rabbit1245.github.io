import { chromium } from './stored-careers.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.KBALL_TEST_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const results = path.resolve(process.env.KBALL_TEST_RESULTS_DIR || 'test-results');
await mkdir(results, { recursive: true });
const errors = [], completed = [], skipped = [], requests = [];
const portable = /\.html(?:[?#]|$)/.test(baseURL);
let activePage;

// Keep the 17MB persistent world inside the browser during polling.
async function saved(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('kball-careers', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('slots')) { db.close(); resolve([]); return; }
      const transaction = db.transaction('slots', 'readonly'), read = transaction.objectStore('slots').getAll();
      transaction.oncomplete = async () => {
        db.close(); resolve((await Promise.all(read.result.map(window.__readKballStored))).map(c => {
          const summarizeMatch = m => ({ id:m.id,fixtureId:m.fixtureId,round:m.round,seasonYear:m.seasonYear,homeId:m.homeId,awayId:m.awayId,homeGoals:m.homeGoals,awayGoals:m.awayGoals,playerStats:m.playerStats,metricsVersion:m.metricsVersion,scope:m.scope,competitionId:m.competitionId });
          return {...c,season:{...c.season,matches:c.season.matches.map(summarizeMatch)},history:c.history.map(h=>({...h,matches:h.matches.map(summarizeMatch)})),systems:c.systems?{...c.systems,world:undefined,clubCompetitions:c.systems.clubCompetitions?{...c.systems.clubCompetitions,current:c.systems.clubCompetitions.current.map(({playerStats,...t})=>({...t,matches:t.matches.map(summarizeMatch)})),history:c.systems.clubCompetitions.history.map(({playerStats,...t})=>({...t,matches:t.matches.map(summarizeMatch)}))}:undefined,national:{...c.systems.national,matches:c.systems.national.matches.map(summarizeMatch),history:c.systems.national.history.map(h=>({...h,matches:h.matches.map(summarizeMatch)})),teamResults:undefined}}:undefined};
        }));
      };
      transaction.onabort = () => reject(transaction.error);
    };
  }));
}
async function worldDigest(page,id) {
  return page.evaluate(id=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('kball-careers',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('slots','readonly'),read=tx.objectStore('slots').get(id);
      tx.oncomplete=async()=>{db.close();try{const source=JSON.stringify((await window.__readKballStored(read.result)).systems.world),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));resolve(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''));}catch(error){reject(error);}};tx.onabort=()=>reject(tx.error);
    };
  }),id);
}
async function waitState(page, predicate, label) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = (await saved(page)).find(predicate);
    if (state) { console.log('Verified:',label); return state; }
    const alerts=await page.getByRole('alert').allTextContents();if(alerts.length)throw new Error(`${label}: ${alerts.join(' | ')}`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out: ${label}. Alerts: ${await page.getByRole('alert').allTextContents()}`);
}
async function ready(page) { await page.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'}); await page.locator('.processing').waitFor({state:'hidden'}); }
async function navigate(page, id) { await page.getByTestId(`${id}-tab`).click(); assert.equal(await page.getByTestId(`${id}-tab`).getAttribute('aria-current'),'page'); }
async function noOverflow(page, label) { const width=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.document<=width.viewport+1,`${label}: horizontal overflow ${JSON.stringify(width)}`); }
async function visibleRows(page,selector,count,label) {
  await page.evaluate(()=>window.scrollTo(0,0));
  const rows=await page.locator(selector).evaluateAll(elements=>elements.map(element=>{
    const box=element.getBoundingClientRect();return {text:element.textContent,top:box.top,bottom:box.bottom,left:box.left,right:box.right,width:box.width,height:box.height,viewportWidth:innerWidth,viewportHeight:innerHeight};
  }));
  assert.equal(rows.length,count,`${label}: every ability must be present`);
  for(const row of rows)assert.ok(row.width>0&&row.height>0&&row.top>=0&&row.bottom<=row.viewportHeight+1&&row.left>=0&&row.right<=row.viewportWidth+1,`${label}: row must fit without scrolling ${JSON.stringify(row)}`);
  const fonts=await page.locator(`${selector} .attribute-name,${selector} .attribute-values strong,${selector} .training-name,${selector} > strong`).evaluateAll(elements=>elements.map(element=>({text:element.textContent,size:parseFloat(getComputedStyle(element).fontSize)})));
  assert.ok(fonts.length>=count*2,`${label}: names and current values have measured fonts`);
  for(const font of fonts)assert.ok(font.size>=17,`${label}: primary text must be at least 17px ${JSON.stringify(font)}`);
  await noOverflow(page,label);
}
async function desktopLayouts(page) {
  for(const viewport of [{width:1366,height:768},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);await navigate(page,'locker');
    for(const selector of ['[data-testid="advance-half"]','.locker-core']){
      const box=await page.locator(selector).boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=viewport.height+1,`${viewport.width} locker essentials must fit ${JSON.stringify(box)}`);
    }
    await page.screenshot({path:path.join(results,`kball-locker-${viewport.width}.png`),fullPage:false});
    await page.setViewportSize(viewport);await navigate(page,'player');await page.getByTestId('player-view-attributes').click();
    await visibleRows(page,'.attribute-row',20,`${viewport.width}x${viewport.height} attributes`);
    await page.screenshot({path:path.join(results,`kball-attributes-${viewport.width}.png`),fullPage:false});
    await page.getByTestId('player-view-training').click();await visibleRows(page,'.training-row',20,`${viewport.width}x${viewport.height} training`);
    assert.equal(await page.getByTestId('confirm-training').count(),0,'the first-season creation plan is already confirmed');
    await page.screenshot({path:path.join(results,`kball-training-${viewport.width}.png`),fullPage:false});
  }
  await page.setViewportSize({width:1093,height:614});await navigate(page,'player');await page.getByTestId('player-view-attributes').click();
  await noOverflow(page,'125% equivalent desktop layout');
  const enlarged=await page.locator('.attribute-name').evaluateAll(rows=>rows.map(row=>parseFloat(getComputedStyle(row).fontSize)));
  assert.equal(enlarged.length,20);assert.ok(enlarged.every(size=>size>=17),'a smaller CSS viewport reflows without reducing the primary font');
  await page.setViewportSize({width:1440,height:1000});await navigate(page,'locker');
}
async function skipPresentation(page) { const skip=page.getByRole('button',{name:'연출 건너뛰기'});if(await skip.isVisible())await skip.click(); }
async function closeDialog(page) { const dialog=page.getByRole('dialog');if(await dialog.isVisible())await dialog.getByRole('button',{name:'닫기',exact:true}).first().click(); }
async function fullStandings(page,career,mobile=false) {
  await page.getByTestId('standings-more').click();
  const rows=await page.getByTestId('full-standings').locator('tbody tr').evaluateAll(rows=>rows.map(row=>({clubId:row.dataset.clubId,values:[...row.cells].map(cell=>cell.textContent.trim())})));
  assert.equal(rows.length,career.season.table.length);
  for(const [i,row] of rows.entries()){
    const t=career.season.table[i];assert.equal(row.clubId,t.clubId);assert.equal(Number(row.values[0]),i+1);
    assert.deepEqual(row.values.slice(2).map(Number),[t.played,t.won,t.drawn,t.lost,t.goalsFor,t.goalsAgainst,t.goalsFor-t.goalsAgainst,t.points]);
  }
  assert.equal(await page.getByTestId('full-standings').locator('tr.my-team').count(),1);
  if(mobile){
    const scroll=page.getByTestId('full-standings-scroll');assert.ok(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth));
    await scroll.evaluate(el=>el.scrollLeft=el.scrollWidth);
    const last=await page.getByTestId('full-standings').locator('thead th').last().boundingBox();assert.ok(last&&last.x>=0&&last.x+last.width<=390,'the points column can be reached by horizontal scrolling');
  }
  await noOverflow(page,'full league standings');await closeDialog(page);
}
async function downloadText(page,career) {
  let count=0;const observeDownload=()=>count++;page.on('download',observeDownload);
  const pending=page.waitForEvent('download');await page.getByTestId('career-text-download').click();const download=await pending;
  assert.equal(download.suggestedFilename(),`K볼_${career.player.name}_은퇴커리어.txt`);
  const file=path.join(results,download.suggestedFilename());await download.saveAs(file);page.off('download',observeDownload);assert.equal(count,1);
  const bytes=await readFile(file),text=bytes.toString('utf8');assert.equal(text.charCodeAt(0),0xfeff);assert.ok(!/(?<!\r)\n/.test(text));
  for(const section of ['A. 선수 기본 정보','B. 통산 총합 스탯 · 팀 수상','C. 연도별 기록'])assert.ok(text.includes(section),section);
  assert.doesNotMatch(text,/"profile"|"playerId"|"byCause"/);assert.ok(text.includes(career.player.name));for(const h of career.history)assert.ok(text.includes(`[${h.year}시즌]`));
  assert.equal((await saved(page)).find(c=>c.id===career.id).revision,career.revision,'TXT export does not change the save');
}
async function openCommon(page) { await page.getByTestId('common-menu').click();await page.getByRole('dialog',{name:'커리어 보관함과 설정'}).waitFor(); }
async function exportFile(page, name) {
  await openCommon(page);
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'JSON 내보내기',exact:true}).click();const download=await promise;
  const file=path.join(results,name);await download.saveAs(file);await closeDialog(page);return file;
}
async function create(page,{name,age=20,position='CAM',talent='S',difficulty='realistic',intensity='intense'}) {
  await page.getByTestId('new-career').click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('선수 이름',{exact:true}).fill(name);await dialog.getByLabel('시작 나이',{exact:true}).fill(String(age));
  await dialog.getByLabel('주 포지션',{exact:true}).selectOption(position);await dialog.getByLabel('초기 재능',{exact:true}).selectOption(talent);
  assert.equal(await dialog.getByTestId('creation-player').count(),1);assert.equal(await dialog.getByTestId('create-career').count(),0);await dialog.getByTestId('next-creation-step').click();
  await dialog.getByTestId('creation-club').waitFor();await dialog.getByLabel('난이도',{exact:true}).selectOption(difficulty);
  await dialog.getByLabel('국가',{exact:true}).selectOption('대한민국');await dialog.getByLabel('리그',{exact:true}).selectOption('KR1');await dialog.getByLabel('시작 소속',{exact:true}).selectOption('senior');
  await dialog.getByTestId('next-creation-step').click();await dialog.getByTestId('creation-training').waitFor();
  assert.equal(await dialog.locator('.training-row').count(),position==='GK'?10:20);assert.equal(await dialog.locator('.training-row[aria-pressed="true"]').count(),3);
  assert.ok((await dialog.locator('.training-row > strong').allTextContents()).every(value=>/^\d+$/.test(value)),'creation training displays the actual preview values');
  const previewValues=await dialog.locator('.training-row').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.dataset.testid.replace('training-',''),Number(row.querySelector('strong').textContent)])));
  await dialog.getByLabel('훈련 강도').selectOption(intensity);await dialog.getByTestId('create-career').click();await page.getByRole('heading',{level:1,name:'라커룸',exact:true}).waitFor();await ready(page);
  const career=await waitState(page,c=>c.player.name===name&&c.season.week===0,'new career autosave');
  assert.deepEqual(previewValues,career.player.attributes,'creation preview must match every real starting value');return career;
}
function observe(page) {activePage=page;page.setDefaultTimeout(30_000);page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});}
function totals(c) {
  const matches=[...[...(c.systems?.clubCompetitions?.current??[]),...(c.systems?.clubCompetitions?.history??[])].flatMap(t=>t.matches),...c.history.flatMap(h=>h.matches),...(!c.history.some(h=>h.year===c.season.year)?c.season.matches:[])];
  const n=c.systems?.national,seen=new Set();for(const m of [...n?.history.flatMap(h=>h.matches)||[],...n?.matches||[]])if(!seen.has(m.id)){seen.add(m.id);matches.push(m);}
  return matches.reduce((s,m)=>{for(const [k,v]of Object.entries(m.playerStats))s[k]=(s[k]||0)+v;return s;},{});
}
async function dismissRenewal(page, id) {
  const current=(await saved(page)).find(c=>c.id===id);if(!current.systems?.pendingChoice)return current;
  await page.getByRole('dialog',{name:'계약과 다음 행선지'}).waitFor();assert.equal(await page.getByTestId('advance-half').isDisabled(),true);
  await page.getByRole('button',{name:'제안 거절 · 계속 진행',exact:true}).click();const next=await waitState(page,c=>c.id===id&&!c.systems.pendingChoice,'renewal decision');await ready(page);await closeDialog(page);return next;
}

try {
 if(!process.env.KBALL_CHEATS_ONLY){
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'no-preference'}),page=await context.newPage();observe(page);
  await page.goto(baseURL,{waitUntil:'networkidle'});await page.getByTestId('new-career').waitFor();await noOverflow(page,'desktop landing');await page.screenshot({path:path.join(results,'kball-landing.png'),fullPage:true});
  await page.evaluate(()=>localStorage.setItem('career24-legacy-test-sentinel','preserve-existing-save'));
  let career=await create(page,{name:'김도윤'});const originalId=career.id,initialYear=career.season.year,initialClub=career.player.clubId;
  assert.equal(await page.getByRole('navigation',{name:'주요 화면'}).getByRole('button').count(),3);assert.equal(career.intensity,'intense');
  const baselinePath=await exportFile(page,'career-baseline.json'),baseline=JSON.parse(await readFile(baselinePath,'utf8'));assert.equal(baseline.format,'kball-save');assert.equal(baseline.career.id,originalId);
  assert.equal(career.systems.trainingPlan.confirmed,true);assert.equal(career.systems.trainingPlan.forYear,initialYear);
  await desktopLayouts(page);completed.push('1366x768 and 1920x1080 show all 20 abilities and training rows with primary fonts of at least 17px');
  await navigate(page,'player');assert.equal(await page.locator('.attribute-row').count(),20);assert.equal(await page.getByTestId('attribute-passing').locator('.attribute-values strong').textContent(),String(Math.round(career.player.attributes.passing)));
  for(const view of ['growth','contract','leadership']){await page.getByTestId(`player-view-${view}`).click();assert.equal(await page.getByTestId(`player-view-${view}`).getAttribute('aria-current'),'page');}
  await navigate(page,'locker');await page.screenshot({path:path.join(results,'kball-dashboard.png'),fullPage:true});
  // Two clicks in one task must create a single half-season command.
  await page.getByTestId('advance-half').evaluate(b=>{b.click();b.click();});
  career=await waitState(page,c=>c.id===originalId&&c.season.week===c.systems.halfRound,'first half');await ready(page);await skipPresentation(page);
  assert.equal(career.processedCommands.length,1);assert.equal(career.systems.phase,'midseason');assert.equal(career.systems.trainingLocked,true);assert.ok(career.season.matches.length>0);
  const firstHalf=career,firstWorld=await worldDigest(page,originalId);await closeDialog(page);
  // Replaying the exact seed with reduced motion must produce the same game state.
  await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(baselinePath);
  career=await waitState(page,c=>c.id!==originalId&&c.player.name==='김도윤'&&c.season.week===0,'baseline imported into a separate slot');await ready(page);const replicaId=career.id;
  await openCommon(page);await page.getByLabel('연출 줄이기').check();await closeDialog(page);
  await page.getByTestId('advance-half').click();career=await waitState(page,c=>c.id===replicaId&&c.season.week===c.systems.halfRound,'reduced-motion replay');await ready(page);
  assert.equal(await worldDigest(page,replicaId),firstWorld,'presentation choice must not change the persistent world');assert.deepEqual(career.player,firstHalf.player);assert.deepEqual(career.season,firstHalf.season);assert.deepEqual(career.systems.economics,firstHalf.systems.economics);assert.deepEqual(career.systems.national,firstHalf.systems.national);assert.equal(await page.locator('.presentation').count(),0);
  completed.push('creation training, three menus, one-command half progression and identical skipped/reduced-motion results');
  assert.equal(career.systems.pendingChoice,undefined);assert.deepEqual(career.offers,[]);assert.equal(await page.getByTestId('transfer-window').count(),1);assert.equal(await page.getByTestId('training-plan').count(),0);assert.equal(await page.getByText('팀 현황',{exact:true}).count(),0);
  await page.getByTestId('season-details-disclosure').locator(':scope > summary').click();const details=page.getByTestId('locker-season-details');assert.equal(await details.locator('.stat-detail').count(),12);
  const currentNational=[...new Map([...career.systems.national.history.flatMap(h=>h.matches),...career.systems.national.matches].filter(m=>m.seasonYear===career.season.year).map(m=>[m.id,m])).values()];
  const combinedMinutes=career.season.playerStats.minutes+(career.systems.clubCompetitions?.current??[]).flatMap(t=>t.matches).reduce((n,m)=>n+m.playerStats.minutes,0)+currentNational.reduce((sum,m)=>sum+m.playerStats.minutes,0);
  assert.equal(await details.locator('.shared-stats > span').nth(2).textContent(),`시간 ${combinedMinutes.toLocaleString()}′`,'locker details combine actual club and national minutes');
  assert.equal(await page.getByTestId('season-competitions').count(),1);assert.ok((await page.getByTestId('club-competition').allTextContents()).join(' ').includes(career.season.competitionName));
  await navigate(page,'player');await page.getByTestId('player-view-training').click();assert.equal(await page.locator('.training-row:enabled').count(),0);assert.equal(await page.getByTestId('confirm-training').count(),0);await navigate(page,'locker');
  await page.locator('.match-row').first().click();assert.equal(await page.getByRole('dialog').locator('[data-testid="role-metrics"] .stat-detail').count(),12);await closeDialog(page);
  await fullStandings(page,career);
  await page.getByTestId('league-leaders-more').click();assert.ok(await page.getByTestId('league-leaders').locator('tbody tr').count()>0);await closeDialog(page);
  completed.push('all league teams in one modal, actual W/D/L/GF/GA/GD/points and league-only scorer table');
  await navigate(page,'career');assert.equal(await page.locator('.record-summary > button').count(),3);await page.getByTestId('records-scope-club').click();assert.equal(await page.getByTestId('role-metrics').locator('.stat-detail').count(),12);
  const rows=await page.locator('.record-summary > button').evaluateAll(buttons=>buttons.map(b=>Array.from(b.children).slice(1).map(e=>Number(e.textContent.replace(/[^\d]/g,'')))));for(const column of[0,1,2,3])assert.equal(rows[0][column],rows[1][column]+rows[2][column]);
  await page.getByTestId('records-scope-national').click();assert.equal(await page.getByTestId('role-metrics').locator('.stat-detail').count(),12);await navigate(page,'locker');
  await page.getByTestId('advance-half').click();career=await waitState(page,c=>c.id===replicaId&&c.stage==='offseason','second half and season archive');await ready(page);
  assert.equal(career.history.length,1);assert.ok(career.season.fixtures.every(f=>f.played));assert.equal(career.history[0].stats.goals,career.history[0].matches.reduce((s,m)=>s+m.playerStats.goals,0));assert.equal(career.systems.growthReports.filter(r=>r.year===initialYear).length,2);
  completed.push('annual-only contracts, one training route, current competitions, locker combined details and reconciled records');
  // An annual training choice creates a new normal snapshot, then backup restore returns to the old plan.
  assert.equal(await page.getByTestId('advance-half').isDisabled(),false,'current contract or FA permits progressing without forced renewal');
  await page.getByTestId('training-plan').click();
  for(const viewport of [{width:1366,height:768},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);await visibleRows(page,'.training-row',20,`${viewport.width} offseason training`);
    const box=await page.getByTestId('confirm-training').boundingBox();assert.ok(box&&box.y+box.height<=viewport.height+1,'offseason confirmation must fit with all training rows');
    const panel=await page.locator('.training-panel').boundingBox();assert.ok(panel&&panel.y+panel.height<=viewport.height+1,'the complete offseason training panel must fit');
    await page.screenshot({path:path.join(results,`kball-offseason-training-${viewport.width}.png`),fullPage:false});
  }
  await page.setViewportSize({width:1440,height:1000});await page.getByTestId('training-panel').getByLabel('강도').selectOption('balanced');await page.getByTestId('confirm-training').click();
  career=await waitState(page,c=>c.id===replicaId&&c.intensity==='balanced','offseason training change');await ready(page);
  assert.equal(career.systems.trainingPlan.confirmed,true);assert.equal(career.systems.trainingPlan.forYear,initialYear+1);assert.equal(await page.getByTestId('confirm-training').count(),0,'confirming locks the next-season plan');assert.equal(await page.getByTestId('locker-tab').getAttribute('aria-current'),'page','successful training confirmation returns to locker');
  await openCommon(page);page.once('dialog',d=>d.accept());await page.locator('.save-item').filter({has:page.locator('.pill',{hasText:'현재'})}).getByRole('button',{name:'이전 저장 복원',exact:true}).click();
  career=await waitState(page,c=>c.id===replicaId&&c.intensity==='intense','previous-good backup restore');await ready(page);assert.equal(career.stage,'offseason');
  const invalid=structuredClone(baseline);invalid.career.player.name='손상된 커리어';await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles({name:'invalid-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.getByRole('alert').waitFor();assert.equal((await saved(page)).length,2);assert.ok(!(await saved(page)).some(c=>c.player.name==='손상된 커리어'));await page.getByRole('button',{name:'오류 알림 닫기'}).click();
  const completedPath=await exportFile(page,'career-completed.json'),envelope=JSON.parse(await readFile(completedPath,'utf8'));assert.deepEqual(envelope.career.season.playerStats,career.season.playerStats);assert.equal(envelope.career.systems.world.year,initialYear);
  completed.push('JSON export, independent import slot, checksum rejection and previous-good backup restore');
  await page.getByTestId('transfer-window').click();const offerIndex=career.offers.findIndex(o=>o.type==='transfer'),selectedOffer=career.offers[offerIndex>=0?offerIndex:0];assert.ok(selectedOffer,'a valid contract should be available');
  const incomeBefore=career.careerIncome;await page.locator('.offer').nth(offerIndex>=0?offerIndex:0).getByRole('button',{name:'제안 수락'}).click();career=await waitState(page,c=>c.id===replicaId&&c.transferDecision==='signed','contract signing');await ready(page);
  assert.equal(career.player.clubId,selectedOffer.clubId);assert.equal(career.player.wage,selectedOffer.wage);assert.equal(career.careerIncome,incomeBefore);assert.equal(career.history[0].clubId,initialClub);await closeDialog(page);
  assert.equal(await page.getByTestId('advance-half').isDisabled(),false,'a signed contract can start the next season without confirming a training plan');
  await page.getByTestId('training-plan').click();await page.getByTestId('confirm-training').click();career=await waitState(page,c=>c.id===replicaId&&c.systems.trainingPlan.confirmed,'next-season training confirmed after backup restore');await ready(page);await navigate(page,'locker');assert.equal(await page.getByTestId('advance-half').isEnabled(),true);
  await page.getByTestId('advance-half').click();career=await waitState(page,c=>c.id===replicaId&&c.season.year>initialYear&&c.season.week===0&&c.stage==='season','next season');await ready(page);assert.equal(career.player.age,21);assert.equal(career.history.length,1);
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await page.getByRole('heading',{level:1,name:'라커룸',exact:true}).waitFor();await ready(page);assert.equal(await page.evaluate(()=>localStorage.getItem('career24-legacy-test-sentinel')),'preserve-existing-save');
  await navigate(page,'career');await page.getByRole('button',{name:'통산',exact:true}).click();const before=totals(career),summaryBefore=await page.getByTestId('records-scope-all').textContent();
  await page.getByTestId('career-view-retirement').click();page.once('dialog',d=>d.accept());await page.getByTestId('retire-career').click();career=await waitState(page,c=>c.id===replicaId&&c.stage==='retired','retirement');await ready(page);await page.getByRole('heading',{name:'김도윤의 은퇴 기록'}).waitFor();assert.deepEqual(totals(career),before);await page.getByTestId('career-view-records').click();await page.getByRole('button',{name:'통산',exact:true}).click();assert.equal(await page.getByTestId('records-scope-all').textContent(),summaryBefore);assert.equal(career.history.length,1);await noOverflow(page,'desktop career');await page.screenshot({path:path.join(results,'kball-career.png'),fullPage:true});
  completed.push('contract-controlled wage, transfer fees separate from income, next season, reload and retirement totals');
  await downloadText(page,career);
  await page.getByTestId('career-view-awards').click();
  for(const name of ['발롱도르 순위','FIFPRO 월드 11']){await page.getByRole('button',{name,exact:true}).click();assert.equal(await page.locator('.world-candidates,.world-eleven').count(),0);}
  completed.push('one click downloads one complete UTF-8 career TXT, leaves saves untouched and awards show only own selection');
  if(await page.evaluate(()=>!!document.querySelector('script[src*="assets/"]'))){await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'이어서 플레이',exact:true}).click();await page.getByRole('heading',{level:1,name:'라커룸',exact:true}).waitFor();assert.equal((await saved(page)).length,2);await context.setOffline(false);completed.push('production offline reload with saved slots');}else skipped.push('offline cache reload requires a production build');

  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),mobilePage=await mobile.newPage();observe(mobilePage);await mobilePage.goto(baseURL,{waitUntil:'networkidle'});await noOverflow(mobilePage,'mobile landing');let keeper=await create(mobilePage,{name:'이수호',age:24,position:'GK',talent:'SSS',difficulty:'free',intensity:'balanced'});const keeperId=keeper.id;await noOverflow(mobilePage,'mobile locker room');await mobilePage.screenshot({path:path.join(results,'kball-mobile.png'),fullPage:true});await navigate(mobilePage,'player');assert.equal(await mobilePage.locator('.attribute-row').count(),10);assert.equal(await mobilePage.getByTestId('attribute-gkHandling').locator('.attribute-values strong').textContent(),String(Math.round(keeper.player.attributes.gkHandling)));await mobilePage.getByTestId('player-view-training').click();assert.equal(await mobilePage.locator('.training-row').count(),10);await noOverflow(mobilePage,'mobile goalkeeper training');await navigate(mobilePage,'locker');await mobilePage.getByTestId('advance-half').click();keeper=await waitState(mobilePage,c=>c.id===keeperId&&c.season.week===c.systems.halfRound,'mobile goalkeeper half');await ready(mobilePage);keeper=await dismissRenewal(mobilePage,keeperId);assert.ok(keeper.season.playerStats.apps>0);assert.ok(keeper.season.playerStats.saves>0);assert.ok(keeper.season.playerStats.goals<=keeper.season.playerStats.shotsOnTarget);await navigate(mobilePage,'career');await mobilePage.getByTestId('records-scope-club').click();assert.equal(await mobilePage.getByTestId('role-metrics').locator('.stat-detail').count(),10);await noOverflow(mobilePage,'mobile goalkeeper records');await mobilePage.screenshot({path:path.join(results,'kball-mobile-records.png'),fullPage:true});completed.push('mobile three-menu navigation, ten goalkeeper abilities, half progression and ten goalkeeper metrics');
  await navigate(mobilePage,'locker');await fullStandings(mobilePage,keeper,true);completed.push('mobile full standings retain every team and allow reaching the last points column');
 }
  const cheatContext=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),cheatPage=await cheatContext.newPage();observe(cheatPage);await cheatPage.goto(baseURL,{waitUntil:'networkidle'});
  let edited=await create(cheatPage,{name:'치트 기능 검증',age:24});const editorId=edited.id,originalShot=edited.player.attributes.shooting;
  await openCommon(cheatPage);await cheatPage.getByLabel('치트 모드',{exact:true}).check();edited=await waitState(cheatPage,c=>c.id===editorId&&c.systems.cheats?.enabled,'cheat mode ON');await ready(cheatPage);
  await cheatPage.getByLabel('노화 중지',{exact:true}).check();edited=await waitState(cheatPage,c=>c.id===editorId&&c.systems.cheats?.freezeAging,'freeze aging setting');await ready(cheatPage);
  await cheatPage.getByRole('button',{name:'능력치 편집 열기',exact:true}).click();await cheatPage.getByTestId('player-view-attributes').click();await cheatPage.getByLabel('치트 증가량').selectOption('5');await cheatPage.getByRole('button',{name:'슈팅 +5',exact:true}).click();
  edited=await waitState(cheatPage,c=>c.id===editorId&&c.player.attributes.shooting===Math.min(100,originalShot+5),'manual attribute increase');await ready(cheatPage);assert.equal(edited.systems.growthLedger.byCause.cheat.shooting,5);
  await cheatPage.getByTestId('player-view-training').click();await openCommon(cheatPage);await cheatPage.getByRole('button',{name:'능력치 편집 열기',exact:true}).click();await cheatPage.locator('[data-testid="player-view-training"][aria-current="page"]').waitFor();assert.equal(await cheatPage.getByTestId('player-view-training').getAttribute('aria-current'),'page','settings editing opens the training cheat controls');await cheatPage.getByTestId('player-view-attributes').click();
  for(const viewport of [{width:1366,height:768},{width:390,height:844}]){await cheatPage.setViewportSize(viewport);await noOverflow(cheatPage,'cheat editor');const clipped=await cheatPage.locator('.attribute-row').evaluateAll(rows=>rows.filter(row=>Array.from(row.children).some(child=>child.getBoundingClientRect().right>row.getBoundingClientRect().right+1)).length);assert.equal(clipped,0);await cheatPage.screenshot({path:path.join(results,`kball-cheats-${viewport.width}.png`),fullPage:true});}
  await cheatPage.reload({waitUntil:'networkidle'});await cheatPage.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(cheatPage);edited=(await saved(cheatPage)).find(c=>c.id===editorId);assert.equal(edited.systems.cheats.freezeAging,true);assert.equal(edited.player.attributes.shooting,Math.min(100,originalShot+5));
  assert.ok((await cheatPage.getByTestId('season-honours').textContent()).includes('우승한 대회'));assert.ok((await cheatPage.getByTestId('season-honours').textContent()).includes('내 개인 수상'));
  await openCommon(cheatPage);await cheatPage.getByLabel('치트 모드',{exact:true}).uncheck();edited=await waitState(cheatPage,c=>c.id===editorId&&!c.systems.cheats.enabled,'cheat mode OFF');await ready(cheatPage);await closeDialog(cheatPage);await navigate(cheatPage,'player');assert.equal(await cheatPage.locator('.attribute-cheat-button').count(),0);assert.equal(edited.player.attributes.shooting,Math.min(100,originalShot+5));
  completed.push('season honours split trophies/personal awards; cheats edit attributes, retain freeze preference and survive reload on desktop/mobile');await cheatContext.close();
  if(portable){assert.deepEqual([...new Set(requests)],[baseURL],'portable game must not fetch external code/data/images');completed.push('standalone HTML makes no external HTTP asset requests');}
  assert.deepEqual(errors,[],`Browser page errors: ${errors.join(' | ')}`);await writeFile(path.join(results,'browser-results.json'),JSON.stringify({passed:completed,skipped,pageErrors:errors,httpRequests:[...new Set(requests)]},null,2));console.log('Kball browser E2E passed:',JSON.stringify(completed));
}catch(error){if(activePage&&!activePage.isClosed())await activePage.screenshot({path:path.join(results,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(results,'browser-results.json'),JSON.stringify({passed:completed,pageErrors:errors,failure:String(error)},null,2));throw error;}finally{await browser.close();}
