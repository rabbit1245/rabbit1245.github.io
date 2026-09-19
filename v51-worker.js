(function(){
'use strict';
const VERSION='V5.1 NONBLOCKING DB';
const DB_URL='data/male_players.csv';
const LIVE=window.CAREER24_LIVE_DB;
function makeWorker(){
 const lines = [
 "self.onmessage=async()=>{try{",
 "const r=await fetch('data/male_players.csv',{cache:'force-cache'}); if(!r.ok) throw new Error('HTTP '+r.status);",
 "const text=await r.text();",
 "const rows=[]; let row=[],cell='',q=false;",
 "for(let i=0;i<text.length;i++){const ch=text[i],n=text[i+1];if(q){if(ch==='\\\"'&&n==='\\\"'){cell+='\\\"';i++}else if(ch==='\\\"')q=false;else cell+=ch}else if(ch==='\\\"')q=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\\n'){row.push(cell.replace(/\\r$/,''));rows.push(row);row=[];cell=''}else cell+=ch}",
 "if(cell.length||row.length){row.push(cell.replace(/\\r$/,''));rows.push(row)}",
 "if(rows.length<5000) throw new Error('CSV rows '+rows.length);",
 "const header=rows[0].map((h,i)=>String(h||('col_'+i)).trim()); const idx={}; header.forEach((h,i)=>idx[h.toLowerCase()]=i);",
 "const gi=(names)=>{for(const n of names){const k=idx[n.toLowerCase()];if(k!=null)return k}return -1};",
 "const ix={name:gi(['Name','name']),club:gi(['Team','team']),league:gi(['League','league']),nation:gi(['Nation','nation']),pos:gi(['Position','position']),age:gi(['Age','age']),ovr:gi(['OVR','overall']),pac:gi(['PAC']),sho:gi(['SHO']),pas:gi(['PAS']),dri:gi(['DRI']),def:gi(['DEF']),phy:gi(['PHY']),foot:gi(['Preferred foot']),weak:gi(['Weak foot']),skill:gi(['Skill moves']),height:gi(['Height']),weight:gi(['Weight']),alt:gi(['Alternative positions']),url:gi(['url'])};",
 "const get=(r,i)=>i>=0?(r[i]??''):''; const posNorm=v=>{v=String(v||'').toUpperCase().trim();const m={CAM:'AM',CDM:'DM',CF:'ST',LS:'ST',RS:'ST',LF:'LW',RF:'RW',LCM:'CM',RCM:'CM',LDM:'DM',RDM:'DM'};return m[v]||v||'CM'};",
 "const out=[];",
 "for(let i=1;i<rows.length;i++){const rr=rows[i],name=String(get(rr,ix.name)).trim();if(!name)continue;const club=String(get(rr,ix.club)).trim()||'Free Agent';const league=String(get(rr,ix.league)).trim();const primary=posNorm(get(rr,ix.pos));const positions=[primary];String(get(rr,ix.alt)).split(/[,/;]/).map(posNorm).filter(Boolean).forEach(p=>{if(!positions.includes(p))positions.push(p)});const u=String(get(rr,ix.url));const m=u.match(/(\\d+)(?!.*\\d)/);const id='fc25_'+(m?m[1]:i);out.push({id,name,clubNative:club,club,league,nation:String(get(rr,ix.nation)).trim(),pos:primary,positions,age:+get(rr,ix.age)||0,ovr:+get(rr,ix.ovr)||50,potential:+get(rr,ix.ovr)||50,preferredFoot:String(get(rr,ix.foot)).trim(),weakFoot:+get(rr,ix.weak)||0,skillMoves:+get(rr,ix.skill)||0,heightCm:String(get(rr,ix.height)).trim(),weightKg:String(get(rr,ix.weight)).trim(),ratings:{pace:+get(rr,ix.pac)||0,shooting:+get(rr,ix.sho)||0,passing:+get(rr,ix.pas)||0,dribbling:+get(rr,ix.dri)||0,defending:+get(rr,ix.def)||0,physical:+get(rr,ix.phy)||0},realData:true,source:'EA SPORTS FC 25 male_players.csv'});}",
 "postMessage({ok:true,players:out});",
 "}catch(e){postMessage({ok:false,error:String(e&&e.message||e)})}}"
 ];
 return new Worker(URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/javascript'})));
}
function nextFrame(){return new Promise(r=>requestAnimationFrame(()=>r()))}
async function canonicalize(players){
 const out=[];for(let i=0;i<players.length;i++){const p=players[i];try{const cid=window.CAREER24_RESOLVE_CLUB?.(p.clubNative,p.league)||null;p.canonicalClubId=cid;p.clubId=cid;if(cid){const rec=window.CAREER24_CANONICAL_DB?.clubs?.find(c=>c.id===cid);if(rec)p.club=rec.display||p.clubNative}}catch(_){}out.push(p);if(i%250===0)await nextFrame()}return out
}
function markReady(players){
 if(!LIVE)return;LIVE.players=players;LIVE.rows=players.length;LIVE.source='worker://fc25-csv';LIVE.state='ready';LIVE.error=null;LIVE.finishedAt=Date.now();
 try{window.CAREER24_REBUILD_LIVE_INDEXES?.()}catch(e){console.error(e)}
 try{window.dispatchEvent(new CustomEvent('career24-live-db-ready',{detail:{players:players.length,worker:true}}))}catch(_){}
 try{window.dispatchEvent(new CustomEvent('career24-db-state'))}catch(_){}
 try{if(window.game)window.renderGame?.()}catch(_){}
}
window.CAREER24_FAST_DB_BOOT=async function(){
 if(!LIVE)return;
 try{if(await window.CAREER24_TRY_DB_CACHE?.())return}catch(_){}
 LIVE.state='loading';LIVE.startedAt=Date.now();
 const w=makeWorker();
 w.onmessage=async e=>{const d=e.data||{};if(!d.ok){LIVE.state='error';LIVE.error=d.error||'worker error';w.terminate();return}const players=await canonicalize(d.players||[]);markReady(players);w.terminate()};
 w.postMessage({start:true});
};
window.CAREER24_NONBLOCKING_DB=VERSION;
console.log('CAREER24 V5.1 nonblocking DB worker loaded');
})();