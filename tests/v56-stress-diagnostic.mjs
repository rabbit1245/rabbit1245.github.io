import { chromium } from 'playwright';
import fs from 'node:fs';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForFunction(()=>window.CAREER24_V55_STABLE&&window.CAREER24_V56_QA?.version==='V5.6 CAREER BALANCE',{timeout:30000});
await page.click('#newGameBtn');
await page.waitForSelector('#createScreen.active',{timeout:10000});
await page.selectOption('#v3Talent','중');
await page.click('#careerStartBtn');
await page.waitForSelector('#gameScreen.active',{timeout:10000});

const report=await page.evaluate(()=>{
  const clone=v=>JSON.parse(JSON.stringify(v));
  const base=clone(game);
  const FIELD=['골 결정력','슈팅','드리블','볼 컨트롤','패스','크로스','스피드','피지컬','체력','헤더','태클','수비력','위치선정','판단력','시야'];
  const GK=['선방','반사신경','1대1','공중볼','위치선정','킥'];
  const POS=Object.keys(POSITIONS);
  const TALENTS=['최하','하','중','상','최상'];
  const events=['train','specialize','bigmatch','fight','ignore','prove','adapt','stick','attack','manage','allin','focus'];
  const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const pct=(a,p)=>{if(!a.length)return 0;const x=[...a].sort((m,n)=>m-n);return x[Math.min(x.length-1,Math.max(0,Math.floor((x.length-1)*p)))]};
  const power=c=>Math.round(num(window.teamPowerScore?window.teamPowerScore(c):c?.power));
  const div=c=>num(LEAGUES[c?.league]?.division,1);
  const d1=CLUBS.filter(c=>div(c)===1).sort((a,b)=>power(a)-power(b));
  const clubNear=t=>d1.reduce((best,c)=>Math.abs(power(c)-t)<Math.abs(power(best)-t)?c:best,d1[0]);
  const clubs={low:clubNear(62),mid:clubNear(76),strong:clubNear(86),elite:d1[d1.length-1]};
  function reset(){
    for(const k of Object.keys(game))delete game[k];
    Object.assign(game,clone(base));
    game.presentationSpeed='skip';
    game.agingFreeze=false;
    game.pendingTransfer=null;
    game.pendingRelease=false;
    game.pendingOffers=[];
    pendingOffers=[];
  }
  function setClub(c){
    game.club=c.name; game.clubId=c.canonicalId||c.id||null;
    game.contract={start:game.seasonYear,end:game.seasonYear+5,role:'주전',signingBonus:0,transferFee:0};
    game.wage=Math.max(1000,num(c.wage,20)*8000);
    if(!game.worldState)game.worldState={};
    game.worldState.clubContinental=game.worldState.clubContinental||{};
    game.worldState.clubHistory=game.worldState.clubHistory||{};
  }
  function setPlayer(pos,role,ovr=75){
    game.player.pos=pos;game.player.role=role;
    const keys=pos==='GK'?GK:FIELD;game.attributes={};
    keys.forEach((k,i)=>game.attributes[k]=Math.max(1,Math.min(100,Math.round(ovr+((i%3)-1)))));
    game.ovr=calcOVR(game.attributes,pos,role);game.peakOvr=game.ovr;
    game.form=55;game.fitness=100;game.injury=null;
  }
  function neutralEffects(){return{role:1,fitness:1,injury:1,minutes:1,big:1,media:0,discipline:1,attack:1}}
  function statShape(s){return{
    goals:num(s.goals),assists:num(s.assists),clean:num(s.clean),shots:num(s.shots),shotsOnTarget:num(s.shotsOnTarget),
    keyPasses:num(s.keyPasses),tackles:num(s.tackles),interceptions:num(s.interceptions),blocks:num(s.blocks),
    saves:num(s.saves),passPct:num(s.passPct),dribblePct:num(s.dribblePct),duelPct:num(s.duelPct),savePct:num(s.savePct)
  }}

  const statMatrix=[];
  for(const pos of POS){
    for(const role of POSITIONS[pos].roles){
      for(const ovr of [60,75,90,98]){
        for(const [clubBand,club] of Object.entries({low:clubs.low,mid:clubs.mid,elite:clubs.elite})){
          const rows=[];
          for(let i=0;i<4;i++){
            reset();setClub(club);setPlayer(pos,role,ovr);
            const r=mulberry32(hashString('v56-stat|'+pos+'|'+role+'|'+ovr+'|'+clubBand+'|'+i));
            rows.push(statShape(computeStats(r,40,3050,club,0,neutralEffects())));
          }
          const metric=k=>rows.map(x=>num(x[k]));
          statMatrix.push({pos,role,ovr,clubBand,club:club.name,clubPower:power(club),
            mean:{goals:+avg(metric('goals')).toFixed(2),assists:+avg(metric('assists')).toFixed(2),shots:+avg(metric('shots')).toFixed(2),
              keyPasses:+avg(metric('keyPasses')).toFixed(2),tackles:+avg(metric('tackles')).toFixed(2),interceptions:+avg(metric('interceptions')).toFixed(2),
              blocks:+avg(metric('blocks')).toFixed(2),saves:+avg(metric('saves')).toFixed(2),passPct:+avg(metric('passPct')).toFixed(2),savePct:+avg(metric('savePct')).toFixed(2)},
            max:{goals:Math.max(...metric('goals')),assists:Math.max(...metric('assists')),shots:Math.max(...metric('shots')),keyPasses:Math.max(...metric('keyPasses'))}});
        }
      }
    }
  }

  const awardMatrix=[];
  for(const pos of POS){
    reset();setClub(clubs.elite);setPlayer(pos,POSITIONS[pos].roles[0],99);
    const poor={apps:40,rating:8.1,stats:{goals:3,assists:4,tackles:8,interceptions:8,blocks:3,clean:3,keyPasses:10,savePct:62},
      competitions:{league:{rank:1},cup:{result:'우승'},continental:{name:'UEFA Champions League',result:'우승'}},
      national:{apps:8,goals:1,assists:0,tournament:'FIFA 월드컵',result:'우승'}};
    const eliteStats=pos==='GK'
      ?{goals:0,assists:0,tackles:0,interceptions:0,blocks:0,clean:22,keyPasses:0,savePct:80,saves:135}
      :['CB','LB','RB','LWB','RWB','DM'].includes(pos)
        ?{goals:5,assists:10,tackles:95,interceptions:82,blocks:35,clean:12,keyPasses:35,savePct:0}
        :['CM','LM','RM'].includes(pos)
          ?{goals:12,assists:20,tackles:40,interceptions:35,blocks:8,clean:0,keyPasses:85,savePct:0}
          :pos==='AM'
            ?{goals:20,assists:22,tackles:15,interceptions:10,blocks:2,clean:0,keyPasses:80,savePct:0}
            :{goals:35,assists:16,tackles:5,interceptions:4,blocks:1,clean:0,keyPasses:45,savePct:0};
    const elite={apps:42,rating:8.25,stats:eliteStats,
      competitions:{league:{rank:1},cup:{result:'우승'},continental:{name:'UEFA Champions League',result:'우승'}},
      national:{apps:8,goals:pos==='GK'?0:5,assists:pos==='GK'?0:3,tournament:'FIFA 월드컵',result:'우승'}};
    awardMatrix.push({pos,
      poor:calcAwards(poor,clubs.elite,()=>.1).map(x=>x.name),
      elite:calcAwards(elite,clubs.elite,()=>.1).map(x=>x.name)});
  }

  const transferMatrix=[];
  for(const pos of POS){
    for(const ovr of [55,65,75,85,92,98]){
      reset();setClub(ovr>=90?clubs.strong:clubs.mid);setPlayer(pos,POSITIONS[pos].roles[0],ovr);
      game.reputation.score=ovr>=90?85:ovr>=75?55:25;
      game.lastResult={rating:ovr>=90?7.8:ovr>=75?7.25:6.8,apps:36,stats:{goals:['ST','LW','RW','AM'].includes(pos)?Math.max(2,Math.round((ovr-50)*.45)):2,assists:['AM','CM','LM','RM','LW','RW'].includes(pos)?Math.max(2,Math.round((ovr-50)*.32)):2}};
      const offers=generateOffers();
      transferMatrix.push({pos,ovr,count:offers.length,unique:new Set(offers.map(x=>x.club)).size,
        offers:offers.map(x=>({club:x.club,power:power(clubByName(x.club)),role:x.role}))});
    }
  }

  const growthCurves=[];
  for(const pos of ['ST','AM','CM','CB','GK']){
    for(const talent of TALENTS){
      reset();setClub(clubs.mid);setPlayer(pos,POSITIONS[pos].roles[0],55);
      game.age=17;game.seasonYear=2024;game.talentRank=talent;
      const curve=[{age:17,ovr:game.ovr}];
      for(let y=0;y<11;y++){
        game.lastResult={year:game.seasonYear,apps:36,minutes:2850,injury:null,stats:{goals:pos==='ST'?16:pos==='AM'?10:2,assists:['AM','CM'].includes(pos)?12:4,shots:pos==='ST'?85:pos==='AM'?65:12,shotsOnTarget:pos==='ST'?40:pos==='AM'?28:5,keyPasses:['AM','CM'].includes(pos)?55:12,passes:1500,tackles:['CB','CM'].includes(pos)?65:10,interceptions:pos==='CB'?70:20,blocks:pos==='CB'?30:4,duels:pos==='CB'?160:80,saves:pos==='GK'?115:0}};
        game.stage='development';
        const p=window.getRoleOvrProfile(game.player.pos,game.player.role);
        const weighted=[...(p?.t1||[]).map(k=>({k,w:3})),...(p?.t2||[]).map(k=>({k,w:2})),...(p?.t3||[]).map(k=>({k,w:1}))];
        weighted.sort((a,b)=>((100-num(game.attributes[b.k]))*b.w)-((100-num(game.attributes[a.k]))*a.w));
        const sel=weighted.slice(0,3).map(x=>x.k);
        game.v3GrowthPlan={seasonYear:game.seasonYear,selected:sel,applied:false,result:null};
        startV3Growth();
        game.age++;game.seasonYear++;
        curve.push({age:game.age,ovr:game.ovr,growth:game.v3GrowthPlan?.result?.total_growth||0});
      }
      growthCurves.push({pos,talent,start:curve[0].ovr,end:curve[curve.length-1].ovr,curve});
    }
  }

  const agingCurves=[];
  for(const pos of POS){
    reset();setClub(clubs.strong);setPlayer(pos,POSITIONS[pos].roles[0],90);game.age=28;game.seasonYear=2035;
    Object.keys(game.attributes).forEach(k=>game.attributes[k]=90);game.ovr=calcOVR(game.attributes,pos,game.player.role);
    const curve=[{age:28,ovr:game.ovr}];
    for(let y=0;y<11;y++){applyAging();curve.push({age:game.age+1,ovr:calcOVR(game.attributes,pos,game.player.role),lost:game.lastAgingDecline?.total||0});game.age++;game.seasonYear++}
    agingCurves.push({pos,start:curve[0].ovr,end:curve[curve.length-1].ovr,curve});
  }

  const teamModel=[];
  for(const pos of POS){
    for(const band of ['mid','elite']){
      const ranks=[],goals=[],assists=[],ratings=[];
      for(let i=0;i<8;i++){
        reset();const club=clubs[band];setClub(club);setPlayer(pos,POSITIONS[pos].roles[0],band==='elite'?95:82);
        game.age=25;game.seasonYear=2024+i;game.seed=(12345+i*7919)>>>0;game.eventChoice=events[i%events.length];game.stage='season';
        simulateSeason();
        ranks.push(num(game.lastResult?.competitions?.league?.rank,99));goals.push(num(game.lastResult?.stats?.goals));assists.push(num(game.lastResult?.stats?.assists));ratings.push(num(game.lastResult?.rating));
      }
      teamModel.push({pos,band,club:clubs[band].name,power:power(clubs[band]),meanRank:+avg(ranks).toFixed(2),medianRank:pct(ranks,.5),p90Rank:pct(ranks,.9),
        bottomHalfRate:+(ranks.filter(x=>x>(LEAGUES[clubs[band].league]?.teams||20)/2).length/ranks.length).toFixed(3),
        meanGoals:+avg(goals).toFixed(2),meanAssists:+avg(assists).toFixed(2),meanRating:+avg(ratings).toFixed(2)});
    }
  }

  const fullCareers=[];
  const invariantErrors=[];
  for(let pi=0;pi<POS.length;pi++){
    const pos=POS[pi];reset();setClub(clubs.mid);setPlayer(pos,POSITIONS[pos].roles[Math.min(1,POSITIONS[pos].roles.length-1)],58);
    game.age=17;game.seasonYear=2024;game.seasonLabel='2024/25';game.talentRank=TALENTS[pi%TALENTS.length];game.seed=(7001+pi*991)>>>0;
    game.contract={start:2024,end:2029,role:'주전',signingBonus:0,transferFee:0};
    const seasons=[];
    try{
      for(let y=0;y<18;y++){
        game.stage='season';game.eventChoice=events[(pi+y)%events.length];game.presentationSpeed='skip';
        const yearBefore=game.seasonYear,ageBefore=game.age;
        simulateSeason();
        if(game.stage!=='result'||!game.lastResult)throw new Error('season did not reach result');
        const rr=clone(game.lastResult);
        if(!Number.isFinite(rr.rating)||rr.rating<5||rr.rating>9.5)throw new Error('invalid rating '+rr.rating);
        if(rr.apps<0||rr.apps>70)throw new Error('invalid apps '+rr.apps);
        for(const k of ['goals','assists','tackles','interceptions','saves'])if(num(rr.stats?.[k])<0)throw new Error('negative '+k);
        enterDevelopment();
        const prof=window.getRoleOvrProfile(game.player.pos,game.player.role),pool=[...(prof?.t1||[]),...(prof?.t2||[]),...(prof?.t3||[])];
        const sel=[...new Set(pool)].sort((a,b)=>num(game.attributes[a])-num(game.attributes[b])).slice(0,3);
        game.v3GrowthPlan={seasonYear:game.seasonYear,selected:sel,applied:false,result:null};startV3Growth();
        if(!game.v3GrowthPlan.applied)throw new Error('growth not applied');
        completeV3Development();
        if(game.stage!=='transfer')throw new Error('development did not reach transfer');
        if(pendingOffers.length!==3)throw new Error('offer count '+pendingOffers.length);
        if(y%3===2||num(game.contract?.end)<=game.seasonYear+1){
          let best=0;for(let i=1;i<pendingOffers.length;i++){if(power(clubByName(pendingOffers[i].club))>power(clubByName(pendingOffers[best].club)))best=i}
          acceptOffer(best);
        }else stayCurrent();
        if(game.stage!=='turnend')throw new Error('transfer did not reach turnend');
        endTurn();
        if(game.seasonYear!==yearBefore+1||game.age!==ageBefore+1||game.stage!=='season')throw new Error('turn transition invalid');
        seasons.push({age:ageBefore,club:rr.club,ovrStart:rr.ovrStart,apps:rr.apps,goals:num(rr.stats?.goals),assists:num(rr.stats?.assists),rating:rr.rating,
          rank:rr.competitions?.league?.rank??null,awards:(rr.awards||[]).map(x=>x.name),trophies:(rr.trophies||[]).map(x=>x.name)});
      }
    }catch(e){invariantErrors.push({pos,error:String(e?.message||e),age:game.age,year:game.seasonYear,stage:game.stage})}
    fullCareers.push({pos,talent:game.talentRank,seasons:seasons.length,finalAge:game.age,finalOvr:game.ovr,peakOvr:game.peakOvr,transfers:(game.transfers||[]).length,
      ballon:(game.awards||[]).filter(x=>x.name==='발롱도르').length,worldXI:(game.awards||[]).filter(x=>/FIFPRO 월드 베스트/.test(x.name)).length,
      totalGoals:seasons.reduce((n,x)=>n+x.goals,0),totalAssists:seasons.reduce((n,x)=>n+x.assists,0),seasonRows:seasons});
  }

  const anomalies=[];
  for(const row of statMatrix){
    const {pos,ovr,mean,max}=row;
    for(const [k,v] of Object.entries(mean))if(!Number.isFinite(v)||v<0)anomalies.push({type:'invalid-stat',row,k,v});
    if(mean.passPct>100||mean.savePct>100)anomalies.push({type:'percentage-over-100',row});
    if(pos==='GK'&&(mean.goals!==0||mean.assists!==0))anomalies.push({type:'gk-scoring',row});
    if(ovr===90&&row.clubBand==='mid'){
      if(pos==='ST'&&(mean.goals<10||mean.goals>38))anomalies.push({type:'st-goal-range',row});
      if(['LW','RW'].includes(pos)&&(mean.goals<6||mean.goals>30))anomalies.push({type:'wing-goal-range',row});
      if(pos==='AM'&&(mean.goals<5||mean.goals>28))anomalies.push({type:'am-goal-range',row});
      if(['CB','LB','RB','LWB','RWB','DM'].includes(pos)&&mean.goals>10)anomalies.push({type:'def-goals-high',row});
    }
    if(max.goals>55||max.assists>40)anomalies.push({type:'extreme-output',row});
  }
  for(const a of awardMatrix){
    if(a.poor.includes('발롱도르'))anomalies.push({type:'poor-ballon',award:a});
    if(a.poor.includes('FIFPRO 월드 베스트 11'))anomalies.push({type:'poor-worldxi',award:a});
    if(!a.elite.includes('FIFPRO 월드 베스트 11'))anomalies.push({type:'elite-no-worldxi',award:a});
    if(!a.elite.includes('발롱도르'))anomalies.push({type:'elite-no-ballon-path',award:a});
  }
  for(const t of transferMatrix){
    if(t.count!==3||t.unique!==3)anomalies.push({type:'transfer-count',row:t});
    const ps=t.offers.map(x=>x.power);
    if(t.ovr<=65&&Math.max(...ps)>88)anomalies.push({type:'low-ovr-elite-offer',row:t});
    if(t.ovr>=92&&ps.filter(x=>x>=90).length<1)anomalies.push({type:'elite-player-no-elite-offer',row:t});
  }
  for(const a of agingCurves){if(a.end>=a.start)anomalies.push({type:'no-aging-decline',row:a})}
  anomalies.push(...invariantErrors.map(x=>({type:'career-invariant',...x})));

  return{
    generatedAt:new Date().toISOString(),
    positions:POS,
    roles:POS.reduce((n,p)=>n+POSITIONS[p].roles.length,0),
    clubs:Object.fromEntries(Object.entries(clubs).map(([k,c])=>[k,{name:c.name,power:power(c),league:c.league}])),
    statMatrix,awardMatrix,transferMatrix,growthCurves,agingCurves,teamModel,fullCareers,invariantErrors,anomalies,
    pageState:{version:window.CAREER24_V56_QA?.version}
  };
});

fs.writeFileSync('tests/v56-stress-report.json',JSON.stringify(report,null,2));
console.log('V56_STRESS_SUMMARY '+JSON.stringify({
  version:report.pageState.version,
  positions:report.positions.length,
  roles:report.roles,
  statCases:report.statMatrix.length,
  fullCareers:report.fullCareers.length,
  fullCareerSeasons:report.fullCareers.reduce((n,x)=>n+x.seasons,0),
  anomalies:report.anomalies.length,
  invariantErrors:report.invariantErrors.length,
  clubs:report.clubs,
  growth:report.growthCurves.map(x=>({pos:x.pos,talent:x.talent,start:x.start,end:x.end})),
  teamModel:report.teamModel,
  careers:report.fullCareers.map(x=>({pos:x.pos,talent:x.talent,seasons:x.seasons,finalOvr:x.finalOvr,peakOvr:x.peakOvr,goals:x.totalGoals,assists:x.totalAssists,ballon:x.ballon,worldXI:x.worldXI,transfers:x.transfers})),
  anomaliesTop:report.anomalies.slice(0,40)
}));

if(pageErrors.length)console.log('V56_PAGE_ERRORS '+JSON.stringify(pageErrors));
await browser.close();
