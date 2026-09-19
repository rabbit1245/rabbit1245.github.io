(function(){
'use strict';
const VERSION='V5.4 INTEGRATED GAME DB';
const PACK=window.CAREER24_BUNDLED_DB||{rows:[]};
const CRESTS=window.CAREER24_BUNDLED_CRESTS||{};
let integrated=false;

function initials(s){return String(s||'FC').replace(/\b(FC|CF|AFC|SC|AC|AS|FK|SK|SV|HD|Club|United|City)\b/gi,' ').trim().split(/\s+/).filter(Boolean).slice(0,3).map(x=>x[0]).join('').toUpperCase()||'FC'}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function clubObj(v){
 if(v&&typeof v==='object')return v;
 if(typeof v==='string'){
   try{return window.clubByName?.(v)||null}catch(_){return null}
 }
 return null;
}
function clubId(v){
 const c=clubObj(v);
 if(c?.canonicalId)return c.canonicalId;
 if(c?.id&&CRESTS[c.id])return c.id;
 if(typeof v==='string'){
   try{return window.CAREER24_RESOLVE_CLUB?.(v,c?.league)||null}catch(_){}
 }
 return null;
}
function crestHtml(v,size=48){
 const c=clubObj(v), id=clubId(v), label=c?.name||c?.display||c?.nativeName||(typeof v==='string'?v:'CLUB'), path=id?CRESTS[id]:null, ini=initials(label);
 if(path)return '<div class="c54-crest" data-club-id="'+esc(id)+'" title="'+esc(label)+'" style="width:'+size+'px;height:'+size+'px"><img src="'+esc(path)+'?v=54" alt="'+esc(label)+' crest" draggable="false"><span style="display:none">'+esc(ini)+'</span></div>';
 return '<div class="c54-crest" data-club-id="'+esc(id||'')+'" title="'+esc(label)+'" style="width:'+size+'px;height:'+size+'px"><span>'+esc(ini)+'</span></div>';
}
function arm(img){if(!img||img.dataset.c54==='1')return;img.dataset.c54='1';img.onerror=()=>{const s=img.nextElementSibling;if(s){img.style.display='none';s.style.display='grid'}}}
function hydrate(root=document){
 root.querySelectorAll?.('.c54-crest img').forEach(arm);
 root.querySelectorAll?.('#clubPreview .club-badge').forEach(el=>{
   const sel=document.getElementById('clubSelect'),c=sel?window.clubByName?.(sel.value):null;
   if(c)el.outerHTML=crestHtml(c,60);
 });
 root.querySelectorAll?.('.v3-logo-fallback[data-club-id],.c52-crest[data-club-id]').forEach(el=>{
   const id=el.dataset.clubId,size=parseInt(el.style.width)||48;
   if(id&&CRESTS[id]){const c=window.CAREER24_CANONICAL_DB?.clubs?.find(x=>x.id===id)||{id,canonicalId:id,name:el.getAttribute('title')||el.textContent};el.outerHTML=crestHtml(c,size)}
 });
}
function unpack(){
 const rows=PACK.rows||[];
 return rows.map(r=>({
   id:r[0],name:r[1],club:r[2],clubNative:r[3],league:r[4],pos:r[5],positions:r[6]||[],
   ovr:r[7]||50,potential:r[8]||r[7]||50,age:r[9]||0,nation:r[10]||'',
   canonicalClubId:r[11]||null,clubId:r[11]||null,preferredFoot:r[12]||'',
   weakFoot:r[13]||0,skillMoves:r[14]||0,heightCm:r[15]||'',weightKg:r[16]||'',
   ratings:{pace:r[17]||0,shooting:r[18]||0,passing:r[19]||0,dribbling:r[20]||0,defending:r[21]||0,physical:r[22]||0},
   realData:true,source:'EA SPORTS FC 25 · BUILT-IN'
 }));
}
function integrate(){
 if(integrated)return window.CAREER24_LIVE_DB;
 const LIVE=window.CAREER24_LIVE_DB;
 if(!LIVE||!Array.isArray(PACK.rows)||PACK.rows.length<5000)return LIVE;
 const t=performance.now();
 const players=unpack();
 LIVE.players=players;LIVE.rows=players.length;LIVE.state='ready';LIVE.error=null;LIVE.source='bundle://player-db.js';LIVE.startedAt=Date.now();LIVE.finishedAt=Date.now();
 try{window.CAREER24_REBUILD_LIVE_INDEXES?.()}catch(e){console.error('integrated index rebuild',e)}
 try{if(window.CAREER24_V46_DATA){window.CAREER24_V46_DATA.ready=true;window.CAREER24_V46_DATA.players=players}}catch(_){}
 try{if(window.REAL_DB_STATE){window.REAL_DB_STATE.loaded=true;window.REAL_DB_STATE.loading=false;window.REAL_DB_STATE.error=null;window.REAL_DB_STATE.players=players.length}}catch(_){}
 integrated=true;
 const st=document.getElementById('c45LiveStatus');
 if(st)st.innerHTML='<b>BUILT-IN PLAYER DB · '+players.length.toLocaleString()+'명</b><br><span>별도 데이터 로딩 없이 게임에 직접 연결됨</span>';
 const snap=document.querySelector('.snapshot');if(snap)snap.textContent='2024 DATA · '+players.length.toLocaleString()+' PLAYERS · BUILT-IN';
 try{window.dispatchEvent(new CustomEvent('career24-db-state'))}catch(_){}
 try{window.dispatchEvent(new CustomEvent('career24-live-db-ready',{detail:{players:players.length,bundled:true}}))}catch(_){}
 console.log('CAREER24 integrated DB ready',players.length,Math.round(performance.now()-t)+'ms');
 return LIVE;
}

function integratedPreview(){
 const sel=document.getElementById('clubSelect');if(!sel)return;
 const c=window.clubByName?.(sel.value);if(!c)return;
 const rivals=window.samePosCompetitors?.(c,window.selectedPos||selectedPos)||[];
 const rivalText=rivals.length?rivals.slice(0,4).map(x=>x.name+' ('+x.ovr+')').join(' · '):'등록 경쟁자 없음';
 let ovr=35;try{ovr=window.calcOVR?.(window.createGeneratedAttrs||createGeneratedAttrs,window.selectedPos||selectedPos,window.selectedRole||selectedRole)||35}catch(_){}
 const diff=(c.power||50)-ovr,d=diff>35?'매우 높음':diff>25?'높음':diff>15?'보통':diff>5?'낮음':'주전 경쟁 유리';
 const root=document.getElementById('clubPreview');if(!root)return;
 root.innerHTML=crestHtml(c,60)+'<div><h4>'+esc(c.name)+'</h4><p>'+esc(c.league)+' · 팀 전력 '+Math.round(c.power||0)+' · 예상 경쟁 '+d+'</p><p style="margin-top:4px">동포지션 실제 선수: '+esc(rivalText)+'</p><p style="margin-top:4px">실제 로스터 연결: '+rivals.length+'명 · 로고 로컬 고정</p><div style="border-top:1px solid var(--line);margin-top:10px;padding-top:8px;font-size:10px;color:var(--muted)">club_id '+esc(c.canonicalId||c.id||'-')+' · '+esc(c.nativeName||c.name)+' · BUILT-IN DB</div></div>';
 hydrate(root);
}

const style=document.createElement('style');
style.textContent='.c54-crest{display:grid;place-items:center;flex:0 0 auto;border-radius:12px;overflow:hidden;background:#fff;border:1px solid #48515c}.c54-crest img{width:100%;height:100%;object-fit:contain;display:block;background:#fff;padding:4px}.c54-crest span{width:100%;height:100%;display:grid;place-items:center;color:#252a31;font-weight:950;font-size:11px;text-align:center;padding:3px}.club-preview>.c54-crest{align-self:start}';
document.head.appendChild(style);

window.CAREER24_FAST_DB_BOOT=integrate;
window.CAREER24_RECONNECT_REAL_DB=integrate;
window.loadRealDb=integrate;
window.CAREER24_INTEGRATED={version:VERSION,players:()=>PACK.count||PACK.rows?.length||0,crests:()=>Object.keys(CRESTS).length,hydrate};
window.CAREER24_REAL_LOGO={url:v=>{const id=clubId(v);return id?CRESTS[id]||'':''},html:crestHtml,hydrate,wiki:async()=>''};
window.ClubLogo=crestHtml;
try{ClubLogo=crestHtml}catch(_){}
try{clubLogoHtml=crestHtml}catch(_){}
window.hydrateLogos=hydrate;try{hydrateLogos=hydrate}catch(_){}
window.refreshClubPreview=integratedPreview;try{refreshClubPreview=integratedPreview}catch(_){}

const XO=XMLHttpRequest.prototype.open,XS=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open=function(method,u){this.__c54Block=/wikipedia\.org\/w\/api\.php/i.test(String(u||''));return XO.apply(this,arguments)};
XMLHttpRequest.prototype.send=function(){if(this.__c54Block){try{this.abort()}catch(_){};return}return XS.apply(this,arguments)};

const mo=new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)hydrate(n)});mo.observe(document.documentElement,{childList:true,subtree:true});
integrate();hydrate(document);
function stampUI(){
 const brand=document.querySelector('.brand');if(brand)brand.innerHTML='CAREER<b>24</b> <span>V5.4 INTEGRATED</span>';
 const foot=document.querySelector('.footer');if(foot)foot.textContent='CAREER24 V5.4 INTEGRATED · 16,161 BUILT-IN PLAYERS · LOCAL CLUB CRESTS';
 const snap=document.querySelector('.snapshot');if(snap)snap.textContent='2024 DATA · 16,161 PLAYERS · BUILT-IN';
}
stampUI();setTimeout(stampUI,420);
console.log('CAREER24 V5.4 integrated game data loaded');
})();