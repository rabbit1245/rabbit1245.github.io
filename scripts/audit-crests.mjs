import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
const catalogue = await readJSON('src/game/catalog.json');
const mapping = await readJSON('data/canonical-logos.json');
const diagnostics = await readJSON('data/crest-diagnostics.json');
const manifest = await readJSON('data/crest-sources.json');
const additions = new Map([...manifest.clubs,...(await readJSON('data/crest-additions-2.9.0.json')).clubs].map(row => [row.id, row]));
assert.equal(additions.size, manifest.clubs.length+(await readJSON('data/crest-additions-2.9.0.json')).clubs.length, 'source IDs must be unique');
const rows = [];
for (const [id, name, nativeName, , , , , crest] of catalogue.clubs) {
  const diagnostic = diagnostics.find(row => row.id === id);
  const row = {id, name, nativeName, status: crest ? 'embedded-svg' : 'neutral-icon',
    ...(diagnostic?.source ? {source: diagnostic.source} : {})};
  if (crest) {
    assert.equal(mapping[id], crest, `ID mapping differs: ${id}`);
    const svg = await readFile(crest, 'utf8');
    assert.match(svg, /<svg\b/, id);
    assert.doesNotMatch(svg, /<\s*(?:script|foreignObject|!DOCTYPE|!ENTITY)\b|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)|@import|url\(\s*["']?\s*(?:https?:|\/\/)/i, `Unsafe/external crest: ${id}`);
    row.bytes = Buffer.byteLength(svg);
    row.sha256 = createHash('sha256').update(svg).digest('hex');
  } else assert.ok(!mapping[id], `Unlinked catalogue crest: ${id}`);
  const source = additions.get(id);
  if (source) {
    assert.equal(nativeName, source.native, `Club identity changed: ${id}`);
    assert.equal(crest, `assets/crests/${id}.svg`, `Missing imported crest: ${id}`);
    assert.equal(row.sha256, source.sha256, `Wrong club asset: ${id}`);
    assert.equal(row.source, source.sourcePath.split('/').at(-1), `Source identity differs: ${id}`);
  }
  rows.push(row);
}
assert.equal(rows.length, 913);
assert.equal(rows.filter(row => additions.has(row.id)).length, additions.size);
for (const id of ['NL1_04', 'NL1_07', 'FR1_01', 'IT1_01', 'KR2_03', 'KR2_06'])
  assert.equal(rows.find(row => row.id === id)?.status, 'embedded-svg', id);
for (const league of ['NL1', 'US1', 'KR2', 'JP1', 'BE1', 'FR1', 'IT1', 'BR1'])
  assert.ok(catalogue.clubs.filter(club => club[4] === league).every(club => club[7]), `Missing verified league crest: ${league}`);
// Similar names must never reintroduce these known different-club matches.
for (const [id, wrongSource] of [['KR2_03', 'FC_Seoul.svg'], ['KR2_06', 'Suwon_FC.svg'],
  ['JP3_19', 'Yokohama_FC.svg'], ['BE3_09', 'Club_Brugge.svg'], ['TR3_25', 'Diyarbakırspor.svg']])
  assert.notEqual(rows.find(row => row.id === id)?.source, wrongSource, `Wrong club logo: ${id}`);
await mkdir('docs/validation', {recursive: true});
const report = {clubs: rows.length, embedded: rows.filter(row => row.status === 'embedded-svg').length,
  neutral: rows.filter(row => row.status === 'neutral-icon').length, added: additions.size,
  sourceRevision: manifest.revision,
  note: 'Canonical IDs and pinned source SVG hashes are checked, including AZ/NEC abbreviations and all MLS/Eredivisie clubs. Unknown logos retain neutral icons; different clubs are never matched by similar spelling; verified reserve teams may share their own parent badge. Browser decoding and rendered standings are checked separately.', rows};
await writeFile('docs/validation/kball-2.9-crests.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({clubs: report.clubs, embedded: report.embedded, neutral: report.neutral, added: report.added}));
