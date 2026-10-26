import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';

const url = process.env.KBALL_TEST_URL || 'http://127.0.0.1:4173/';
const portable = /\.html(?:[?#]|$)/.test(url);
const out = process.env.KBALL_TEST_RESULTS_DIR || 'test-results/release-2.9.1/new-crests';
const clubs = JSON.parse(await readFile('src/game/catalog.json', 'utf8')).clubs;
const manifest = JSON.parse(await readFile('data/crest-additions-2.9.1.json', 'utf8'));
const added = await Promise.all(manifest.clubs.map(async source => {
  const club = clubs.find(club => club[0] === source.id);
  assert.ok(club?.[7], source.id);
  return {id: club[0], name: club[1], country: club[3], league: club[4], src: club[7],
    data: `data:image/svg+xml;base64,${(await readFile(club[7])).toString('base64')}`};
}));
await mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: '/usr/bin/chromium'});
const errors = [], external = [], selectionChecks = [], standingsChecks = [];
async function open() {
  const context = await browser.newContext({viewport: {width: 1366, height: 768}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', request => {
    if (portable && /^https?:/.test(request.url()) && request.url() !== url) external.push(request.url());
  });
  await page.goto(url, {waitUntil: 'networkidle'});
  if (portable) await context.setOffline(true);
  await page.getByTestId('new-career').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('next-creation-step').click();
  await dialog.getByLabel('시작 소속', {exact: true}).selectOption('senior');
  return {context, page, dialog};
}
async function select(dialog, asset) {
  await dialog.getByLabel('국가', {exact: true}).selectOption(asset.country);
  await dialog.getByLabel('리그', {exact: true}).selectOption(asset.league);
  await dialog.getByLabel('시작 구단', {exact: true}).selectOption(asset.id);
}
async function visibleImage(locator, expected) {
  await locator.waitFor();
  assert.equal(await locator.getAttribute('src'), expected);
  assert.ok(await locator.evaluate(async image => {
    await image.decode(); const rect = image.getBoundingClientRect();
    return image.naturalWidth > 0 && image.naturalHeight > 0 && rect.width > 0 && rect.height > 0;
  }));
}
try {
  const {context, page, dialog} = await open();
  for (const asset of added) {
    await select(dialog, asset);
    for (const width of [1366, 390]) {
      await page.setViewportSize({width, height: width === 390 ? 844 : 768});
      await visibleImage(dialog.locator('.creation-intro .team-badge img'), portable ? asset.data : asset.src);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    selectionChecks.push(asset.id);
  }
  await context.close();
  // Every affected league/group renders its new club badges in the real full standings.
  for (const league of [...new Set(added.map(asset => asset.league))]) {
    const assets = added.filter(asset => asset.league === league);
    const {context, page, dialog} = await open();
    try {
      await select(dialog, assets[0]);
      await dialog.getByTestId('next-creation-step').click();
      await dialog.getByTestId('create-career').click();
      await page.getByTestId('save-status').filter({hasText: '자동 저장됨'}).waitFor({state: 'attached'});
      await page.locator('.processing').waitFor({state: 'hidden'});
      await page.getByTestId('standings-more').click();
      const table = page.getByTestId('full-standings');
      assert.equal(await table.locator('tbody tr').count(), clubs.filter(club => club[4] === league).length);
      for (const width of [1366, 390]) {
        await page.setViewportSize({width, height: width === 390 ? 844 : 768});
        for (const asset of assets) {
          const badge = table.locator(`tr[data-club-id="${asset.id}"] .team-badge img`);
          await visibleImage(badge, portable ? asset.data : asset.src);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({path: `${out}/${league}-${width}.png`});
      }
      standingsChecks.push({league, ids: assets.map(asset => asset.id)});
    } finally {await context.close();}
  }
  const gallery = await browser.newPage({viewport: {width: 1260, height: 900}});
  await gallery.setContent('<style>body{margin:12px;background:white;color:#202124;font:13px sans-serif}main{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}section{height:120px;border:1px solid #ddd;text-align:center;padding:6px;overflow:hidden}img{width:76px;height:76px;object-fit:contain}p{margin:4px}</style><main></main>');
  await gallery.evaluate(added => {
    for (const asset of added) {
      const section = document.createElement('section'), img = document.createElement('img'), label = document.createElement('p');
      img.src = asset.data; label.textContent = `${asset.id} ${asset.name}`;
      section.append(img, label); document.querySelector('main').append(section);
    }
  }, added);
  await gallery.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await gallery.screenshot({path: `${out}/added-crests.png`, fullPage: true});
  await gallery.close();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const missing = clubs.filter(club => !club[7]).map(club => ({id: club[0], name: club[1]}));
  const result = {url, portable, added: added.length, selectionChecks, standingsChecks, missing, errors, external};
  await writeFile(`${out}/results.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({added: added.length, selectionChecks: selectionChecks.length, leagueGroups: standingsChecks.length, missing: missing.length, errors, external}));
} finally {await browser.close();}
