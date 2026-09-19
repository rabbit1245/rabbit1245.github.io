(function(){
'use strict';
const MAP=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const initials=s=>String(s||'FC').replace(/\b(FC|CF|AFC|SC|AC|AS|FK|SK|SV|HD|Club|United|City)\b/gi,' ').trim().split(/\s+/).filter(Boolean).slice(0,3).map(x=>x[0]).join('').toUpperCase()||'FC';
function rec(v){
 let c=typeof v==='object'&&v?v:null,name=typeof v==='string'?v:(c?.name||c?.display||c?.nativeName||'');
 let id=c?.canonicalId||c?.id||null;
 try{if(!id&&name)id=window.CAREER24_RESOLVE_CLUB?.(c?.nativeName||name,c?.league)||null}catch(_){}
 const r=id?window.CAREER24_CANONICAL_DB?.clubs?.find(x=>x.id===id):null;
 return {c,name,id,r};
}
function url(v){const {id}=rec(v);return id&&MAP.get(id)||''}
function html(v,size=48){
 const {c,name,r}=rec(v),label=r?.display||c?.name||c?.display||name||'CLUB',u=url(v),ini=initials(label);
 return '<div class="c52-crest" title="'+esc(label)+'" style="width:'+size+'px;height:'+size+'px">'+(u?'<img src="'+esc(u)+'?v=52" alt="'+esc(label)+' crest" loading="eager" decoding="async"><span style="display:none">'+esc(ini)+'</span>':'<span>'+esc(ini)+'</span>')+'</div>';
}
function arm(img){if(!img||img.dataset.c52==='1')return;img.dataset.c52='1';img.onerror=()=>{const s=img.nextElementSibling;if(s){img.style.display='none';s.style.display='grid'}}}
function replace(el){
 if(!el||el.classList.contains('c52-crest'))return;
 const name=el.dataset?.c45Name||el.getAttribute('title')||el.querySelector('img')?.alt?.replace(/\s+crest$/i,'')||el.textContent.trim()||'CLUB';
 const size=parseInt(el.style.width)||parseInt(getComputedStyle(el).width)||48;
 el.outerHTML=html(name,size);
}
function fix(root=document){
 root.querySelectorAll?.('.c45-real-crest,.c48-crest,.c49-crest,.c24-final-crest[title],.v41-game-crest[title],.c24-logo').forEach(replace);
 root.querySelectorAll?.('.c52-crest').forEach(el=>{
   const img=el.querySelector('img');
   if(img){arm(img);return}
   const name=el.getAttribute('title')||el.textContent.trim()||'CLUB';
   const size=parseInt(el.style.width)||parseInt(getComputedStyle(el).width)||48;
   const u=url(name);
   if(u)el.outerHTML=html(name,size);
 });
 root.querySelectorAll?.('.c52-crest img').forEach(arm);
}
async function load(){
 try{
   const r=await fetch('data/canonical-logos.json?v=52',{cache:'force-cache'});if(!r.ok)throw new Error('HTTP '+r.status);
   const j=await r.json();for(const [id,path] of Object.entries(j||{}))MAP.set(id,path);
   window.CAREER24_LOCAL_CRESTS.ready=true;window.CAREER24_LOCAL_CRESTS.count=MAP.size;
   fix(document);
   try{if(window.game)window.renderGame?.()}catch(_){}
 }catch(e){window.CAREER24_LOCAL_CRESTS.error=String(e?.message||e)}
}
const style=document.createElement('style');
style.textContent='.c52-crest{display:grid;place-items:center;flex:0 0 auto;border-radius:12px;overflow:hidden;background:#f4f6f8;border:1px solid #48515c}.c52-crest img{width:100%;height:100%;object-fit:contain;display:block;background:#f4f6f8}.c52-crest span{width:100%;height:100%;display:grid;place-items:center;color:#252a31;font-weight:950;font-size:11px;text-align:center;padding:3px}';
document.head.appendChild(style);
window.CAREER24_LOCAL_CRESTS={version:'V5.2 LOCAL CANONICAL CRESTS',ready:false,count:0,error:null,url,html,refresh:()=>fix(document)};
const XO=XMLHttpRequest.prototype.open,XS=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open=function(method,u){this.__c52BlockWiki=/wikipedia\.org\/w\/api\.php/i.test(String(u||''));return XO.apply(this,arguments)};
XMLHttpRequest.prototype.send=function(){if(this.__c52BlockWiki){try{this.abort()}catch(_){};return}return XS.apply(this,arguments)};
window.CAREER24_REAL_LOGO={url,html,hydrate:fix,wiki:async()=>''};
window.ClubLogo=html;
const mo=new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)fix(n)});mo.observe(document.documentElement,{childList:true,subtree:true});
function boot(){fix(document);load();const brand=document.querySelector('.brand');if(brand)brand.innerHTML='CAREER<b>24</b> <span>V5.2 LOCAL CRESTS</span>'}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
console.log('CAREER24 V5.2 local canonical crests loaded');
})();