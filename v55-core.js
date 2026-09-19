(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CAREER24_V55_CORE=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  function acceptOfferState(game,offer){
    if(!game||game.stage!=='transfer'||!offer)return false;
    game.pendingTransfer={
      type:offer.type||'transfer',
      fromClub:game.club||null,
      toClub:offer.club,
      years:n(offer.years,1),
      role:offer.role||'주전',
      wage:n(offer.wage,0),
      fee:n(offer.fee,0),
      signingBonus:n(game.marketValue,0)*0.06,
      acceptedSeason:n(game.seasonYear,2024),
      effectiveSeason:n(game.seasonYear,2024)+1
    };
    game.phaseCompleted=game.phaseCompleted||{};
    game.phaseCompleted.transfer=true;
    game.stage='turnend';
    return true;
  }
  function stayState(game){
    if(!game||game.stage!=='transfer')return false;
    game.pendingTransfer=null;
    game.pendingRelease=!!(game.contract&&n(game.contract.end,9999)<=n(game.seasonYear,2024)+1);
    game.phaseCompleted=game.phaseCompleted||{};
    game.phaseCompleted.transfer=true;
    game.stage='turnend';
    return true;
  }
  function commitPending(game,lookupClub){
    const p=game.pendingTransfer;
    if(p){
      const before=game.club||null;
      game.club=p.toClub;
      const c=typeof lookupClub==='function'?lookupClub(p.toClub):null;
      if(c)game.clubId=c.canonicalId||c.id||game.clubId||null;
      game.contract={start:n(game.seasonYear,2024)+1,end:n(game.seasonYear,2024)+1+n(p.years,1),role:p.role,signingBonus:n(p.signingBonus),transferFee:n(p.fee)};
      game.wage=n(p.wage);
      game.wealth=n(game.wealth)+n(p.signingBonus);
      game.careerStats=game.careerStats||{};
      game.careerStats.income=n(game.careerStats.income)+n(p.signingBonus);
      game.transfers=Array.isArray(game.transfers)?game.transfers:[];
      if(p.type!=='renew')game.transfers.push({season:n(game.seasonYear,2024)+1,from:before,to:p.toClub,fee:n(p.fee),wage:n(p.wage)});
      game.lastClub=game.club;
      game.careerState='ACTIVE_CLUB';
      game.faSince=null;
      game.pendingTransfer=null;
    }else if(game.pendingRelease){
      game.lastClub=game.club||game.lastClub||null;
      game.club=null;game.clubId=null;game.wage=0;game.contract=null;
      game.careerState='FREE_AGENT';
      game.faSince=n(game.seasonYear,2024)+1;
      game.pendingRelease=false;
    }else{
      game.careerState=game.club?'ACTIVE_CLUB':'FREE_AGENT';
    }
  }
  function advanceTurn(game,helpers={}){
    if(!game||game.stage!=='turnend'||game.careerState==='RETIRED')return {ok:false,reason:'INVALID_STAGE'};
    const fromYear=n(game.seasonYear,2024);
    const carry=n(game.developmentPoints,0);
    commitPending(game,helpers.lookupClub);
    if(typeof helpers.applyAging==='function')helpers.applyAging(game);
    game.age=n(game.age)+1;
    game.seasonYear=fromYear+1;
    game.seasonLabel=game.seasonYear+'/'+String(game.seasonYear+1).slice(-2);
    game.seed=(n(game.seed) * 1664525 + 1013904223)>>>0;
    game.fitness=100;game.injury=null;game.eventChoice=null;game.lastResult=null;
    game.pendingOffers=[];
    game.phaseCompleted={};
    game.playstyleExpPool=0;game.lastStyleExpAward=0;
    game.v3GrowthPlan={selected:[],applied:false,result:null};
    game.developmentPoints=carry;
    game.worldState=game.worldState||{};
    game.worldState.npcYear=game.seasonYear;
    if(game.pendingLeagueChange&&typeof helpers.applyLeagueChange==='function'){
      try{helpers.applyLeagueChange(game)}catch(_){}
    }
    if(game.club){
      game.careerState='ACTIVE_CLUB';game.stage='season';
    }else{
      game.careerState='FREE_AGENT';game.stage='development';
      game.developmentPoints=Math.max(carry,20);
    }
    return {ok:true,fromYear,toYear:game.seasonYear,club:game.club||null,stage:game.stage};
  }
  return {acceptOfferState,stayState,commitPending,advanceTurn};
});