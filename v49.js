(function(){
'use strict';
const VERSION='V4.9 DETERMINISTIC CRESTS';
const INDEX=new Map();
const UNIQUE=new Map();
const COUNTRY_EXACT=new Map();
const COUNTRY_SIMPLE=new Map();
const COUNTRY={
 '대한민국':'south-korea','일본':'japan','중국':'china','미국':'united-states','브라질':'brazil',
 '이탈리아':'italy','프랑스':'france','스페인':'spain','독일':'germany','영국':'england',
 '포르투갈':'portugal','벨기에':'belgium','네덜란드':'netherlands','튀르키예':'turkey'
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const initials=s=>String(s||'FC').replace(/\b(fc|cf|afc|sc|ac|as|fk|sk|sv|club|united|city)\b/gi,' ').trim().split(/\s+/).filter(Boolean).slice(0,3).map(x=>x[0]).join('').toUpperCase()||'FC';
function safe(u){
 u=String(u||'').trim();
 return /^(?:https:\/\/raw\.githubusercontent\.com\/JoseArroyave\/football-logos\/(?:refs\/heads\/)?main|https:\/\/cdn\.jsdelivr\.net\/gh\/JoseArroyave\/football-logos@main)\/logos\/[a-z0-9-]+\/[^?#]+\.svg$/i.test(u)?u:'';
}
function canonical(v){
 let c=typeof v==='object'&&v?v:null,name=typeof v==='string'?v:(c?.name||c?.display||c?.nativeName||'');
 let id=c?.canonicalId||c?.id||null;
 try{if(!id&&name)id=window.CAREER24_RESOLVE_CLUB?.(c?.nativeName||name,c?.league)||null}catch(_){}
 const rec=id?window.CAREER24_CANONICAL_DB?.clubs?.find(x=>x.id===id):null;
 return {c,name,id,rec};
}
function simplified(s){return norm(String(s||'').replace(/\b(football club|football|club|fc|cf|afc|sc|ac|as|fk|sk|sv)\b/gi,'').replace(/\b(1900|1901|1902|1903|1904|1905|1906|1907|1908|1909|1910|1911|1912|1913|1914|1915|1916|1917|1918|1919|1920|1921|1922|1923|1924|1925|1926|1927|1928|1929|1930|1931|1932|1933|1934|1935|1936|1937|1938|1939|1940|1941|1942|1943|1944|1945|1946|1947|1948|1949|1950|1951|1952|1953|1954|1955|1956|1957|1958|1959|1960|1961|1962|1963|1964|1965|1966|1967|1968|1969|1970|1971|1972|1973|1974|1975|1976|1977|1978|1979|1980|1981|1982|1983|1984|1985|1986|1987|1988|1989|1990|1991|1992|1993|1994|1995|1996|1997|1998|1999|2000|2001|2002|2003|2004|2005|2006|2007|2008|2009|2010|2011|2012|2013|2014|2015|2016|2017|2018|2019|2020|2021|2022|2023|2024)\b/g,''))}
function lookup(v){
 const {c,name,rec}=canonical(v);
 const country=COUNTRY[rec?.country||c?.country||'']||'';
 const candidates=[rec?.native,rec?.display,c?.nativeName,c?.name,c?.display,name].filter(Boolean);
 for(const n of candidates){
   const n1=norm(n),n2=simplified(n);
   if(country){
     const ex=COUNTRY_EXACT.get(country),si=COUNTRY_SIMPLE.get(country);
     const u=(ex&&ex.get(n1))||(si&&n2&&si.get(n2));if(u)return safe(u);
   }
   const u=UNIQUE.get(n1)||UNIQUE.get(n2);if(u)return safe(u);
 }
 return'';
}
function crest(v,size=48){
 const {c,name,rec}=canonical(v),label=rec?.display||c?.name||c?.display||name||'CLUB',u=lookup(v),ini=initials(label);
 return '<div class="c49-crest" title="'+esc(label)+'" style="width:'+size+'px;height:'+size+'px">'+(u?'<img src="'+esc(u)+'" alt="'+esc(label)+' crest" loading="eager" decoding="async"><span style="display:none">'+esc(ini)+'</span>':'<span>'+esc(ini)+'</span>')+'</div>';
}
function arm(img){if(!img||img.dataset.c49==='1')return;img.dataset.c49='1';img.onerror=()=>{const s=img.nextElementSibling;if(s){img.style.display='none';s.style.display='grid'}}}
function fix(root=document){
 root.querySelectorAll?.('.c45-real-crest,.c48-crest,.c24-final-crest[title],.v41-game-crest[title],.c24-logo').forEach(el=>{
   if(el.classList.contains('c49-crest'))return;
   const name=el.dataset?.c45Name||el.getAttribute('title')||el.querySelector('img')?.alt?.replace(/\s+crest$/i,'')||el.textContent.trim()||'CLUB';
   const size=parseInt(el.style.width)||48;
   el.outerHTML=crest(name,size);
 });
 root.querySelectorAll?.('.c49-crest img').forEach(arm);
}
async function load(){
 try{
   const r=await fetch('data/logos.json?v=49',{cache:'force-cache'});if(!r.ok)throw new Error('HTTP '+r.status);
   const j=await r.json();
   const simpleCandidates=new Map();
   for(const [k,u] of Object.entries(j||{})){
     if(!safe(u))continue;
     if(k.startsWith('*|')){UNIQUE.set(k.slice(2),u);continue}
     INDEX.set(k,u);
     const cut=k.indexOf('|');if(cut<1)continue;const country=k.slice(0,cut),stem=k.slice(cut+1),n=norm(stem),sp=simplified(stem);
     if(!COUNTRY_EXACT.has(country))COUNTRY_EXACT.set(country,new Map());COUNTRY_EXACT.get(country).set(n,u);
     const ck=country+'|'+sp;if(sp){if(!simpleCandidates.has(ck))simpleCandidates.set(ck,[]);simpleCandidates.get(ck).push(u)}
   }
   for(const [ck,urls] of simpleCandidates){if(urls.length!==1)continue;const cut=ck.indexOf('|'),country=ck.slice(0,cut),sp=ck.slice(cut+1);if(!COUNTRY_SIMPLE.has(country))COUNTRY_SIMPLE.set(country,new Map());COUNTRY_SIMPLE.get(country).set(sp,urls[0])}
   window.CAREER24_LOGO_V49.ready=true;window.CAREER24_LOGO_V49.count=INDEX.size+UNIQUE.size;fix(document);
   try{window.renderGame?.()}catch(_){}
 }catch(e){window.CAREER24_LOGO_V49.error=String(e?.message||e);fix(document)}
}
const style=document.createElement('style');
style.textContent='.c49-crest{display:grid;place-items:center;flex:0 0 auto;border-radius:12px;overflow:hidden;background:#f4f6f8;border:1px solid #48515c}.c49-crest img{width:100%;height:100%;object-fit:contain;display:block;background:#f4f6f8}.c49-crest span{width:100%;height:100%;display:grid;place-items:center;color:#252a31;font-weight:950;font-size:11px;text-align:center;padding:3px}';
document.head.appendChild(style);
window.CAREER24_LOGO_V49={version:VERSION,ready:false,count:0,error:null,url:lookup,html:crest,refresh:()=>fix(document)};
window.CAREER24_REAL_LOGO={url:lookup,html:crest,hydrate:fix,wiki:async()=>''};
window.ClubLogo=crest;
const mo=new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)fix(n)});mo.observe(document.documentElement,{childList:true,subtree:true});
function boot(){fix(document);load();const brand=document.querySelector('.brand');if(brand)brand.innerHTML='CAREER<b>24</b> <span>V4.9 EXACT CLUB CRESTS</span>'}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
console.log('CAREER24 V4.9 deterministic crest patch loaded');
})();