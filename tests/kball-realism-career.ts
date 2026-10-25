import {writeFileSync,mkdirSync} from 'node:fs';
const output=process.env.KBALL_REALISM_RESULTS_DIR||'test-results/pending-274';mkdirSync(output,{recursive:true});
import {createHash} from 'node:crypto';
import {createCareer,advanceCareer,dismissChoice,stayAtClub,setTraining,startNextSeason,setAllAttributeLocks,configureCheats,cheatIncreaseAttribute} from '../src/game/engine.ts';
import {FIELD_ATTRIBUTES,PLAY_STYLES} from '../src/game/attributes.ts';
import {validateCareer,exportCareer} from '../src/game/storage.ts';
import {getNationalTotals,nationalSquadPlayers} from '../src/game/national.ts';
import {buildCareerText} from '../src/game/career-text.ts';
let c=createCareer({name:'쵸비 조건 검증',nationality:'포르투갈',age:25,height:180,weight:75,foot:'right',position:'RW',talent:'S',style:PLAY_STYLES.RW[0],clubId:'IT1_01',squad:'senior',difficulty:'realistic',seed:'native-realism-274'});
c=configureCheats(c,true,false);for(const key of FIELD_ATTRIBUTES)while((c.player.attributes[key]??0)<90){const left=90-(c.player.attributes[key]??0);c=cheatIncreaseAttribute(c,key,left>=10?10:left>=5?5:1);}c.player.form=80;c.managerTrust=90;c=setAllAttributeLocks(c,true);const attrs=JSON.stringify(c.player.attributes),results=[];let firstHash='';
(async()=>{
for(let y=1;y<=3;y++){
 while(c.stage==='season'){if(c.systems!.pendingChoice)c=dismissChoice(c);const before=c.season.week;c=advanceCareer(c,120);if(c.stage==='season'&&c.season.week===before&&!c.systems!.pendingChoice)throw Error('stalled');}
 validateCareer(c);if(JSON.stringify(c.player.attributes)!==attrs)throw Error('locked abilities changed');
 const hash=createHash('sha256').update(JSON.stringify({...c.history[0],details:{...c.history[0].details,clubDevelopment:undefined}})).digest('hex');if(y===1)firstHash=hash;else if(firstHash!==hash)throw Error('old season changed');
 const h=c.history.at(-1)!,national=getNationalTotals(c),ranking=c.systems!.rankings.at(-1)!;
 const row={year:y,age:c.player.age,ovr:c.player.ovr,rank:h.rank,leagueGoals:h.stats.goals,leagueAssists:h.stats.assists,nationalApps:national.apps,eligibleNow:nationalSquadPlayers(c,'포르투갈','senior').some(p=>p.id===c.player.id),ballonRank:ranking.playerRank,awards:h.awards.map(a=>a.name),recordHash:firstHash};results.push(row);console.log(JSON.stringify(row));
 writeFileSync(`${output}/native-year-${y}.json`,await exportCareer(c));
 writeFileSync(`${output}/native-career.json`,JSON.stringify({method:'Actual complete world, club cups and national windows, no forced results or selections. A fixed 90 player is locked; historical matches, stats, awards, attributes and finances must remain identical; earned club-development metadata added at year transition is excluded from the hash.',results},null,2));
 if(y<3){c=stayAtClub(c);c=setTraining(c,[],'balanced');c=startNextSeason(c);}
}
writeFileSync(`${output}/native-career.txt`,buildCareerText(c));
})().catch(e=>{console.error(e);process.exitCode=1;});
