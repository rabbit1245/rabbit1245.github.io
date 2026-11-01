import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createCareer} from '../src/game/engine';
import {exportCareer,verifySaveText} from '../src/game/storage';
import {getClub} from '../src/game/data';
const directory='test-results/position-2117/fixtures';await mkdir(directory,{recursive:true});
const c=process.env.KBALL_POSITION_SAVE?await verifySaveText(await readFile(process.env.KBALL_POSITION_SAVE,'utf8')):createCareer({name:'포지션 변경 검수',nationality:'대한민국',age:24,height:180,weight:76,foot:'right',position:'CAM',talent:'SSS',style:'엔간체',clubId:'ES1_01',squad:'senior',difficulty:'realistic',seed:'position-browser-2117',training:[]});
await writeFile(`${directory}/source.json`,await exportCareer(c));
// Rendering fixtures only. Eligibility and adjudication are independently
// tested against five real-shaped annual ledgers and club career evidence.
const common={year:c.season.year,clubId:c.player.clubId,official:false,verification:'game-model' as const,ruleVersion:'display-fixture',description:'UI 표시 전용 수상 fixture. 수상 자격은 별도 엔진 테스트에서 검증합니다.'};
c.awards=[...c.awards,{...common,id:'display-fixture:legacy',name:`${getClub(c.player.clubId).name} 영구결번`,category:'club-legacy',criterion:'구단 위상·장기 기여·우승·주장 경력·구단당 1회'},{...common,id:'display-fixture:super-ballon',name:'슈퍼 발롱도르',category:'world',criterion:'최근 5년 내 성적으로 집계 수상'}];
await writeFile(`${directory}/award-display.json`,await exportCareer(c));
console.log(`Position controls and presentation-only award fixtures: ${directory}`);
