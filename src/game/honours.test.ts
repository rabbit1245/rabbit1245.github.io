import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareer} from './engine';
import {seasonHonours,competitionLabel} from './honours';
const fresh=()=>createCareer({name:'시즌 수상',nationality:'대한민국',age:24,height:180,weight:75,foot:'right',position:'ST',talent:'S',style:'포처',clubId:'KR1_01',squad:'senior',difficulty:'realistic',seed:'honours-v24'});
test('a first-place midseason is not a title and season/individual honours remain distinct',()=>{
 const c=fresh();assert.equal(seasonHonours(c,2026).titles.length,0);assert.equal(seasonHonours(c,2026).pending,true);
 c.season.completed=true;c.stage='offseason';c.awards=[{id:'title',year:2026,clubId:c.player.clubId,name:'K리그1 우승 메달',description:'실제 우승 메달',category:'team'},{id:'boot',year:2026,clubId:c.player.clubId,name:'K리그1 득점왕',description:'리그 득점 1위',category:'individual'}];
 const h=seasonHonours(c,2026);assert.equal(h.titles[0].name,'K리그1');assert.equal(h.titles[0].medal,true);assert.deepEqual(h.personal.map(a=>a.id),['boot']);assert.equal(h.pending,false);
 c.player.clubId='EN1_01';assert.equal(seasonHonours(c,2026).titles[0].team,'울산 HD','a recorded old-club medal remains visible after offseason signing');
 assert.equal(competitionLabel(c,'WC:2030'),'2030년 월드컵');assert.equal(competitionLabel(c,'KR1'),'K리그1');
});
