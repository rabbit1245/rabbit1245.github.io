import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createCareer,overall} from '../src/game/engine';
import {FIELD_ATTRIBUTES,POSITION_ATTRIBUTES} from '../src/game/attributes';
import {beginGrowthSeason} from '../src/game/growth';
import {validateCareer,exportCareer} from '../src/game/storage';
const out='test-results/expanded-2120/fixtures';await mkdir(out,{recursive:true});
await writeFile(`${out}/legacy.json`,gunzipSync(await readFile('tests/fixtures/kball-2117-midseason.json.gz')));
const c=createCareer({name:'확장 화면 검수',nationality:'대한민국',age:25,height:180,weight:78,foot:'right',position:'ST',talent:'SSS',style:'포처',clubId:'KR2_03',squad:'senior',difficulty:'free',seed:'expanded-ui-2120',training:[]});
c.player.attributes=Object.fromEntries(FIELD_ATTRIBUTES.map(k=>[k,120]));c.player.potential=120;c.player.ovr=overall(c.player);c.season.attributeStart={...c.player.attributes};c.season.ovrStart=c.player.ovr;beginGrowthSeason(c);validateCareer(c);await writeFile(`${out}/raw120.json`,await exportCareer(c));
// Controlled, already-earned mastery for display validation; real training is
// independently exercised by play-skills.test.ts, never faked as played seasons.
c.player.playSkills=POSITION_ATTRIBUTES.ST.slice(0,5);c.player.skillMastery=Object.fromEntries(c.player.playSkills.map(k=>[k,20]));c.player.ovr=overall(c.player);validateCareer(c);await writeFile(`${out}/earned130.json`,await exportCareer(c));
