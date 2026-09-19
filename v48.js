(function(){
'use strict';
const VERSION='V4.8 EXACT CRESTS';
const LOGOS=new Map();
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9가-힣]+/g,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const initials=s=>String(s||'FC').replace(/\b(FC|CF|AFC|SC|AC|AS|FK|SK|SV|VfB|VfL|TSG|RB|HD)\b/gi,' ').trim().split(/\s+/).filter(Boolean).slice(0,3).map(x=>x[0]).join('').toUpperCase()||'FC';

const style=document.createElement('style');
style.textContent='.c48-crest{display:grid;place-items:center;flex:0 0 auto;border-radius:12px;overflow:hidden;background:#f4f6f8;border:1px solid #48515c}.c48-crest img{width:100%;height:100%;object-fit:contain;display:block;background:#f4f6f8}.c48-crest span{width:100%;height:100%;display:grid;place-items:center;color:#252a31;font-weight:950;font-size:11px;text-align:center;padding:3px}';
document.head.appendChild(style);

function safeUrl(u){
  u=String(u||'').trim(); if(!u)return'';
  try{
    const x=new URL(u,location.href);
    if(x.origin===location.origin && /\.(png|webp|svg)(\?|$)/i.test(x.pathname))return x.href;
    if(/^https:\/\/cdn\.sofifa\.(net|com)\/teams\/\d+\/\d+\.png(?:\?.*)?$/i.test(u))return u;
  }catch(_){}
  return'';
}
function put(name,url){const n=norm(name),u=safeUrl(url);if(n&&u&&!LOGOS.has(n))LOGOS.set(n,u)}
function seedFromLive(){
  const rows=window.CAREER24_LIVE_DB?.players||[];
  for(const p of rows){put(p.clubNative,p.clubLogo);put(p.club,p.clubLogo)}
}
function recFor(v){
  let c=typeof v==='object'&&v?v:null,name=typeof v==='string'?v:(c?.name||c?.display||c?.nativeName||'');
  let id=c?.canonicalId||c?.id||null;
  try{if(!id&&name)id=window.CAREER24_RESOLVE_CLUB?.(c?.nativeName||name,c?.league)||null}catch(_){}
  const rec=id?window.CAREER24_CANONICAL_DB?.clubs?.find(x=>x.id===id):null;
  return {c,name,id,rec};
}
function logoFor(v){
  const {c,name,rec}=recFor(v);
  const names=[rec?.native,rec?.display,c?.nativeName,c?.name,c?.display,name].filter(Boolean);
  for(const n of names){const u=LOGOS.get(norm(n));if(u)return u}
  return'';
}
function crest(v,size=48){
  const {c,name,rec}=recFor(v),label=rec?.display||c?.name||c?.display||name||'CLUB',u=logoFor(v),ini=initials(label);
  if(u)return '<div class="c48-crest" title="'+esc(label)+'" style="width:'+size+'px;height:'+size+'px"><img src="'+esc(u)+'" alt="'+esc(label)+' crest" loading="eager" decoding="async"><span style="display:none">'+esc(ini)+'</span></div>';
  return '<div class="c48-crest" title="'+esc(label)+'" style="width:'+size+'px;height:'+size+'px"><span>'+esc(ini)+'</span></div>';
}
function armImg(img){if(!img||img.dataset.c48Armed==='1')return;img.dataset.c48Armed='1';img.addEventListener('error',()=>{const sp=img.nextElementSibling;if(sp){img.style.display='none';sp.style.display='grid'}})}
function replaceOne(el,name,size){if(!el||el.dataset.c48Fixed==='1')return;el.dataset.c48Fixed='1';el.outerHTML=crest(name,size)}
function fixAll(root=document){
  root.querySelectorAll?.('.c45-real-crest').forEach(el=>{
    const name=el.dataset.c45Name||el.querySelector('img')?.alt?.replace(/\s+crest$/i,'')||el.getAttribute('title')||el.textContent.trim();
    const size=parseInt(el.style.width)||48,u=logoFor(name),img=el.querySelector('img');
    if(img&&!safeUrl(img.src)){el.outerHTML=crest(name,size);return}
    if(u&&(!img||safeUrl(img.src)!==u)){el.outerHTML=crest(name,size);return}
    if(!u&&img){el.outerHTML=crest(name,size);return}
    el.querySelectorAll('img').forEach(armImg);
  });
  root.querySelectorAll?.('.c24-final-crest[title],.v41-game-crest[title]').forEach(el=>replaceOne(el,el.getAttribute('title'),parseInt(el.style.width)||48));
  root.querySelectorAll?.('.c24-logo').forEach(el=>{const name=el.querySelector('img')?.alt?.replace(/\s+crest$/i,'')||el.textContent.trim()||'CLUB';replaceOne(el,name,parseInt(el.style.width)||48)});
  root.querySelectorAll?.('.c48-crest img').forEach(armImg);
}
async function loadLogoMap(){
  try{
    const r=await fetch('data/logos.json?v=48',{cache:'force-cache'}); if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json(); for(const [name,url] of Object.entries(j||{}))put(name,url);
    window.CAREER24_LOGO_V48.ready=true;window.CAREER24_LOGO_V48.count=LOGOS.size;fixAll(document);
    try{if(window.game)window.renderGame?.()}catch(_){}
  }catch(e){
    window.CAREER24_LOGO_V48.error=String(e?.message||e); seedFromLive(); fixAll(document);
  }
}

try{localStorage.removeItem('career24_real_logo_cache_v46');localStorage.removeItem('career24_club_logo_cache_v3')}catch(_){}

const XO=XMLHttpRequest.prototype.open,XS=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open=function(method,url){this.__c48BlockWiki=/wikipedia\.org\/w\/api\.php/i.test(String(url||''));return XO.apply(this,arguments)};
XMLHttpRequest.prototype.send=function(){if(this.__c48BlockWiki){setTimeout(()=>{try{this.abort()}catch(_){};try{this.onerror?.(new Event('error'))}catch(_){}},0);return}return XS.apply(this,arguments)};

window.CAREER24_LOGO_V48={version:VERSION,ready:false,count:0,error:null,url:logoFor,html:crest,refresh:()=>{seedFromLive();fixAll(document)}};
window.CAREER24_REAL_LOGO={url:logoFor,html:crest,hydrate:fixAll,wiki:async()=>''};
window.ClubLogo=crest;
window.addEventListener('career24-live-db-ready',()=>{seedFromLive();fixAll(document)});

const mo=new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)fixAll(n)});
mo.observe(document.documentElement,{childList:true,subtree:true});

const pre=document.createElement('link');pre.rel='preconnect';pre.href='https://cdn.sofifa.net';pre.crossOrigin='anonymous';document.head.appendChild(pre);

function boot(){
  seedFromLive();fixAll(document);loadLogoMap();
  const brand=document.querySelector('.brand');if(brand)brand.innerHTML='CAREER<b>24</b> <span>V4.8 EXACT CRESTS</span>';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
setTimeout(()=>{seedFromLive();fixAll(document)},250);
console.log('CAREER24 V4.8 exact crest patch loaded');
})();