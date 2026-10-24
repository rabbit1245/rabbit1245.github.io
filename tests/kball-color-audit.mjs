import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.KBALL_TEST_URL||'http://127.0.0.1:4173/';
const output=path.resolve(process.env.KBALL_COLOR_RESULTS_DIR||'test-results/color-audit');
const baseline=path.resolve(process.env.KBALL_COLOR_BASELINE||'test-results/career-baseline.json');
const completed=path.resolve(process.env.KBALL_COLOR_COMPLETED||'test-results/career-completed.json');
const fallbackClub=JSON.parse(await readFile('src/game/catalog.json','utf8')).clubs.find(c=>c[3]==='대한민국'&&!c[7]);
for(const file of[baseline,completed])await stat(file);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium'});
const report={baseURL,method:'Computed foreground, ancestor backgrounds and nested group opacity composited in sRGB; WCAG luminance ratio, normal/disabled 4.5 and large text 3.0. Images are not text-audited.',screens:[],pageErrors:[]};

function measureText(){
  const rgba=value=>{
    if(!value||value==='none'||value==='transparent')return[0,0,0,0];
    const values=value.match(/[\d.]+/g)?.map(Number)||[];
    if(value.startsWith('color(srgb'))return[...values.slice(0,3).map(x=>x*255),values[3]??1];
    return[values[0]??0,values[1]??0,values[2]??0,values[3]??1];
  };
  const over=(front,back)=>{
    const alpha=front[3]+back[3]*(1-front[3]);
    return alpha?[...front.slice(0,3).map((c,i)=>(c*front[3]+back[i]*back[3]*(1-front[3]))/alpha),alpha]:[0,0,0,0];
  };
  const luminance=color=>color.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>x-y);return(values[1]+.05)/(values[0]+.05);};
  const id=el=>el.dataset?.testid?`[data-testid="${el.dataset.testid}"]`:el.id?`#${el.id}`:`${el.tagName.toLowerCase()}${[...el.classList||[]].slice(0,3).map(c=>'.'+c).join('')}`;
  const visible=el=>{
    for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0)return false;if(p instanceof HTMLDetailsElement&&!p.open&&!p.querySelector(':scope > summary')?.contains(el))return false;}
    return true;
  };
  const dialog=[...document.querySelectorAll('[role="dialog"]')].find(visible),scope=dialog||document.body;
  const overlays=[...document.querySelectorAll('.toast,.presentation')].filter(el=>visible(el)&&['fixed','absolute','sticky'].includes(getComputedStyle(el).position));
  const rows=[],overlaps=[],clipping=[],intentionalScrollable=[],unsupported=[];
  function add(el,text,rects,pseudo){
    if(!visible(el)||!rects.length||!text.trim())return;
    const style=getComputedStyle(el,pseudo),disabled=Boolean(el.closest(':disabled'));
    const size=parseFloat(style.fontSize),weight=Number(style.fontWeight)||400,large=size>=24||size>=18.66&&weight>=700;
    let foreground=rgba(el instanceof SVGElement?style.fill:style.webkitTextFillColor||style.color),background=[0,0,0,0];
    if(pseudo)foreground[3]*=Number(style.opacity);
    for(let parent=el;parent;parent=parent.parentElement){
      const s=getComputedStyle(parent),layer=rgba(s.backgroundColor);
      foreground=over(foreground,layer);background=over(background,layer);
      const opacity=Number(s.opacity);foreground[3]*=opacity;background[3]*=opacity;
      if(s.backgroundImage!=='none')unsupported.push({selector:id(el),text:text.slice(0,100),backgroundImage:s.backgroundImage});
    }
    foreground=over(foreground,[255,255,255,1]);background=over(background,[255,255,255,1]);
    const contrast=ratio(foreground,background),target=disabled?4.5:large?3:4.5;
    const row={selector:id(el),text:text.trim().replace(/\s+/g,' ').slice(0,180),contrast:Number(contrast.toFixed(3)),target,fontSize:size,fontWeight:weight,disabled,foreground:foreground.slice(0,3).map(Math.round),background:background.slice(0,3).map(Math.round),pass:contrast+.005>=target};
    rows.push(row);
    for(const box of rects){
      if(box.width<=0||box.height<=0)continue;
      for(const overlay of overlays){
        if(overlay.contains(el))continue;
        const b=overlay.getBoundingClientRect(),width=Math.min(box.right,b.right)-Math.max(box.left,b.left),height=Math.min(box.bottom,b.bottom)-Math.max(box.top,b.top);
        if(width>2&&height>2&&box.bottom>0&&box.top<innerHeight)overlaps.push({...row,overlay:id(overlay),overlapWidth:width,overlapHeight:height});
      }
      let scrollX=false,scrollY=false;
      for(let parent=el.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
        const s=getComputedStyle(parent),b=parent.getBoundingClientRect();
        scrollX||=['auto','scroll'].includes(s.overflowX)&&parent.scrollWidth>parent.clientWidth+1;
        scrollY||=['auto','scroll'].includes(s.overflowY)&&parent.scrollHeight>parent.clientHeight+1;
        if(['hidden','clip'].includes(s.overflowX)&&(box.left<b.left-1||box.right>b.right+1))(scrollX?intentionalScrollable:clipping).push({...row,axis:'x',clippedBy:id(parent)});
        if(['hidden','clip'].includes(s.overflowY)&&(box.top<b.top-1||box.bottom>b.bottom+1))(scrollY?intentionalScrollable:clipping).push({...row,axis:'y',clippedBy:id(parent)});
      }
    }
  }
  const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const node=walker.currentNode,el=node.parentElement;
    if(!el||el.closest('script,style,noscript,option,title')||!node.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(node);add(el,node.textContent,[...range.getClientRects()]);
  }
  for(const el of scope.querySelectorAll('input,textarea,select')){
    if(!visible(el)||el instanceof HTMLInputElement&&['hidden','checkbox','radio','file'].includes(el.type))continue;
    const text=el instanceof HTMLSelectElement?el.selectedOptions[0]?.textContent||'':el.value;
    add(el,text||el.getAttribute('placeholder')||'',[el.getBoundingClientRect()],!text&&el.hasAttribute('placeholder')?'::placeholder':undefined);
  }
  const unique=values=>[...new Map(values.map(row=>[JSON.stringify(row),row])).values()];
  return {scope:dialog?'dialog':'page',viewport:{width:innerWidth,height:innerHeight},prefersDark:matchMedia('(prefers-color-scheme: dark)').matches,colorScheme:getComputedStyle(document.documentElement).colorScheme,documentWidth:document.documentElement.scrollWidth,rows:unique(rows),failures:unique(rows.filter(row=>!row.pass)),overlaps:unique(overlaps),clipping:unique(clipping),intentionalScrollable:unique(intentionalScrollable),unsupported:unique(unsupported)};
}

async function sample(page,label,{hover}={}){
  await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(hover&&await hover.isVisible())await hover.hover();
  const result=await page.evaluate(measureText),filename=`${String(report.screens.length+1).padStart(3,'0')}-${label.replace(/[^a-zA-Z0-9-]/g,'-')}.png`;
  await page.screenshot({path:path.join(output,filename),fullPage:false});
  const screen={label,screenshot:filename,...result};report.screens.push(screen);
  await writeFile(path.join(output,'contrast-progress.json'),JSON.stringify({lastScreen:label,screens:report.screens.length,failures:report.screens.flatMap(screen=>screen.failures.map(row=>({screen:screen.label,...row})))},null,2));
  console.log(`${label}: ${result.rows.length} text samples, ${result.failures.length} contrast failures, ${result.overlaps.length} fixed overlaps`);
  if(hover)await page.mouse.move(0,0);
}
async function closeDialog(page){const dialog=page.getByRole('dialog');if(await dialog.isVisible())await dialog.getByRole('button',{name:'닫기',exact:true}).first().click();}
async function imported(page,file){
  await page.getByLabel('K볼 저장 파일 가져오기').setInputFiles(file);
  await page.getByRole('heading',{name:'라커룸',exact:true,level:1}).waitFor({timeout:180_000}).catch(async error=>{throw new Error(`저장 가져오기: ${await page.getByRole('alert').allTextContents()} / ${error}`);});
  await page.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});
  await page.locator('.processing').waitFor({state:'hidden'});
}
async function nav(page,id){await page.getByTestId(`${id}-tab`).click();await page.evaluate(()=>scrollTo(0,0));}
async function mobileGrowthScroll(page,label){
  const scroller=page.locator('.growth-table-wrap');
  await scroller.scrollIntoViewIfNeeded();
  const dimensions=await scroller.evaluate(el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
  assert.ok(dimensions.scrollWidth>dimensions.clientWidth,'a narrow growth table must expose horizontal scrolling');
  await scroller.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  const right=await scroller.evaluate(el=>{const cell=el.querySelector('thead th:last-child').getBoundingClientRect(),box=el.getBoundingClientRect();return {scrollLeft:el.scrollLeft,lastColumn:cell.toJSON(),viewport:box.toJSON(),windowWidth:innerWidth,windowHeight:innerHeight};});
  assert.ok(right.scrollLeft>0&&right.lastColumn.left>=right.viewport.left-1&&right.lastColumn.right<=right.viewport.right+1,'the final growth column must be reachable inside the visible scroll area');
  assert.ok(right.lastColumn.left>=0&&right.lastColumn.right<=right.windowWidth&&right.lastColumn.top>=0&&right.lastColumn.bottom<=right.windowHeight,'the final growth column must be reachable inside the actual screen viewport');
  await sample(page,label);report.screens.at(-1).horizontalScrollVerification={...dimensions,...right};
  await scroller.evaluate(el=>{el.scrollLeft=0;});
}

try{
  const selectedWidths=process.env.KBALL_COLOR_WIDTHS?.split(',').map(Number);
  for(const viewport of[{width:1366,height:768},{width:1920,height:1080},{width:390,height:844}].filter(v=>!selectedWidths||selectedWidths.includes(v.width))){
    const prefix=String(viewport.width),context=await browser.newContext({viewport,reducedMotion:'reduce',colorScheme:'light'}),page=await context.newPage();
    page.setDefaultTimeout(45_000);page.on('pageerror',error=>report.pageErrors.push({viewport:prefix,error:String(error)}));
    await page.goto(baseURL,{waitUntil:'networkidle'});await page.getByTestId('new-career').waitFor();
    await sample(page,`${prefix}-landing`);await sample(page,`${prefix}-landing-hover`,{hover:page.getByTestId('new-career')});
    await page.getByTestId('new-career').click();await sample(page,`${prefix}-creation-player`);
    await page.getByTestId('next-creation-step').click();await sample(page,`${prefix}-creation-club`);
    await page.getByLabel('국가',{exact:true}).selectOption('대한민국');await page.getByLabel('리그',{exact:true}).selectOption(fallbackClub[4]);await page.getByLabel('시작 구단',{exact:true}).selectOption(fallbackClub[0]);
    assert.equal(await page.locator('.creation-intro .team-badge svg').count(),1,'unavailable official crests use a neutral icon');
    await sample(page,`${prefix}-fallback-club-badge`);
    await page.getByTestId('next-creation-step').click();await sample(page,`${prefix}-creation-training-selected-disabled`);
    for(;;){const selected=page.locator('.training-row[aria-pressed="true"]');if(!await selected.count())break;await selected.first().click();}
    assert.equal(await page.locator('.training-row').count(),20,'clearing a plan must keep all actual ability values visible');
    assert.equal(await page.getByTestId('create-career').isDisabled(),false,'an empty plan can be submitted without automatic growth');
    await sample(page,`${prefix}-creation-empty-plan-enabled`);
    await page.locator('.training-row').first().click();
    assert.equal(await page.locator('.training-row[aria-pressed="true"]').count(),1,'an empty plan can be selected again');
    assert.equal(await page.getByTestId('create-career').isEnabled(),true);
    await sample(page,`${prefix}-creation-plan-reselected`);await closeDialog(page);
    await imported(page,baseline);await sample(page,`${prefix}-baseline-locker-toast`);
    await nav(page,'player');await sample(page,`${prefix}-baseline-attributes`);
    await page.getByTestId('player-view-training').click();await sample(page,`${prefix}-baseline-locked-training`);
    await page.getByTestId('manual-aging').getByRole('button',{name:'노화',exact:true}).click();await sample(page,`${prefix}-manual-aging-options`);await page.getByRole('button',{name:'−5',exact:true}).click();await sample(page,`${prefix}-manual-aging-selected`);await page.getByTestId('manual-aging').getByRole('button',{name:'노화',exact:true}).click();await page.getByRole('button',{name:'부상',exact:true}).click();await sample(page,`${prefix}-manual-injury-options`);await page.getByRole('button',{name:'부상',exact:true}).click();
    await page.getByTestId('competition-details-club').click();await sample(page,`${prefix}-club-competition-details`);await closeDialog(page);
    await page.getByTestId('competition-details-national').click();await page.getByRole('dialog').getByTestId('national-audit').locator('summary').first().click();await sample(page,`${prefix}-national-audit`);await closeDialog(page);

    await imported(page,completed);await sample(page,`${prefix}-offseason-locker-disabled`);
    if(await page.locator('.match-row').count()){
      await sample(page,`${prefix}-match-row-hover`,{hover:page.locator('.match-row').first()});
      await page.locator('.match-row').first().click();await sample(page,`${prefix}-match-detail`);await closeDialog(page);
    }
    await page.getByTestId('standings-more').click();await sample(page,`${prefix}-full-standings-modal`);
    if(viewport.width<900){await page.getByTestId('full-standings-scroll').evaluate(el=>el.scrollLeft=el.scrollWidth);await sample(page,`${prefix}-full-standings-right`);}
    await closeDialog(page);
    await page.getByTestId('league-leaders-more').click();await sample(page,`${prefix}-league-leaders`);await closeDialog(page);
    await page.getByTestId('club-development').locator('summary').click();await page.getByTestId('club-development').scrollIntoViewIfNeeded();await sample(page,`${prefix}-club-growth`);
    assert.equal(await page.getByText('팀 현황',{exact:true}).count(),0);
    await page.getByTestId('season-details-disclosure').locator('summary').click();await page.getByTestId('locker-season-details').scrollIntoViewIfNeeded();await sample(page,`${prefix}-locker-combined-details`);await page.evaluate(()=>scrollTo(0,0));
    await page.getByTestId('transfer-window').click();await sample(page,`${prefix}-contract-modal`);
    const accept=page.getByRole('button',{name:'제안 수락',exact:true}).first();if(await accept.count())await sample(page,`${prefix}-contract-hover`,{hover:accept});await closeDialog(page);
    await nav(page,'player');
    for(const view of['attributes','training','growth','contract','leadership']){await page.getByTestId(`player-view-${view}`).click();await sample(page,`${prefix}-player-${view}`);if(view==='growth'&&viewport.width<900)await mobileGrowthScroll(page,`${prefix}-player-growth-scrolled-right`);}
    await nav(page,'career');
    for(const view of['records','seasons','national','awards','ledger','retirement']){await page.getByTestId(`career-view-${view}`).click();await sample(page,`${prefix}-career-${view}`);}
    await page.getByTestId('career-view-records').click();
    for(const scope of['all','club','national']){await page.getByTestId(`records-scope-${scope}`).click();await sample(page,`${prefix}-record-${scope}`);}
    await page.getByTestId('career-view-awards').click();
    for(const name of['발롱도르 순위','FIFPRO 월드 11']){await page.getByRole('button',{name,exact:true}).click();await sample(page,`${prefix}-awards-${name.startsWith('FIFPRO')?'eleven':'ballon'}`);if(name==='발롱도르 순위'&&await page.locator('.award-diagnostics').count()){await page.locator('.award-diagnostics summary').click();await sample(page,`${prefix}-award-diagnostics`);}}
    await page.getByTestId('career-view-ledger').click();
    for(const name of['주장 이력','선수 수입']){await page.getByRole('button',{name,exact:true}).click();await sample(page,`${prefix}-ledger-${name==='선수 수입'?'income':'captain'}`);}
    await page.getByTestId('common-menu').click();await sample(page,`${prefix}-settings`);
    await page.getByRole('dialog').getByRole('button',{name:'JSON 내보내기',exact:true}).hover();await sample(page,`${prefix}-settings-hover`);await closeDialog(page);
    await context.close();
  }
  const darkContext=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce',colorScheme:'dark'}),dark=await darkContext.newPage();
  await dark.goto(baseURL,{waitUntil:'networkidle'});await sample(dark,'dark-preference-light-theme-landing');
  await dark.getByTestId('new-career').click();await sample(dark,'dark-preference-native-controls');
  assert.equal(await dark.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light','native controls must retain the explicit light palette under a dark browser preference');
  await darkContext.close();
}catch(error){report.failure=String(error);console.error(error);process.exitCode=1;}
finally{
  const all=report.screens.flatMap(screen=>screen.rows),failures=report.screens.flatMap(screen=>screen.failures.map(row=>({screen:screen.label,...row}))),overlaps=report.screens.flatMap(screen=>screen.overlaps.map(row=>({screen:screen.label,...row}))),clipping=report.screens.flatMap(screen=>screen.clipping.map(row=>({screen:screen.label,...row})));
  report.summary={screens:report.screens.length,textSamples:all.length,contrastFailures:failures.length,minimumRatio:all.length?Math.min(...all.map(row=>row.contrast)):null,disabledSamples:all.filter(row=>row.disabled).length,fixedOverlaps:overlaps.length,clippedText:clipping.length,intentionalScrollable:report.screens.reduce((sum,screen)=>sum+screen.intentionalScrollable.length,0),verifiedHorizontalScrolls:report.screens.filter(screen=>screen.horizontalScrollVerification).length,pageErrors:report.pageErrors.length};
  await writeFile(path.join(output,'contrast-report.json'),JSON.stringify(report,null,2));
  await writeFile(path.join(output,'contrast-failures.json'),JSON.stringify({summary:report.summary,failures,overlaps,clipping},null,2));
  console.log(JSON.stringify(report.summary));if(failures.length||overlaps.length||clipping.length||report.pageErrors.length)process.exitCode=1;
  await browser.close();
}
