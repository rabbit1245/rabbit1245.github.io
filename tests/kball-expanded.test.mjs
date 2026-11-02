import {chromium} from './stored-careers.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const url=process.env.KBALL_TEST_URL||'http://127.0.0.1:4194/Kball.html',out='test-results/expanded-2120/ui',fixtures='test-results/expanded-2120/fixtures';await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'}),errors=[],checks=[];
async function ready(p){await p.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await p.locator('.processing').waitFor({state:'hidden'});assert.equal(await p.getByRole('alert').count(),0);}
async function load(p,file){await p.goto(url);await p.getByLabel('K볼 저장 파일 가져오기').setInputFiles(`${fixtures}/${file}.json`);await ready(p);}
async function state(p){return p.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('kball-careers',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('slots','readonly'),r=tx.objectStore('slots').getAll();tx.oncomplete=async()=>{try{const careers=await Promise.all(r.result.map(window.__readKballStored)),c=careers.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0],data=JSON.stringify(c.season.matches),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));resolve({player:c.player,stats:c.season.playerStats,personality:c.systems.personality,upgrade:c.systems.abilityUpgrade,matchHash:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')});}catch(e){reject(String(e));}finally{db.close();}};}}));}
try{
 for(const width of [1366,390]){
  const context=await b.newContext({viewport:{width,height:width===390?844:768},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(180000);p.on('pageerror',e=>errors.push(String(e)));
  console.log('Legacy viewport',width);await load(p,'legacy');const before=JSON.parse(await readFile(`${fixtures}/legacy.json`,'utf8')).career,loaded=await state(p);
  assert.equal(loaded.player.abilityVersion,2);assert.equal(Object.keys(loaded.player.attributes).length,25);for(const [k,v]of Object.entries(before.player.attributes))assert.equal(loaded.player.attributes[k],v);
  assert.deepEqual(loaded.stats,before.season.playerStats);assert.equal(loaded.matchHash,createHash('sha256').update(JSON.stringify(before.season.matches)).digest('hex'));
  await p.getByTestId('career-tab').click();await p.getByTestId('records-scope-club').click();assert.equal(await p.getByTestId('role-metrics').locator('.stat-detail').count(),18);assert.match(await p.getByTestId('metric-freeKickGoals').innerText(),/미집계/);assert.match(await p.getByTestId('metric-pressingRate').innerText(),/미집계/);
  if(width===1366){const columns=await p.getByTestId('role-metrics').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert.equal(columns,6);}
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:`${out}/legacy-metrics-${width}.png`,fullPage:true});
  await p.reload();await p.getByRole('button',{name:'이어서 플레이',exact:true}).click();await ready(p);const reloaded=await state(p);assert.deepEqual(reloaded.upgrade,loaded.upgrade);assert.equal(reloaded.matchHash,loaded.matchHash);
  checks.push({width,legacyOriginalAbilitiesAndEventsPreserved:true,oneTimeUpgradeAndReload:true,oldNewStatsUntracked:true,fieldCells:18,noOverflow:true});await context.close();
 }
 const context=await b.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),p=await context.newPage();p.setDefaultTimeout(180000);p.on('pageerror',e=>errors.push(String(e)));await load(p,'raw120');
 console.log('Raw cap and selection');await p.getByTestId('player-tab').click();await p.getByTestId('player-view-training').click();await p.getByTestId('play-skills').locator(':scope>summary').click();
 const initial=(await state(p)).player.ovr;assert.equal(initial,120);
 for(const key of ['finishing','offTheBall','shooting','positioning','composure']){await p.getByTestId(`skill-${key}`).click();await ready(p);assert.equal((await state(p)).player.ovr,120);}
 assert.equal(await p.locator('.play-skill').count(),25);assert.match(await p.getByTestId('play-skills').innerText(),/골 결정력.*현재 120/);await p.getByTestId('play-skills').locator(':scope>summary').click();
 await p.getByTestId('personality-toggle').click();for(let i=0;i<5;i++)await p.getByRole('button',{name:'카드 관리 낮추기',exact:true}).click();assert.match(await p.getByTestId('personality-fairPlay').innerText(),/^0/);await p.getByTestId('save-personality').click();await ready(p);assert.equal((await state(p)).personality.fairPlay,0);
 await p.screenshot({path:`${out}/card-management-zero.png`,fullPage:true});await context.close();
 const earnedContext=await b.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),q=await earnedContext.newPage();q.setDefaultTimeout(180000);q.on('pageerror',e=>errors.push(String(e)));await load(q,'earned130');assert.equal((await state(q)).player.ovr,130);await q.getByTestId('player-tab').click();await q.getByTestId('player-view-training').click();await q.getByTestId('play-skills').locator(':scope>summary').click();assert.match(await q.getByTestId('play-skills').innerText(),/최대 \+2/);await q.screenshot({path:`${out}/earned-130.png`,fullPage:true});await earnedContext.close();
 checks.push({rawCap120:true,fiveSelectionsAddZero:true,all25SkillLabels:true,cardManagementZeroSaved:true,earned130Loads:true});assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({url,checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await b.close();}
