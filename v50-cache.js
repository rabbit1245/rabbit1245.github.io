(function(){
'use strict';
const VERSION='V5.0 FAST DB CACHE';
const DB_NAME='career24-cache';
const STORE='kv';
const KEY='fc25-processed-v1';
const CACHE_VERSION=1;
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function get(k){const db=await idb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),rq=tx.objectStore(STORE).get(k);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error)})}
async function set(k,v){const db=await idb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function del(k){const db=await idb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
function stamp(){try{return localStorage.getItem('career24_db_cache_stamp')||''}catch(_){return''}}
function setStamp(v){try{localStorage.setItem('career24_db_cache_stamp',v)}catch(_){}}
function readyFromCache(payload){
 const LIVE=window.CAREER24_LIVE_DB;if(!LIVE)return false;
 if(!payload||payload.version!==CACHE_VERSION||!Array.isArray(payload.players)||payload.players.length<5000)return false;
 LIVE.players=payload.players;LIVE.rows=payload.rows||payload.players.length;LIVE.source='indexeddb://fc25-processed';LIVE.state='ready';LIVE.error=null;LIVE.startedAt=Date.now();LIVE.finishedAt=Date.now();
 try{window.CAREER24_REBUILD_LIVE_INDEXES?.()}catch(e){console.error('cache index rebuild',e);return false}
 try{if(window.CAREER24_V46_DATA){window.CAREER24_V46_DATA.ready=true;window.CAREER24_V46_DATA.players=LIVE.players}}catch(_){}
 try{if(window.REAL_DB_STATE){window.REAL_DB_STATE.loaded=true;window.REAL_DB_STATE.loading=false;window.REAL_DB_STATE.error=null;window.REAL_DB_STATE.players=LIVE.players.length}}catch(_){}
 try{window.dispatchEvent(new CustomEvent('career24-db-state'))}catch(_){}
 try{window.dispatchEvent(new CustomEvent('career24-live-db-ready',{detail:{players:LIVE.players.length,mapped:LIVE.mapped,logos:LIVE.logos,cached:true}}))}catch(_){}
 try{window.renderEditor?.()}catch(_){}
 try{if(document.getElementById('createScreen')?.classList.contains('active'))window.refreshClubPreview?.()}catch(_){}
 try{if(window.game)window.renderGame?.()}catch(_){}
 return true;
}
async function snapshotAfterNetwork(){
 const LIVE=window.CAREER24_LIVE_DB;if(!LIVE||LIVE.state!=='ready'||!Array.isArray(LIVE.players)||LIVE.players.length<5000)return;
 const payload={version:CACHE_VERSION,players:LIVE.players,rows:LIVE.rows||LIVE.players.length,createdAt:Date.now()};
 try{await set(KEY,payload);setStamp(String(payload.createdAt));console.log('CAREER24 player DB cached',LIVE.players.length)}catch(e){console.warn('player cache save failed',e)}
}
let saving=false;
window.addEventListener('career24-live-db-ready',()=>{if(saving)return;const LIVE=window.CAREER24_LIVE_DB;if(LIVE?.source==='indexeddb://fc25-processed')return;saving=true;snapshotAfterNetwork().finally(()=>saving=false)});
window.CAREER24_FAST_DB_BOOT=async function(){
 const LIVE=window.CAREER24_LIVE_DB;
 if(!LIVE)return;
 try{
   const payload=await get(KEY);
   if(readyFromCache(payload)){console.log('CAREER24 fast DB cache hit',payload.players.length);return}
 }catch(e){console.warn('player cache read failed',e)}
 try{await window.CAREER24_RECONNECT_REAL_DB?.()}catch(e){console.error('network DB fallback failed',e)}
};
window.CAREER24_CLEAR_DB_CACHE=async function(){await del(KEY);setStamp('');location.reload()};
window.CAREER24_DB_CACHE_INFO=async function(){try{const p=await get(KEY);return{version:VERSION,cached:!!p,count:p?.players?.length||0,createdAt:p?.createdAt||0,stamp:stamp()}}catch(e){return{version:VERSION,cached:false,error:String(e)}}};
console.log('CAREER24 V5.0 fast DB cache loaded');
})();