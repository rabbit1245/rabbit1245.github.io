import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

// A slow player download must not hold the menu or player creation screen hostage.
let releasePlayers;
const playerDownload=new Promise(resolve=>{releasePlayers=resolve});
await page.route('**/data/player-db.js*',async route=>{await playerDownload;await route.continue()});
await page.addInitScript(()=>{window.__dbReadyEvents=0;window.addEventListener('career24-db-state',()=>window.__dbReadyEvents++)});
await page.goto('http://127.0.0.1:4173/',{waitUntil:'commit',timeout:30000});
await page.waitForFunction(()=>window.CAREER24_V55_STABLE&&window.CAREER24_V56_QA?.version==='V5.6 CAREER BALANCE',null,{timeout:10000});
assert.equal(await page.locator('#mainScreen').isVisible(),true,'menu must show before the player download finishes');
assert.equal(await page.evaluate(()=>window.CAREER24_LIVE_DB.state==='ready'),false);
await page.click('#newGameBtn');
await page.waitForSelector('#createScreen.active',{timeout:10000});
releasePlayers();
await page.waitForFunction(()=>window.CAREER24_LIVE_DB?.state==='ready'&&window.CAREER24_V55_DATA?.count()===16161,null,{timeout:30000});
const boot=await page.evaluate(()=>{
  const live=window.CAREER24_LIVE_DB,players=live.players,finishedAt=live.finishedAt;
  window.CAREER24_FAST_DB_BOOT();window.CAREER24_RECONNECT_REAL_DB();
  return{count:playerDb().length,samePlayers:players===live.players,sameFinish:finishedAt===live.finishedAt,events:window.__dbReadyEvents};
});
assert.deepEqual(boot,{count:16161,samePlayers:true,sameFinish:true,events:1},'repeat boot must reuse the initialized DB');
assert.equal(await page.locator('#editorRows .editor-row').count(),0,'hidden editor must stay unrendered at startup');
await page.waitForFunction(()=>document.querySelector('#clubPreview')?.textContent?.trim().length>0,{timeout:10000});
assert.equal(await page.locator('#clubPreview img').count(),0,'logos must be disabled in club preview');
const talentOptions=await page.locator('#v3Talent option').allTextContents();
assert.equal(talentOptions.length,5,'V5.6 must expose five talent tiers');
assert.deepEqual(talentOptions.map(x=>x.split(' · ')[0]),['최하','하','중','상','최상']);
await page.selectOption('#v3Talent','최상');

await page.click('#careerStartBtn');
await page.waitForSelector('#gameScreen.active',{timeout:10000});

const initial=await page.evaluate(()=>({year:game.seasonYear,age:game.age,club:game.club,talent:game.talentRank}));
assert.equal(initial.talent,'최상','five-tier talent must survive legacy render compatibility');

const balanceQa=await page.evaluate(()=>{
  const saved={ovr:game.ovr,lastResult:game.lastResult,age:game.age,freeze:game.agingFreeze,attrs:JSON.parse(JSON.stringify(game.attributes)),pos:game.player.pos};
  game.ovr=95;
  game.lastResult={rating:7.8,apps:40,stats:{goals:20,assists:18}};
  const offers=generateOffers();
  const powers=offers.map(o=>{const c=clubByName(o.club);return Math.round((window.teamPowerScore?window.teamPowerScore(c):c.power)||0)});
  const unique=new Set(offers.map(o=>o.club)).size;

  game.age=35;game.agingFreeze=false;Object.keys(game.attributes).forEach(k=>game.attributes[k]=80);
  game.ovr=calcOVR(game.attributes,game.player.pos,game.player.role);
  const before=Object.values(game.attributes).reduce((a,b)=>a+b,0);
  applyAging();
  const after=Object.values(game.attributes).reduce((a,b)=>a+b,0);
  const aging={lost:before-after,meta:game.lastAgingDecline};

  const club=currentClub();
  game.ovr=100;
  const lowOutput={
    apps:40,rating:8.1,
    stats:{goals:3,assists:4,tackles:0,interceptions:0,blocks:0,clean:0,keyPasses:10},
    competitions:{league:{rank:1},cup:{result:'우승'},continental:{name:'UEFA Champions League',result:'우승'}},
    national:{apps:8,goals:1,assists:0,tournament:'FIFA 월드컵',result:'우승'}
  };
  const lowAwards=calcAwards(lowOutput,club,()=>.1).map(x=>x.name);

  const natStar={
    apps:40,rating:7.8,
    stats:{goals:15,assists:18,tackles:0,interceptions:0,blocks:0,clean:0,keyPasses:40},
    competitions:{league:{rank:2},cup:{result:'4강'},continental:{name:'UEFA Champions League',result:'4강'}},
    national:{apps:7,goals:4,assists:2,tournament:'FIFA 월드컵',result:'우승'}
  };
  game.player.pos='AM';
  const natAwards=calcAwards(natStar,club,()=>.1).map(x=>x.name);

  game.ovr=saved.ovr;game.lastResult=saved.lastResult;game.age=saved.age;game.agingFreeze=saved.freeze;game.attributes=saved.attrs;game.player.pos=saved.pos;
  return{offerCount:offers.length,unique,powers,aging,lowAwards,natAwards};
});
assert.equal(balanceQa.offerCount,3,'transfer market must always return exactly three external offers');
assert.equal(balanceQa.unique,3,'transfer offers must be three different clubs');
assert.ok(balanceQa.powers.filter(x=>x>=92).length>=2,'OVR 95 must receive at least two elite-club offers');
assert.ok(balanceQa.aging.lost>0&&balanceQa.aging.meta?.total>0,'35-year-old player must lose attributes when aging cheat is off');
assert.equal(balanceQa.lowAwards.includes('발롱도르'),false,'7 G+A season must never win Ballon d’Or from OVR alone');
assert.ok(balanceQa.natAwards.includes('FIFA 월드컵 골든볼'),'elite national-tournament performance must support Golden Ball');

const target=initial.club==='레알 마드리드'?'아스널':'레알 마드리드';

await page.evaluate((target)=>{
  game.stage='transfer';
  pendingOffers=[{type:'transfer',club:target,years:3,role:'주전',wage:5000,fee:25,reason:'E2E TEST'}];
  renderGame();
  openPane('transferPane',document.querySelector('[data-pane="transferPane"]'));
},target);

await page.locator('#transferPane button', {hasText:'수락'}).first().click();
await page.waitForSelector('#v55EndTurnBtn',{timeout:10000});
const preTurn=await page.evaluate(()=>({year:game.seasonYear,age:game.age,stage:game.stage,pending:game.pendingTransfer?.toClub,club:game.club}));
assert.equal(preTurn.stage,'turnend');
assert.equal(preTurn.pending,target);
assert.equal(preTurn.club,initial.club,'transfer must commit only at turn end');

await page.click('#v55EndTurnBtn');
await page.waitForFunction((y)=>game.seasonYear===y+1&&game.stage==='season',initial.year,{timeout:10000});
const post=await page.evaluate(()=>({year:game.seasonYear,age:game.age,stage:game.stage,club:game.club,pending:game.pendingTransfer||null}));
assert.equal(post.year,initial.year+1);
assert.equal(post.age,initial.age+1);
assert.equal(post.stage,'season');
assert.equal(post.club,target);
assert.equal(post.pending,null);

// Double-click / duplicate transition guard.
await page.evaluate(()=>endTurn());
const afterSecond=await page.evaluate(()=>game.seasonYear);
assert.equal(afterSecond,post.year,'second endTurn call must not advance another year');

if(pageErrors.length)throw new Error('Page errors: '+pageErrors.join(' | '));
console.log('Browser E2E passed',initial,'=>',post);

// A missing optional bundle leaves the shell usable and must not retry a large CSV.
const missing=await browser.newPage();
const requests=[];
missing.on('request',r=>requests.push(r.url()));
await missing.route('**/data/player-db.js*',route=>route.abort());
await missing.goto('http://127.0.0.1:4173/',{waitUntil:'load'});
assert.equal(await missing.evaluate(()=>window.CAREER24_LIVE_DB.state),'error');
assert.equal(requests.some(u=>/male_players\.csv|logos\.json/.test(u)),false);
await missing.click('#newGameBtn');
await missing.waitForSelector('#createScreen.active');
await missing.close();
await browser.close();
