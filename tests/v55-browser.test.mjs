import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForFunction(()=>window.CAREER24_V55_STABLE&&window.CAREER24_V55_DATA?.count()===16161,{timeout:30000});

await page.click('#newGameBtn');
await page.waitForSelector('#createScreen.active',{timeout:10000});
await page.waitForFunction(()=>document.querySelector('#clubPreview')?.textContent?.trim().length>0,{timeout:10000});
assert.equal(await page.locator('#clubPreview img').count(),0,'logos must be disabled in club preview');

await page.click('#careerStartBtn');
await page.waitForSelector('#gameScreen.active',{timeout:10000});

const initial=await page.evaluate(()=>({year:game.seasonYear,age:game.age,club:game.club}));
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
await browser.close();
