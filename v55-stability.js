(function(){
'use strict';
const CORE=window.CAREER24_V55_CORE;
if(!CORE)throw new Error('CAREER24 V5.5 core missing');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function lookupClub(name){try{return window.clubByName?.(name)||null}catch(_){return null}}
function safeAging(g){
  try{
    if(typeof applyAging==='function'){applyAging();return}
  }catch(_){}
  if(g.agingFreeze||n(g.age)<30)return;
}
function safeLeagueChange(g){
  try{
    if(typeof applyPendingLeagueChange==='function')return applyPendingLeagueChange();
  }catch(_){}
  const p=g.pendingLeagueChange;if(!p)return false;
  g.worldState=g.worldState||{};g.worldState.clubLeagueOverrides=g.worldState.clubLeagueOverrides||{};
  if(p.clubId||g.clubId)g.worldState.clubLeagueOverrides[p.clubId||g.clubId]=p.to;
  g.pendingLeagueChange=null;return true;
}
function saveAndRender(){
  try{autoSave?.()}catch(e){console.error('autosave',e)}
  try{renderGame?.()}catch(e){console.error('renderGame',e)}
}
window.acceptOffer=function(i){
  if(!game||game.stage!=='transfer')return;
  const o=pendingOffers?.[i];if(!o)return;
  if(!CORE.acceptOfferState(game,o))return;
  pendingOffers=[];
  try{autoSave?.()}catch(_){}
  try{renderGame?.()}catch(_){}
  try{openPane('transferPane',document.querySelector('[data-pane="transferPane"]'))}catch(_){}
  try{toast(o.type==='renew'?'재계약 확정 · 턴 종료 시 반영':'이적 확정 · 턴 종료 후 새 팀 적용')}catch(_){}
};
try{acceptOffer=window.acceptOffer}catch(_){}

window.stayCurrent=function(){
  if(!game||game.stage!=='transfer')return;
  if(!CORE.stayState(game))return;
  pendingOffers=[];
  try{autoSave?.()}catch(_){}
  try{renderGame?.()}catch(_){}
  try{openPane('transferPane',document.querySelector('[data-pane="transferPane"]'))}catch(_){}
  try{toast(game.pendingRelease?'계약 만료 · 턴 종료 후 FA':'잔류 확정 · 턴 종료 가능')}catch(_){}
};
try{stayCurrent=window.stayCurrent}catch(_){}

window.endTurn=function(){
  if(!game)return;
  const beforeYear=game.seasonYear,beforeStage=game.stage;
  const out=CORE.advanceTurn(game,{lookupClub,applyAging:safeAging,applyLeagueChange:safeLeagueChange});
  if(!out.ok){console.warn('V5.5 endTurn blocked',out,beforeStage);try{toast('턴 종료 조건을 확인하세요')}catch(_){};return}
  pendingOffers=[];
  try{if(typeof simulateNpcWorld==='function')simulateNpcWorld()}catch(e){console.error('npc world update skipped',e)}
  saveAndRender();
  try{
    const pane=game.stage==='development'?'developmentPane':'seasonPane';
    openPane(pane,document.querySelector('[data-pane="'+pane+'"]'));
  }catch(_){}
  try{toast(game.stage==='development'?'새 시즌 · FA 육성 단계':'다음 시즌 시작')}catch(_){}
  console.log('V5.5 turn complete',beforeYear,'->',game.seasonYear,game.club,game.stage);
};
try{endTurn=window.endTurn}catch(_){}

window.offerHtml=function(o,i){
  const c=lookupClub(o.club);
  return '<div class="offer"><div class="small-title">'+(o.type==='renew'?'재계약':'이적 제안')+'</div><h3>'+esc(o.club)+'</h3><div class="league">'+esc(c?.league||'')+' · 전력 '+Math.round(n(c?.power))+'</div><div class="offer-stats"><div class="offer-stat"><b>'+esc(o.role)+'</b><span>예상 역할</span></div><div class="offer-stat"><b>'+n(o.years)+'년</b><span>계약 기간</span></div><div class="offer-stat"><b>'+esc(fmtWage(o.wage))+'</b><span>주급</span></div><div class="offer-stat"><b>'+(o.fee?esc(fmtMoney(o.fee)):'FA/0')+'</b><span>이적료</span></div></div><p class="muted" style="font-size:10px;line-height:1.45">'+esc(o.reason||'')+'</p><button class="primary" style="width:100%;margin-top:8px" '+(game.stage==='transfer'?'':'disabled')+' onclick="acceptOffer('+i+')">수락</button></div>';
};
try{offerHtml=window.offerHtml}catch(_){}

window.renderTransfer=function(){
  const root=document.getElementById('transferPane');if(!root||!game)return;
  if(game.stage==='transfer'&&!pendingOffers.length)pendingOffers=generateOffers();
  const c=typeof currentClub==='function'?currentClub():lookupClub(game.club);
  const currentBox=c?'<div class="offer"><div class="small-title">현재 계약</div><h3>'+esc(c.name)+'</h3><div class="league">'+esc(c.league||'')+'</div><div class="offer-stats"><div class="offer-stat"><b>'+esc(game.contract?.role||'-')+'</b><span>스쿼드 역할</span></div><div class="offer-stat"><b>'+esc(game.contract?.end||'-')+'</b><span>계약 만료</span></div><div class="offer-stat"><b>'+esc(fmtWage(game.wage))+'</b><span>현재 주급</span></div><div class="offer-stat"><b>'+esc(fmtMoney(game.marketValue))+'</b><span>시장가치</span></div></div><button class="secondary" style="width:100%" '+(game.stage==='transfer'?'':'disabled')+' onclick="stayCurrent()">모든 제안 거절 / 잔류</button></div>':'<div class="offer"><div class="small-title">현재 상태</div><h3>FA · 무소속</h3></div>';
  const pending=game.pendingTransfer?'<div class="card" style="margin-bottom:12px"><div class="small-title">다음 시즌 확정</div><h3>'+esc(game.pendingTransfer.toClub)+'</h3><p class="muted">'+esc(game.pendingTransfer.role)+' · '+esc(fmtWage(game.pendingTransfer.wage))+' · '+n(game.pendingTransfer.years)+'년</p></div>':'';
  root.innerHTML='<div class="card"><div class="section-head"><div><div class="small-title">TRANSFER MARKET</div><h2>이적 / 재계약</h2></div></div>'+pending+'<div class="transfer-grid">'+currentBox+(game.stage==='transfer'?pendingOffers.map((o,i)=>offerHtml(o,i)).join(''):'')+'</div>'+(game.stage==='turnend'?'<button id="v55EndTurnBtn" class="primary" style="margin-top:16px;width:100%" onclick="endTurn()">턴 종료 · 다음 시즌으로</button>':'')+'</div>';
};
try{renderTransfer=window.renderTransfer}catch(_){}

window.refreshClubPreview=function(){
  const sel=document.getElementById('clubSelect'),box=document.getElementById('clubPreview');if(!sel||!box)return;
  let c=lookupClub(sel.value);
  if(!c){const rec=window.CAREER24_CANONICAL_DB?.clubs?.find(x=>x.id===sel.value);if(rec)c=(window.CLUBS||[]).find(x=>x.canonicalId===rec.id||x.id===rec.id)||{name:rec.display,nativeName:rec.native,canonicalId:rec.id,league:''}}
  if(!c)return;
  let rivals=[];try{rivals=window.samePosCompetitors?.(c,window.selectedPos||selectedPos)||[]}catch(_){}
  box.innerHTML='<div style="min-width:0"><h4>'+esc(c.name)+'</h4><p>'+esc(c.league||'')+' · 팀 전력 '+Math.round(n(c.power))+'</p><p style="margin-top:7px"><b>동포지션 실제 선수</b>: '+(rivals.length?rivals.slice(0,5).map(p=>esc(p.name)+' ('+n(p.ovr)+')').join(' · '):'등록 경쟁자 없음')+'</p><p style="margin-top:7px"><b>실제 로스터 연결</b>: '+rivals.length+'명</p></div>';
};
try{refreshClubPreview=window.refreshClubPreview}catch(_){}

window.ClubLogo=()=>'';try{ClubLogo=window.ClubLogo}catch(_){}
try{clubLogoHtml=()=>''}catch(_){}
window.CAREER24_REAL_LOGO={url:()=>'',html:()=>'',hydrate:()=>{},wiki:async()=>''};
try{
 const XO=XMLHttpRequest.prototype.open,XS=XMLHttpRequest.prototype.send;
 XMLHttpRequest.prototype.open=function(method,u){this.__v55NoLogo=/wikipedia\.org\/w\/api\.php|football-logos|sofifa\.(net|com)/i.test(String(u||''));return XO.apply(this,arguments)};
 XMLHttpRequest.prototype.send=function(){if(this.__v55NoLogo){try{this.abort()}catch(_){};return}return XS.apply(this,arguments)};
}catch(_){}

const style=document.createElement('style');
style.textContent='.c54-crest,.c52-crest,.c49-crest,.c48-crest,.c45-real-crest,.c24-logo,.v3-logo-fallback,.club-badge-logo,.club-badge{display:none!important}.club-preview{grid-template-columns:1fr!important}.offer-club-head{display:block!important}';
document.head.appendChild(style);

function stamp(){
 const brand=document.querySelector('.brand');if(brand)brand.innerHTML='CAREER<b>24</b> <span>V5.5 STABLE</span>';
 const foot=document.querySelector('.footer');if(foot)foot.textContent='CAREER24 V5.5 STABLE · BUILT-IN PLAYER DB · LOGOS DISABLED';
 const snap=document.querySelector('.snapshot');if(snap)snap.textContent='2024 DATA · 16,161 PLAYERS · BUILT-IN';
}
stamp();setTimeout(stamp,450);
window.CAREER24_V55_STABLE={version:'V5.5 STABLE',endTurn:window.endTurn};
console.log('CAREER24 V5.5 stability patch loaded');
})();