import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';

const url = process.env.KBALL_TEST_URL || 'http://127.0.0.1:4173/';
const portable = /\.html(?:[?#]|$)/.test(url);
const out = process.env.KBALL_TEST_RESULTS_DIR || 'test-results/p271/crests';
await mkdir(out, {recursive: true});
const clubs = JSON.parse(await readFile('src/game/catalog.json', 'utf8')).clubs;
const manifest = JSON.parse(await readFile('data/crest-sources.json', 'utf8'));
const assets = await Promise.all(clubs.map(async club => ({id: club[0], name: club[1],
  source: club[7], data: club[7] ? `data:image/svg+xml;base64,${(await readFile(club[7])).toString('base64')}` : null})));
if (portable) {
  const html = await readFile('play/Kball.html', 'utf8');
  const packed = html.match(/const binary = atob\('([^']+)'\)/)?.[1];
  assert.ok(packed, 'portable application is embedded');
  const bundle = gunzipSync(Buffer.from(packed, 'base64')).toString('utf8');
  for (const asset of assets.filter(asset => asset.data)) assert.ok(bundle.includes(asset.data), `Not embedded: ${asset.id}`);
}
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium'});
const context = await browser.newContext({viewport: {width: 1366, height: 768}, reducedMotion: 'reduce'});
const page = await context.newPage(), errors = [], external = [], checks = [];
page.setDefaultTimeout(45000);
page.on('pageerror', error => errors.push(String(error)));
page.on('request', request => { if (/^https?:/.test(request.url()) && request.url() !== url && portable) external.push(request.url()); });
async function ready() {
  await page.getByTestId('save-status').filter({hasText: '자동 저장됨'}).waitFor({state: 'attached'});
  await page.locator('.processing').waitFor({state: 'hidden'});
}
try {
  await page.goto(url, {waitUntil: 'networkidle'});
  if (portable) await context.setOffline(true);
  const decoded = await page.evaluate(async ({assets, portable}) => {
    const rows = [];
    for (let i = 0; i < assets.length; i += 30) rows.push(...await Promise.all(assets.slice(i, i + 30).map(async asset => {
      if (!asset.data) return {id: asset.id, neutral: true};
      try {
        const image = new Image(); image.src = portable ? asset.data : asset.source; await image.decode();
        return {id: asset.id, ok: image.naturalWidth > 0 && image.naturalHeight > 0};
      } catch (error) { return {id: asset.id, ok: false, error: String(error)}; }
    })));
    return rows;
  }, {assets, portable});
  assert.equal(decoded.length, 913);
  const expectedCrests = assets.filter(asset => asset.data).length;
  assert.equal(decoded.filter(row => row.ok).length, expectedCrests);
  assert.equal(decoded.filter(row => row.neutral).length, clubs.length - expectedCrests);
  assert.ok(decoded.every(row => row.ok || row.neutral));
  checks.push(`All ${expectedCrests} available club crests decode; ${clubs.length - expectedCrests} remain explicitly missing`);
  console.log(`Verified: ${expectedCrests} SVGs decode`);

  await page.getByTestId('new-career').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('선수 이름', {exact: true}).fill('로고검수');
  await dialog.getByTestId('next-creation-step').click();
  await dialog.getByLabel('국가', {exact: true}).selectOption('네덜란드');
  await dialog.getByLabel('리그', {exact: true}).selectOption('NL1');
  await dialog.getByLabel('시작 소속', {exact: true}).selectOption('senior');
  for (const id of ['NL1_04', 'NL1_07']) {
    await dialog.getByLabel('시작 구단', {exact: true}).selectOption(id);
    const badge = dialog.locator('.creation-intro .team-badge img');
    await badge.waitFor();
    const asset = assets.find(asset => asset.id === id);
    assert.equal(await badge.getAttribute('src'), portable ? asset.data : asset.source);
    assert.ok(await badge.evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }));
  }
  await dialog.getByLabel('시작 구단', {exact: true}).selectOption('NL1_04');
  await dialog.getByTestId('next-creation-step').click();
  await dialog.getByTestId('create-career').click(); await ready();
  await page.getByTestId('standings-more').click();
  const table = page.getByTestId('full-standings');
  assert.equal(await table.locator('tbody tr').count(), 18);
  for (const club of clubs.filter(club => club[4] === 'NL1')) {
    const badge = table.locator(`tr[data-club-id="${club[0]}"] .team-badge img`);
    assert.equal(await badge.count(), 1, club[1]);
    const asset = assets.find(asset => asset.id === club[0]);
    assert.equal(await badge.getAttribute('src'), portable ? asset.data : asset.source, club[1]);
    assert.ok(await badge.evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }), club[1]);
  }
  await page.screenshot({path: `${out}/eredivisie-desktop.png`});
  checks.push('AZ and NEC render their exact embedded/file SVG in club selection and all 18 Eredivisie standings rows');
  console.log('Verified: AZ, NEC and all Eredivisie standings crests');
  await page.setViewportSize({width: 390, height: 844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.ok(await table.locator('.team-badge img').evaluateAll(images=>images.every(image=>image.getBoundingClientRect().width>0&&image.getBoundingClientRect().height>0)), 'Mobile CSS must not hide real club crests');
  await page.screenshot({path: `${out}/eredivisie-mobile.png`});
  await page.getByRole('dialog').getByRole('button', {name: '닫기', exact: true}).click();
  await context.setOffline(false);
  await page.reload({waitUntil: 'networkidle'});
  if (portable) await context.setOffline(true);
  await page.getByRole('button', {name: '이어서 플레이', exact: true}).click(); await ready();
  await page.getByTestId('standings-more').click();
  assert.equal(await table.locator('tr[data-club-id="NL1_04"] img').count(), 1);
  assert.equal(await table.locator('tr[data-club-id="NL1_07"] img').count(), 1);
  checks.push('Mobile standings fit, saved career reopens, and the crests persist after reload');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);

  // A contact sheet supports human review of the imported club identities.
  const gallery = await context.newPage();
  await gallery.setViewportSize({width: 1260, height: 900});
  const selected = assets.filter(asset => manifest.clubs.some(row => row.id === asset.id));
  await gallery.setContent('<style>body{margin:12px;background:white;color:#202124;font:12px Arial}main{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}section{height:88px;border:1px solid #ddd;text-align:center;padding:5px;overflow:hidden}img{width:48px;height:48px;object-fit:contain}p{margin:2px}</style><main></main>');
  await gallery.evaluate(selected => {
    for (const asset of selected) {
      const section = document.createElement('section'), img = document.createElement('img'), label = document.createElement('p');
      img.src = asset.data; label.textContent = `${asset.id} ${asset.name}`;
      section.append(img, label); document.querySelector('main').append(section);
    }
  }, selected);
  await gallery.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await gallery.screenshot({path: `${out}/added-crests.png`, fullPage: true}); await gallery.close();
  // Big clubs and smaller opponents must be visible, not merely present in the DOM.
  for(const [id,country,league] of [['FR1_01','프랑스','FR1'],['IT1_01','이탈리아','IT1']]) {
    const sideContext=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),side=await sideContext.newPage();
    side.setDefaultTimeout(45000);side.on('pageerror',error=>errors.push(String(error)));
    await side.goto(url,{waitUntil:'networkidle'});if(portable)await sideContext.setOffline(true);
    await side.getByTestId('new-career').click();const d=side.getByRole('dialog');await d.getByTestId('next-creation-step').click();
    await d.getByLabel('국가',{exact:true}).selectOption(country);await d.getByLabel('리그',{exact:true}).selectOption(league);
    await d.getByLabel('시작 구단',{exact:true}).selectOption(id);await d.getByLabel('시작 소속',{exact:true}).selectOption('senior');
    await d.getByTestId('next-creation-step').click();await d.getByTestId('create-career').click();
    await side.getByTestId('save-status').filter({hasText:'자동 저장됨'}).waitFor({state:'attached'});await side.locator('.processing').waitFor({state:'hidden'});
    await side.getByTestId('standings-more').click();const t=side.getByTestId('full-standings');
    assert.equal(await t.locator('tbody tr').count(),clubs.filter(club=>club[4]===league).length);
    const asset=assets.find(asset=>asset.id===id);assert.equal(await t.locator(`tr[data-club-id="${id}"] img`).getAttribute('src'),portable?asset.data:asset.source);
    for(const width of [1366,390]) {
      await side.setViewportSize({width,height:844});
      assert.ok(await t.locator('.team-badge img').evaluateAll(images=>Promise.all(images.map(async image=>{await image.decode();const r=image.getBoundingClientRect();return r.width>0&&r.height>0;})).then(results=>results.every(Boolean))),`${league} ${width}: all crests must be visible`);
      assert.ok(await side.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await side.screenshot({path:`${out}/${league}-${width}.png`});
    }
    checks.push(`${league}: ${id} and every smaller club have visible crests on desktop and mobile${portable?' offline':''}`);
    await sideContext.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/results.json`, JSON.stringify({url, portable, checks, errors, external,
    count: decoded.length, decoded: decoded.filter(row => row.ok).length, neutral: decoded.filter(row => row.neutral).length, results: decoded}, null, 2));
  console.log(JSON.stringify({url, checks, decoded: decoded.filter(row => row.ok).length, neutral: decoded.filter(row => row.neutral).length, errors, external}));
} catch (error) {
  await page.screenshot({path: `${out}/failure.png`, fullPage: true}).catch(() => {}); throw error;
} finally { await browser.close(); }
