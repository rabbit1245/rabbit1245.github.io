(function(){
'use strict';
const VERSION='V5.3 PREBUILT DB';
const LIVE=window.CAREER24_LIVE_DB;
function setStatus(msg,sub){
 const el=document.getElementById('c45LiveStatus');
 if(el)el.innerHTML='<b>'+msg+'</b>'+(sub?'<br><span>'+sub+'</span>':'');
}
async function boot(){
 if(!LIVE)return;
 if(LIVE.state==='ready'&&Array.isArray(LIVE.players)&&LIVE.players.length>5000)return;
 LIVE.state='loading';LIVE.error=null;LIVE.startedAt=Date.now();
 setStatus('PLAYER DB READYING IN BACKGROUND','게임은 지금 바로 조작할 수 있습니다. 사전 가공 선수 DB를 읽는 중입니다.');
 try{
   const r=await fetch('data/players.min.json?v=2',{cache:'force-cache'});
   if(!r.ok)throw new Error('HTTP '+r.status);
   const data=await r.json();
   const players=Array.isArray(data?.players)?data.players:[];
   if(players.length<5000)throw new Error('prebuilt players '+players.length);
   LIVE.players=players;
   LIVE.rows=players.length;
   LIVE.source='prebuilt://players.min.json';
   LIVE.state='ready';
   LIVE.error=null;
   LIVE.finishedAt=Date.now();
   try{window.CAREER24_REBUILD_LIVE_INDEXES?.()}catch(e){console.error('prebuilt index rebuild',e)}
   try{if(window.CAREER24_V46_DATA){window.CAREER24_V46_DATA.ready=true;window.CAREER24_V46_DATA.players=players}}catch(_){}
   try{if(window.REAL_DB_STATE){window.REAL_DB_STATE.loaded=true;window.REAL_DB_STATE.loading=false;window.REAL_DB_STATE.error=null;window.REAL_DB_STATE.players=players.length}}catch(_){}
   setStatus('PLAYER DB CONNECTED · '+players.length.toLocaleString()+'명','CSV 파싱 없이 사전 가공된 2024 선수 DB를 사용합니다.');
   try{window.dispatchEvent(new CustomEvent('career24-db-state'))}catch(_){}
   try{window.dispatchEvent(new CustomEvent('career24-live-db-ready',{detail:{players:players.length,prebuilt:true}}))}catch(_){}
   try{window.renderEditor?.()}catch(_){}
   try{if(document.getElementById('createScreen')?.classList.contains('active'))window.refreshClubPreview?.()}catch(_){}
   try{if(window.game)window.renderGame?.()}catch(_){}
   console.log('CAREER24 prebuilt DB ready',players.length,'in',LIVE.finishedAt-LIVE.startedAt,'ms');
 }catch(e){
   LIVE.state='error';LIVE.error=String(e?.message||e);LIVE.finishedAt=Date.now();
   setStatus('PLAYER DB FALLBACK','사전 가공 DB를 읽지 못했지만 게임은 내장 데이터로 계속 플레이할 수 있습니다.');
   console.error('CAREER24 V5.3 prebuilt DB failed',e);
 }
}
window.CAREER24_FAST_DB_BOOT=boot;
window.CAREER24_RECONNECT_REAL_DB=boot;
window.loadRealDb=boot;
window.CAREER24_V53={version:VERSION,boot,state:LIVE};
const brand=document.querySelector('.brand');if(brand)brand.innerHTML='CAREER<b>24</b> <span>V5.3 PREBUILT DB</span>';
console.log('CAREER24 V5.3 prebuilt DB loader loaded');
})();