(function(){
'use strict';
const PACK=window.CAREER24_BUNDLED_DB||{rows:[]};
let done=false;
function unpack(){
  return (PACK.rows||[]).map(r=>({
    id:r[0],name:r[1],club:r[2],clubNative:r[3],league:r[4],pos:r[5],positions:r[6]||[],
    ovr:r[7]||50,potential:r[8]||r[7]||50,age:r[9]||0,nation:r[10]||'',
    canonicalClubId:r[11]||null,clubId:r[11]||null,preferredFoot:r[12]||'',
    weakFoot:r[13]||0,skillMoves:r[14]||0,heightCm:r[15]||'',weightKg:r[16]||'',
    ratings:{pace:r[17]||0,shooting:r[18]||0,passing:r[19]||0,dribbling:r[20]||0,defending:r[21]||0,physical:r[22]||0},
    realData:true,source:'EA SPORTS FC 25 · BUILT-IN'
  }));
}
function integrate(){
  if(done)return window.CAREER24_LIVE_DB;
  const LIVE=window.CAREER24_LIVE_DB;
  if(!LIVE)return LIVE;
  if(!Array.isArray(PACK.rows)||PACK.rows.length<5000){
    LIVE.state='error';LIVE.error='내장 선수 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.';
    if(window.REAL_DB_STATE)Object.assign(window.REAL_DB_STATE,{loaded:false,loading:false,error:LIVE.error});
    return LIVE;
  }
  LIVE.startedAt=Date.now();
  const players=unpack();
  LIVE.players=players;LIVE.rows=players.length;LIVE.state='loading';LIVE.error=null;LIVE.source='bundle://player-db.js';
  try{window.CAREER24_REBUILD_LIVE_INDEXES?.()}catch(e){console.error('v55 index rebuild',e)}
  try{if(window.CAREER24_V46_DATA){window.CAREER24_V46_DATA.ready=true;window.CAREER24_V46_DATA.players=players}}catch(_){}
  try{if(window.REAL_DB_STATE){window.REAL_DB_STATE.loaded=true;window.REAL_DB_STATE.loading=false;window.REAL_DB_STATE.error=null;window.REAL_DB_STATE.players=players.length}}catch(_){}
  done=true;LIVE.state='ready';LIVE.finishedAt=Date.now();
  try{window.dispatchEvent(new CustomEvent('career24-db-state'))}catch(_){}
  try{window.dispatchEvent(new CustomEvent('career24-live-db-ready',{detail:{players:players.length,bundled:true}}))}catch(_){}
  return LIVE;
}
window.CAREER24_FAST_DB_BOOT=integrate;
window.CAREER24_RECONNECT_REAL_DB=integrate;
window.loadRealDb=integrate;
window.CAREER24_V55_DATA={version:'V5.5 BUILT-IN DATA',integrate,count:()=>PACK.count||PACK.rows?.length||0};
integrate();
console.log('CAREER24 V5.5 built-in player DB ready',PACK.count||PACK.rows?.length||0);
})();
