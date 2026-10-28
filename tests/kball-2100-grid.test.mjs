import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='test-results/release-2.10.0/grid-ui',url=process.env.KBALL_GRID_URL||'http://127.0.0.1:4189/grid.html',positions=['GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','SS','ST'];
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),errors=[],checks=[];
async function select(p,position,state,baseline){await p.evaluate(([a,b,c])=>window.__setStatsCase(a,b,c),[position,state,baseline]);await p.locator(`main[data-case="${position}:${state}:${baseline}"]`).waitFor();}
async function dimensions(p){return p.getByTestId('role-metrics').evaluate(el=>{const cells=[...el.children],r=el.getBoundingClientRect();return {height:r.height,width:r.width,columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,rows:[...new Set(cells.map(c=>Math.round(c.getBoundingClientRect().top)))].length,count:cells.length,overflow:cells.filter(c=>c.scrollWidth>c.clientWidth+1).map(c=>c.textContent),minimumLabel:Math.min(...cells.map(c=>parseFloat(getComputedStyle(c.querySelector(':scope > span')).fontSize))),minimumValue:Math.min(...cells.map(c=>parseFloat(getComputedStyle(c.querySelector(':scope > strong')).fontSize)))};});}
try{
  for(const width of [1366,900,600,390,320]){
    const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(String(e)));await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>typeof window.__setStatsCase==='function');
    for(const position of positions)for(const state of ['known','legacy','mixed']){
      await select(page,position,state,true);const old=await dimensions(page);await select(page,position,state,false);const current=await dimensions(page);
      assert.equal(current.count,position==='GK'?10:12);if(position!=='GK'){assert.equal(current.columns,6);assert.equal(current.rows,2);assert.ok(current.height<=old.height*1.08+8,`${width} ${position} ${state}: height ${old.height} → ${current.height}`);}
      assert.deepEqual(current.overflow,[],`${width} ${position} ${state} cell overflow`);assert.ok(current.minimumLabel>=14&&current.minimumValue>=14);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      for(const id of position==='GK'?['punches']:['headerGoals','pressingWins','progressivePasses']){
        const text=await page.getByTestId(`metric-${id}`).innerText();assert.equal(text.includes('미집계'),state==='legacy');if(state==='mixed')assert.ok(text.includes('*'));
      }
      checks.push({width,position,state,...current,previousHeight:old.height});
    }
    for(const position of ['ST','GK']){await select(page,position,'known',false);await page.screenshot({path:`${out}/${position}-${width}.png`,fullPage:true});}
    await page.close();
  }
  assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({url,checks,errors},null,2)+'\n');console.log(`Passed ${checks.length} position/coverage/layout cases`);
}finally{await browser.close();}
