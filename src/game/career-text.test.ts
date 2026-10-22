import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer,retireCareer } from './engine';
import { PLAY_STYLES } from './attributes';
import { buildCareerText,careerTextFilename,careerTextChunks } from './career-text';
import { validateCareer,exportCareer,importCareer } from './storage';
const options={name:'한글 선수',nationality:'대한민국',age:20,height:180,weight:75,foot:'right' as const,position:'ST' as const,talent:'S' as const,style:PLAY_STYLES.ST[0],clubId:'KR2_01',squad:'senior' as const,difficulty:'realistic' as const,seed:'career-text-complete'};
test('one UTF-8 TXT includes every section, every numeric metric and complete original own data',()=>{
 const c=retireCareer(createCareer(options)),before=JSON.stringify(c),text=buildCareerText(c);
 assert.equal(text.charCodeAt(0),0xfeff);assert.match(careerTextFilename(c),/^K볼_한글 선수_은퇴커리어\.txt$/);
 for(const section of ['A. 선수 기본','B. 통산','C. 연도별','D. 클럽','E. 국가대표','F. 개인 수상','G. 팀 수상','H. 주장','I. 몸값','J. 능력치','K. 전체 순위','L. 원본 보존'])assert.ok(text.includes(section),section);
 for(const key of Object.keys(c.season.playerStats))assert.ok(text.includes(`"${key}"`),key);
 assert.match(text,/과거 기록 미보존/);assert.match(text,/미구현/);assert.match(text,/선방률/);assert.match(text,/90분/);
 assert.equal([...careerTextChunks(c)].join(''),text);assert.equal(JSON.stringify(c),before,'export is read-only');
 assert.ok(!/(?<!\r)\n/.test(text),'Windows-compatible line endings');
});
test('new season snapshots validate and unknown old snapshots stay absent on hash-preserving import',async()=>{
 const c=createCareer(options),text=await exportCareer(c),loaded=await importCareer(text);
 assert.equal(loaded.history.length,0);assert.equal(loaded.season.playerStats.goals,0);validateCareer(loaded);
 const malicious=structuredClone(c);malicious.systems!.world.clubs[c.player.clubId].development!.history=[{year:2026,leagueId:'KR2',rank:1,expectedRank:2,points:10,teams:13,bonus:100,reinvestment:101,beforePower:50,afterPower:51,prestigeBefore:50,prestigeAfter:51,improvedPlayers:1,recruits:1}];
 assert.throws(()=>validateCareer(malicious),/재투자/);
});

test('known nonzero legacy metrics stay readable even when detailed coverage was not tracked',()=>{
 const c=createCareer(options);c.season.playerStats.apps=1;c.season.playerStats.minutes=90;c.season.playerStats.mom=1;c.season.playerStats.keyPasses=3;
 const text=buildCareerText(c);assert.match(text,/MOM\(회\): 1/);assert.match(text,/키패스\(회\): 3/);assert.match(text,/태클 시도\(회\): 과거 기록 미보존/);
});
