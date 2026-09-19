(function(){
'use strict';
const V56='V5.6 CAREER BALANCE';
const N=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const C=(v,a,b)=>Math.max(a,Math.min(b,v));
const Q=id=>document.getElementById(id);
const TALENT={
  '최하':{growth:[8,13],style:[6,10],target28:70,label:'28세 전후 OVR 70이 정상적인 장기 성장선'},
  '하':{growth:[14,20],style:[10,15],target28:78,label:'꾸준한 출전 시 70대 후반까지 성장 가능'},
  '중':{growth:[21,30],style:[16,22],target28:86,label:'주전 커리어에서 80대 중후반 성장 기대'},
  '상':{growth:[32,44],style:[23,31],target28:94,label:'최상위 리그 핵심급까지 성장 가능한 재능'},
  '최상':{growth:[52,68],style:[32,42],target28:100,label:'최적 육성 시 28세 이전 OVR 100 도달 가능'}
};
const TALENT_ORDER=['최하','하','중','상','최상'];

function hash56(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function rng56(seed){let a=hash56(seed);return()=>{a|=0;a=a+0x6D2B79F5|0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function int56(r,a,b){return Math.floor(r()*(b-a+1))+a}
function clone56(v){try{return JSON.parse(JSON.stringify(v))}catch(_){return v}}
function talent56(){if(typeof game==='undefined'||!game)return'중';return TALENT[game.talentRank]?game.talentRank:'중'}
function calcOvr56(){try{return calcOVR(game.attributes,game.player.pos,game.player.role)}catch(_){return N(game.ovr,1)}}
function syncHistory56(){
  if(typeof game==='undefined'||!game||!game.lastResult)return;
  const i=(game.seasonHistory||[]).findIndex(x=>x.year===game.lastResult.year);
  if(i>=0)game.seasonHistory[i]=clone56(game.lastResult);
}
function save56(){try{autoSave()}catch(_){}}
function render56(){try{renderGame()}catch(_){}}

// ---------- five-tier talent ----------
function installTalent56(){
  const el=Q('v3Talent');if(!el)return;
  let value=TALENT[el.value]?el.value:(typeof game!=='undefined'&&game&&TALENT[game.talentRank]?game.talentRank:'중');
  el.innerHTML=TALENT_ORDER.map(k=>'<option value="'+k+'">'+k+' · 성장 '+TALENT[k].growth[0]+'~'+TALENT[k].growth[1]+'P</option>').join('');
  el.value=value;
  const d=Q('v3TalentDesc');
  if(d)d.textContent=TALENT[value].label;
  if(el.dataset.v56!=='1'){
    el.dataset.v56='1';
    el.addEventListener('change',()=>{const x=el.value;if(Q('v3TalentDesc')&&TALENT[x])Q('v3TalentDesc').textContent=TALENT[x].label});
  }
}
const prevOpenNew56=window.openNewGame;
if(typeof prevOpenNew56==='function'){
  window.openNewGame=function(){const out=prevOpenNew56.apply(this,arguments);setTimeout(installTalent56,0);return out};
  try{openNewGame=window.openNewGame}catch(_){}
}
const prevCreate56=window.createCareer;
if(typeof prevCreate56==='function'){
  window.createCareer=function(){
    installTalent56();
    const chosen=Q('v3Talent')?.value;
    const out=prevCreate56.apply(this,arguments);
    if(typeof game!=='undefined'&&game){
      game.talentRank=TALENT[chosen]?chosen:(TALENT[game.talentRank]?game.talentRank:'중');
      if(!game.v56TalentOrigin)game.v56TalentOrigin={rank:game.talentRank,startAge:N(game.age),startOvr:N(game.ovr)};
      save56();render56();
    }
    return out;
  };
  try{createCareer=window.createCareer}catch(_){}
}

function growthModifiers56(){
  const r=game.lastResult||{},age=N(game.age),ovr=N(game.ovr),rank=talent56(),cfg=TALENT[rank];
  let ageM=age<=20?1.08:age<=24?1.02:age<=27?.95:age<=30?.68:age<=33?.42:.22;
  const mins=N(r.minutes),apps=N(r.apps);
  let playM=apps===0?.70:mins<600?.68:mins<1500?.84:mins<2400?.96:1.05;
  let injuryM=1;const ig=N(r.injury?.games);if(ig>=18)injuryM=.70;else if(ig>=9)injuryM=.86;else if(ig>=4)injuryM=.94;
  let capM=1;
  const soft=cfg.target28;
  if(rank==='최상'){
    if(ovr>=99)capM=.48;else if(ovr>=97)capM=.72;else if(ovr>=94)capM=.90;
  }else{
    if(ovr>=soft+2)capM=.18;
    else if(ovr>=soft)capM=.32;
    else if(ovr>=soft-2)capM=.52;
    else if(ovr>=soft-6)capM=.76;
  }
  return{age:ageM,playing:playM,injury:injuryM,ceiling:capM,total:ageM*playM*injuryM*capM};
}
function growthWeight56(k){
  const p=window.getRoleOvrProfile?.(game.player.pos,game.player.role);
  const t=p?.t1?.includes(k)?1:p?.t2?.includes(k)?2:3;
  const cur=N(game.attributes[k],50),r=game.lastResult||{},s=r.stats||{};
  let w=t===1?1.34:t===2?1.08:.82;
  w*=.70+(100-cur)/100*.72;
  const usage={
    '골 결정력':N(s.goals)*5+N(s.shots),'슈팅':N(s.shots)*2+N(s.shotsOnTarget)*2,
    '드리블':N(s.dribbleAttempts),'볼 컨트롤':Math.round(N(r.minutes)/90*8),
    '패스':Math.round(N(s.passes)/14),'크로스':Math.round(N(s.keyPasses)*1.4),
    '스피드':Math.round(N(r.minutes)/100),'피지컬':N(s.duels),'체력':Math.round(N(r.minutes)/90),
    '헤더':Math.round(N(s.duels)*.3),'태클':N(s.tackles),'수비력':N(s.tackles)+N(s.interceptions)+N(s.blocks),
    '위치선정':N(s.goals)*4+N(s.interceptions),'판단력':Math.round(N(r.minutes)/140)+N(s.keyPasses),
    '시야':N(s.keyPasses)*2+N(s.assists)*3,'선방':N(s.saves),'반사신경':Math.round(N(s.saves)*.7),
    '1대1':Math.round(N(s.saves)*.25),'공중볼':Math.round(N(r.apps)),'킥':Math.round(N(s.passes)/15)
  }[k]||0;
  w*=.90+Math.min(.28,usage/75);
  return Math.max(.08,w);
}
function allocateGrowth56(total,sel){
  const caps=Object.fromEntries(sel.map(k=>[k,Math.max(0,100-N(game.attributes[k]))]));
  const inc=Object.fromEntries(sel.map(k=>[k,0]));
  const applied=Math.min(total,sel.reduce((n,k)=>n+caps[k],0));let left=applied;
  const rg=rng56(String(game.careerId)+'|v56-growth-alloc|'+game.seasonYear+'|'+sel.join('|'));
  while(left>0){
    const open=sel.filter(k=>caps[k]>0);if(!open.length)break;
    const ws=open.map(k=>({k,w:growthWeight56(k)*(.92+rg()*.16)}));
    const sum=ws.reduce((a,x)=>a+x.w,0);let z=rg()*sum,pick=ws[0].k;
    for(const x of ws){z-=x.w;if(z<=0){pick=x.k;break}}
    inc[pick]++;caps[pick]--;left--;
  }
  return{inc,applied,lost:total-applied};
}
window.startV3Growth=function(){
  if(typeof game==='undefined'||!game||game.stage!=='development'||game.v3GrowthPlan?.applied)return;
  const sel=[...(game.v3GrowthPlan?.selected||[])];
  if(sel.length!==3){try{toast('성장시킬 능력 3개를 선택하세요')}catch(_){};return}
  const rank=talent56(),cfg=TALENT[rank],rg=rng56(String(game.careerId)+'|v56-growth-total|'+game.seasonYear+'|'+rank);
  const rolled=int56(rg,cfg.growth[0],cfg.growth[1]),mods=growthModifiers56();
  const total=Math.max(1,Math.round(rolled*mods.total)),old=N(game.ovr),a=allocateGrowth56(total,sel),changes=[];
  for(const k of sel){
    const before=N(game.attributes[k]),change=N(a.inc[k]);
    game.attributes[k]=Math.min(100,before+change);
    const p=window.getRoleOvrProfile?.(game.player.pos,game.player.role),tier=p?.t1?.includes(k)?1:p?.t2?.includes(k)?2:3;
    changes.push({attribute:k,before,after:game.attributes[k],change,tier});
  }
  game.ovr=calcOvr56();game.peakOvr=Math.max(N(game.peakOvr),N(game.ovr));
  const gr={schema_version:'GrowthResult-5.6',attribute_changes:changes,old_ovr:old,new_ovr:game.ovr,total_growth:a.applied,rolled_growth:rolled,lost_growth:a.lost,talent_rank:rank,selected_attributes:sel,
    modifiers:{age:+mods.age.toFixed(2),playing_time:+mods.playing.toFixed(2),injury:+mods.injury.toFixed(2),talent_ceiling:+mods.ceiling.toFixed(2)},
    target_ovr_age_28:cfg.target28,
    growth_summary:changes.map(x=>x.attribute+' '+x.before+'→'+x.after+' (+'+x.change+')').join(' · ')};
  game.v3GrowthPlan.applied=true;game.v3GrowthPlan.result=gr;
  if(game.lastResult){game.lastResult.attribute_growth=clone56(gr);syncHistory56()}
  save56();render56();try{renderDevelopment()}catch(_){}
};
try{startV3Growth=window.startV3Growth}catch(_){}

function desiredStyleXp56(){
  if(typeof game==='undefined'||!game)return 0;const cfg=TALENT[talent56()],rg=rng56(String(game.careerId)+'|v56-style-xp|'+game.seasonYear+'|'+talent56());
  return int56(rg,cfg.style[0],cfg.style[1]);
}
function fixStyleXp56(){
  if(typeof game==='undefined'||!game||game.stage!=='development'||game.playstyleExpAwardYear!==game.seasonYear)return;
  if(game.v56StyleExpFixedYear===game.seasonYear)return;
  const old=N(game.lastStyleExpAward),want=desiredStyleXp56(),delta=want-old;
  game.playstyleExpPool=Math.max(0,N(game.playstyleExpPool)+delta);
  game.lastStyleExpAward=want;game.v56StyleExpFixedYear=game.seasonYear;
  if(game.lastResult){game.lastResult.playstyleExpEarned=want;game.lastResult.playstyleExpTalent=talent56();syncHistory56()}
  save56();
}
const prevEnterDev56=window.enterDevelopment;
if(typeof prevEnterDev56==='function'){
  window.enterDevelopment=function(){const out=prevEnterDev56.apply(this,arguments);fixStyleXp56();render56();return out};
  try{enterDevelopment=window.enterDevelopment}catch(_){}
}
const prevRenderDev56=window.renderDevelopment;
if(typeof prevRenderDev56==='function'){
  window.renderDevelopment=function(){
    fixStyleXp56();const out=prevRenderDev56.apply(this,arguments);
    const root=Q('developmentPane');if(root&&typeof game!=='undefined'&&game){
      const old=root.querySelector('.v56-talent-card');if(old)old.remove();
      const cfg=TALENT[talent56()],box=document.createElement('div');box.className='card v56-talent-card';
      box.style.marginBottom='12px';box.innerHTML='<div class="small-title">TALENT CURVE V5.6</div><h3 style="margin:4px 0">'+talent56()+' 재능</h3><p class="muted">'+cfg.label+' · 기본 성장 '+cfg.growth[0]+'~'+cfg.growth[1]+'P · 플레이스타일 EXP '+cfg.style[0]+'~'+cfg.style[1]+'</p>';
      root.insertBefore(box,root.firstChild);
    }
    return out;
  };
  try{renderDevelopment=window.renderDevelopment}catch(_){}
}

// ---------- real aging decline ----------
function agingTotal56(age,rg){
  if(age<29)return 0;
  if(age===29)return int56(rg,1,2);
  if(age===30)return int56(rg,1,3);
  if(age===31)return int56(rg,2,4);
  if(age===32)return int56(rg,3,5);
  if(age===33)return int56(rg,4,6);
  if(age===34)return int56(rg,5,7);
  if(age===35)return int56(rg,6,9);
  if(age===36)return int56(rg,8,11);
  return int56(rg,10,14);
}
window.applyAging=function(){
  if(typeof game==='undefined'||!game||game.agingFreeze)return;
  const age=N(game.age);if(age<29)return;
  const attrs=game.attributes||{},keys=Object.keys(attrs);if(!keys.length)return;
  const beforeOvr=N(game.ovr),rg=rng56(String(game.careerId)+'|v56-aging|'+game.seasonYear+'|'+age),total=agingTotal56(age,rg);
  const physical=new Set(['스피드','체력','피지컬','반사신경','1대1','공중볼']);
  const mental=new Set(['판단력','시야','위치선정','패스','킥']);
  const dec={};let left=total;
  while(left>0){
    const pool=keys.filter(k=>N(attrs[k])>1);if(!pool.length)break;
    const ws=pool.map(k=>{let w=physical.has(k)?(age>=34?4.2:3.2):mental.has(k)?(age<=32?.28:.62):1.45;w*=.85+N(attrs[k])/130;return{k,w}});
    const sum=ws.reduce((a,x)=>a+x.w,0);let z=rg()*sum,pick=ws[0].k;
    for(const x of ws){z-=x.w;if(z<=0){pick=x.k;break}}
    attrs[pick]=Math.max(1,N(attrs[pick])-1);dec[pick]=N(dec[pick])+1;left--;
  }
  game.ovr=calcOvr56();
  game.lastAgingDecline={fromAge:age,toAge:age+1,total:total-left,ovrBefore:beforeOvr,ovrAfter:N(game.ovr),changes:Object.entries(dec).map(([attribute,change])=>({attribute,change:-change}))};
  game.debug=Array.isArray(game.debug)?game.debug:[];
  game.debug.push('[v56 aging] '+age+'→'+(age+1)+' raw -'+(total-left)+' / OVR '+beforeOvr+'→'+game.ovr);
};
try{applyAging=window.applyAging}catch(_){}

// ---------- attacking midfielder output correction ----------
const prevCompute56=window.computeStats;
if(typeof prevCompute56==='function'){
  window.computeStats=function(r,apps,minutes,c,injuryGames,effects){
    const s=prevCompute56.apply(this,arguments);
    if(typeof game==='undefined'||!game||game.player?.pos!=='AM'||N(minutes)<=0)return s;
    const a=game.attributes||{},avg=keys=>keys.reduce((n,k)=>n+N(a[k]),0)/keys.length;
    const skill=avg(['골 결정력','슈팅','위치선정','드리블','볼 컨트롤','판단력'])/100;
    const role=String(game.player.role||'');let roleM=/쉐도우/.test(role)?1.22:/트레콰르티스타|공격형미드필더/.test(role)?1.08:/전진형플레이메이커/.test(role)?.96:/엔간체/.test(role)?.90:1;
    const teamM=C(N(c?.ctx?.chance,75)/78,.82,1.18),per90=N(minutes)/90;
    const targetP90=C((.82+skill*1.72)*roleM*teamM,1.15,3.05);
    const targetShots=Math.round(per90*targetP90),current=N(s.shots),extra=Math.max(0,targetShots-current);
    if(extra>0){
      const rg=rng56(String(game.careerId)+'|v56-am-output|'+game.seasonYear+'|'+N(apps)+'|'+N(minutes));
      const sotP=C(.37+skill*.26,.45,.66),extraSot=Array.from({length:extra},()=>rg()<sotP?1:0).reduce((a,b)=>a+b,0);
      const goalPerSot=C(.20+skill*.18,.27,.39),extraGoals=Array.from({length:extraSot},()=>rg()<goalPerSot?1:0).reduce((a,b)=>a+b,0);
      s.shots=current+extra;s.shotsOnTarget=N(s.shotsOnTarget)+extraSot;s.goals=N(s.goals)+extraGoals;
      game._v56AmOutput={targetShotsPer90:+targetP90.toFixed(2),extraShots:extra,extraGoals};
    }
    return s;
  };
  try{computeStats=window.computeStats}catch(_){}
}

// ---------- award system: output and trophies before raw OVR ----------
window.calcAwards=function(result,c,r){
  const out=[],s=result.stats||{},nat=result.national||{},l=LEAGUES[c.league]||{},pos=game.player.pos;
  const apps=N(result.apps),rating=N(result.rating),goals=N(s.goals),assists=N(s.assists),ga=goals+assists;
  const def=N(s.tackles)+N(s.interceptions)+N(s.blocks),clean=N(s.clean),prestige=N(l.prestige,60),rank=N(result.competitions?.league?.rank,99);
  const add=(name,p)=>{if(!out.some(x=>x.name===name))out.push({type:'개인',name,prestige:p})};
  const mid=['AM','CM','DM','LM','RM'].includes(pos),attack=['ST','LW','RW'].includes(pos),defender=['CB','LB','RB','LWB','RWB'].includes(pos);
  const leagueImpact=pos==='GK'?(clean>=Math.max(5,apps*.20)||N(s.savePct)>=71):defender?(def>=apps*1.25):pos==='DM'?(def>=apps*1.15||assists>=5):pos==='CM'?(ga>=Math.max(7,apps*.20)||N(s.keyPasses)>=apps*.55):pos==='AM'?(ga>=Math.max(8,apps*.25)||N(s.keyPasses)>=apps*.65):(ga>=Math.max(10,apps*.30));
  if(apps>=18&&rating>=7.08&&leagueImpact)add(c.league+' 베스트 11',prestige*.58);
  if(N(game.age)<=21&&apps>=15&&rating>=7.05&&leagueImpact)add(c.league+' 올해의 영플레이어',prestige*.52);
  const goalLine=Math.max(12,Math.round(18*N(l.matches,38)/38));
  if((attack||pos==='AM')&&goals>=goalLine)add(c.league+' 득점왕',prestige*.64);
  if((mid||['LW','RW'].includes(pos))&&assists>=10)add(c.league+' 도움왕',prestige*.56);
  if(apps>=25&&rating>=7.52&&rank<=4&&leagueImpact&&((attack||pos==='AM')?ga>=14:true))add(c.league+' 올해의 선수',prestige*.72);
  const cont=result.competitions?.continental,contStage=cont?.result;
  if(cont&&['우승','준우승','4강'].includes(contStage)&&apps>=22&&rating>=7.38&&leagueImpact)add(cont.name+' 베스트 11',90);
  const natGa=N(nat.goals)+N(nat.assists),deepNat=['우승','준우승','4강','8강'].includes(nat.result);
  if(nat.tournament&&N(nat.apps)>=4&&deepNat&&natGa>=2)add(nat.tournament+' 베스트 11',92);
  if(nat.tournament&&N(nat.goals)>=4)add(nat.tournament+' 골든부트',94);
  if(nat.tournament&&['우승','준우승','4강'].includes(nat.result)&&N(nat.apps)>=4&&natGa>=4&&rating>=7.30)add(nat.tournament+' 골든볼',98);
  const worldGate=attack?ga>=20:pos==='AM'?ga>=15:['CM','LM','RM'].includes(pos)?(ga>=12||N(s.keyPasses)>=apps*.75):pos==='DM'||defender?(rating>=7.42&&def>=apps*1.35):pos==='GK'?(rating>=7.38&&clean>=Math.max(10,apps*.28)):false;
  if(apps>=25&&rating>=7.35&&prestige>=72&&worldGate)add('FIFPRO 월드 베스트 11',96);
  const leagueWin=rank===1,cupWin=result.competitions?.cup?.result==='우승',contWin=contStage==='우승',contFinal=['우승','준우승'].includes(contStage),natWin=nat.result==='우승',natFinal=['우승','준우승'].includes(nat.result);
  let ballonGate=false;
  if(attack)ballonGate=apps>=28&&rating>=7.45&&goals>=18&&ga>=30;
  else if(pos==='AM')ballonGate=apps>=28&&rating>=7.45&&goals>=8&&ga>=22;
  else if(['CM','LM','RM'].includes(pos))ballonGate=apps>=28&&rating>=7.50&&ga>=18;
  else if(pos==='DM'||defender)ballonGate=apps>=28&&rating>=7.65&&def>=apps*1.55;
  else if(pos==='GK')ballonGate=apps>=28&&rating>=7.60&&clean>=Math.max(13,apps*.32);
  const ballonContext=contFinal||natFinal||(leagueWin&&prestige>=84)||ga>=35;
  const titlePts=(leagueWin?8:0)+(cupWin?3:0)+(contWin?14:0)+(natWin?16:0);
  const ballonScore=rating*10+Math.min(40,ga*1.25)+titlePts+prestige*.10+N(game.ovr)*.12;
  if(ballonGate&&ballonContext&&ballonScore>=128)add('발롱도르',100);
  return out;
};
try{calcAwards=window.calcAwards}catch(_){}

// ---------- exactly three realistic external transfer offers ----------
function power56(c){try{return N(window.teamPowerScore?window.teamPowerScore(c):c.power,N(c.power,60))}catch(_){return N(c?.power,60)}}
function division56(c){try{return N(LEAGUES[c.league]?.division,1)}catch(_){return 1}}
function offerRole56(c){
  const diff=N(game.ovr)-(power56(c)-6);
  try{return roleStatus(diff)[0]}catch(_){return diff>=8?'핵심 선발':diff>=2?'주전':diff>=-6?'로테이션':'백업'}
}
function marketTarget56(){
  const r=game.lastResult||{},apps=Math.max(1,N(r.apps)),ga=N(r.stats?.goals)+N(r.stats?.assists);
  let t=N(game.ovr)+7;
  if(N(r.rating)>=7.65)t+=3;else if(N(r.rating)>=7.30)t+=1.5;else if(r.rating&&N(r.rating)<6.55)t-=2.5;
  const atk=['ST','LW','RW','AM'].includes(game.player?.pos);if(atk&&ga/apps>=.65)t+=2;else if(atk&&ga/apps>=.4)t+=1;
  const rep=N(game.reputation?.score);if(rep>=75)t+=2;else if(rep>=50)t+=1;
  return C(t,43,99);
}
window.generateOffers=function(){
  if(typeof game==='undefined'||!game)return[];
  const current=(()=>{try{return currentClub()}catch(_){return null}})(),target=marketTarget56(),r=game.lastResult||{};
  let offsets=N(game.ovr)>=93?[-3,0,2]:N(game.ovr)>=88?[-2,1,4]:N(r.rating)>=7.5?[-2,2,6]:[-3,1,5];
  let pool=(typeof CLUBS!=='undefined'?CLUBS:[]).filter(c=>!current||c.name!==current.name);
  const picked=[],usedLeagues=new Set(),usedCountries=new Set(),rg=rng56(String(game.careerId)+'|v56-offers|'+game.seasonYear+'|'+N(game.ovr));
  for(let slot=0;slot<3;slot++){
    const want=C(target+offsets[slot],40,99);
    const ranked=pool.filter(c=>!picked.includes(c)).map(c=>{
      const cp=power56(c),div=division56(c);let score=Math.abs(cp-want)*3;
      if(N(game.ovr)>=78&&div>1)score+=36;if(N(game.ovr)>=88&&cp<86)score+=55;if(N(game.ovr)>=93&&cp<90)score+=90;
      if(N(game.ovr)<68&&cp>target+9)score+=24;
      if(usedLeagues.has(c.league))score+=11;if(usedCountries.has(c.country))score+=4;
      score+=rg()*3;return{c,score};
    }).sort((a,b)=>a.score-b.score);
    if(ranked[0]){picked.push(ranked[0].c);usedLeagues.add(ranked[0].c.league);usedCountries.add(ranked[0].c.country)}
  }
  const eliteMin=N(game.ovr)>=95?2:N(game.ovr)>=88?1:0;
  if(eliteMin){
    const elite=pool.filter(c=>division56(c)===1&&power56(c)>=92).sort((a,b)=>power56(b)-power56(a));
    let have=picked.filter(c=>power56(c)>=92).length;
    for(const c of elite){
      if(have>=eliteMin)break;if(picked.includes(c))continue;
      let idx=-1,best=-1;for(let i=0;i<picked.length;i++){if(power56(picked[i])<92&&power56(picked[i])>best){best=power56(picked[i]);idx=i}}
      if(idx>=0){picked[idx]=c;have++}
    }
  }
  if(picked.length<3){
    for(const c of pool.sort((a,b)=>Math.abs(power56(a)-target)-Math.abs(power56(b)-target))){if(picked.length>=3)break;if(!picked.includes(c))picked.push(c)}
  }
  const labels=['현재 수준 적정','한 단계 상향','상위권 도전'];
  const offers=picked.slice(0,3).map((c,i)=>{
    const cp=power56(c),role=offerRole56(c),years=N(game.age)<24?4:N(game.age)<30?3:Math.max(1,Math.min(3,38-N(game.age)));
    const rep=N(game.reputation?.score),wage=Math.round(C(N(c.wage,20)*9000*(N(game.ovr)/76)*(.76+rep/115)*(role==='핵심 선발'?1.18:role==='주전'?1.04:.88),150,1200000)/10)*10;
    const fee=game.contract&&N(game.contract.end)>N(game.seasonYear)?N(game.marketValue)*(1+Math.min(4,N(game.contract.end)-N(game.seasonYear))*.07)*(.94+rg()*.20):0;
    return{type:'transfer',club:c.name,years,role,wage,fee,reason:labels[i]+' · OVR '+N(game.ovr)+' / 구단 전력 '+Math.round(cp)+' · 최근 평점 '+(r.rating?N(r.rating).toFixed(2):'-')+' · 시즌 성과와 인지도를 함께 반영'};
  });
  game.debug=Array.isArray(game.debug)?game.debug:[];game.debug.push('[v56 offers] exactly 3: '+offers.map(x=>x.club).join(' / '));
  return offers;
};
try{generateOffers=window.generateOffers}catch(_){}

// ---------- visible version stamp and diagnostics ----------
function stamp56(){
  const brand=document.querySelector('.brand');if(brand)brand.innerHTML='CAREER<b>24</b> <span>V5.6 BALANCE</span>';
  const foot=document.querySelector('.footer');if(foot)foot.textContent='CAREER24 V5.6 · 3 REALISTIC OFFERS · 5-TIER TALENT · AGING · PERFORMANCE AWARDS';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installTalent56();stamp56()},{once:true});else{installTalent56();stamp56()}
setTimeout(()=>{installTalent56();stamp56()},350);

window.CAREER24_V56_QA={
  version:V56,
  talent:TALENT,
  offerCount:()=>{try{return window.generateOffers().length}catch(_){return-1}},
  agingPreview(age){const rg=rng56('qa-aging-'+age);return agingTotal56(age,rg)},
  amTargetShotsPer90(skill=.75,role='공격형미드필더',teamChance=78){let m=/쉐도우/.test(role)?1.22:/트레콰르티스타|공격형미드필더/.test(role)?1.08:/전진형플레이메이커/.test(role)?.96:/엔간체/.test(role)?.90:1;return+C((.82+C(skill,0,1)*1.72)*m*C(teamChance/78,.82,1.18),1.15,3.05).toFixed(2)}
};
console.log('CAREER24 V5.6 career balance patch loaded');
})();