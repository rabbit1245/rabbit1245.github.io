import {currencyText} from './game/currency';
import {careerMatchLedger} from './game/career-text';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, ArrowRight, ArrowUpRight, CheckCircle2, Download, FolderOpen, LayoutDashboard, Loader2, Menu, Plus, RotateCcw, Save, Settings2, Shield, SkipForward, Trash2, Trophy, Upload, UserRound, X } from 'lucide-react';
import type { Career, CreateOptions, GameCommand, MatchRecord, SaveSlot } from './game/types';
import type { PresentationEvent } from './game/revision-types';
import { CLUBS, DATA_PROVENANCE } from './game/data';
import { createCareer, ENGINE_VERSION } from './game/engine';
import { runGameCommand } from './game/client';
import { deleteSlot, exportCareer, importCareer, listSlots, loadCareer, restoreBackup, saveCareer } from './game/storage';
import { sumStats } from './game/math';
import { careerTextChunks,careerTextFilename } from './game/career-text';
import Creation from './components/Creation';
import LockerRoom, { phaseLabel } from './components/LockerRoom';
import PlayerPanel, { type PlayerView } from './components/PlayerPanel';
import SeasonCompetitions from './components/SeasonCompetitions';
import CareerPanel, { type CareerView } from './components/CareerPanel';
import PlayerStrip from './components/PlayerStrip';
import StatsNine from './components/StatsNine';
import CheatSettings from './components/CheatSettings';
import { average, calendarLabel, Brand, clubTotal, compactMoney, Delta, money, Modal, nationalTotal, seasonLabel, shortDate, TeamBadge, teamName, visibleAwards } from './components/Shared';

type Page = 'locker'|'player'|'career';
const NAVIGATION = [{id:'locker',label:'라커룸',icon:LayoutDashboard},{id:'player',label:'선수',icon:UserRound},{id:'career',label:'커리어',icon:Trophy}] as const;
const errorMessage = (error:unknown) => error instanceof Error ? error.message : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

function Landing({slots,loading,busy,onNew,onLoad,onImport}:{slots:SaveSlot[];loading:boolean;busy:boolean;onNew:()=>void;onLoad:(id:string)=>void;onImport:()=>void}) {
  return <div className="landing"><header className="landing-header"><Brand/><button className="button secondary" onClick={onImport} disabled={busy}><Upload size={16}/>저장 가져오기</button></header><main><section className="landing-hero"><div><span className="eyebrow">선수 커리어 시뮬레이션</span><h1>한 선수의 인생.<br/><em>당신의 다음 시즌.</em></h1><p>이름 없는 유소년의 첫 훈련부터<br/>마지막 휘슬까지, 경기는 당신의 기록이 됩니다.</p><div className="hero-actions"><button className="button primary" data-testid="new-career" disabled={busy} onClick={onNew}>새 커리어 시작<ArrowUpRight size={18}/></button>{slots[0]&&<button className="button secondary" disabled={busy} onClick={()=>onLoad(slots[0].id)}>이어서 플레이<ArrowRight size={17}/></button>}</div><span className="landing-assurance"><Shield size={14}/>가입 없이 시작 · 이 브라우저에 자동 저장</span></div><div className="landing-pitch" aria-hidden="true"><div className="pitch-outline"><span className="pitch-center"/><span className="pitch-box top"/><span className="pitch-box bottom"/></div><span className="pitch-caption">A FOOTBALL LIFE</span><div className="jersey"><span>YOUR NAME</span><strong>10</strong><small>THE FIRST CHAPTER</small></div><div className="pitch-ticket"><span>FIRST SEASON</span><strong>모든 기록은<br/>첫 경기에서 시작된다.</strong></div></div></section><div className="landing-facts"><span><b>16</b> 포지션</span><span><b>{CLUBS.length}</b> 구단</span><span><b>하나</b>의 축구 인생</span></div><section className="landing-continue"><div className="section-title"><div><span className="eyebrow">CONTINUE</span><h2>진행 중인 커리어</h2></div></div>{loading?<p className="muted">저장된 커리어를 확인하고 있습니다…</p>:slots.length?<div className="slot-grid">{slots.map(s=><button className="slot" disabled={busy} key={s.id} onClick={()=>onLoad(s.id)}><span className="slot-ovr">{s.ovr}<small>OVR</small></span><span className="slot-copy"><strong>{s.playerName}</strong><span>{s.clubName} · {s.age}세</span><small>{seasonLabel(s.year)} · {shortDate(s.updatedAt)}</small></span><ArrowUpRight size={18}/></button>)}</div>:<div className="landing-empty">아직 쓰이지 않은 첫 페이지.<span>새 커리어를 시작해 당신의 이름을 남겨보세요.</span></div>}</section></main><footer className="site-footer"><Brand/><p>{DATA_PROVENANCE}</p></footer></div>;
}
function MatchDialog({match,career,onClose}:{match:MatchRecord;career:Career;onClose:()=>void}) {
  const labels:Record<string,string>={goal:'골',assist:'도움',shot:'슈팅',save:'선방',yellow:'경고',red:'퇴장',injury:'부상',substitution:'교체',pass:'패스',keyPass:'키패스',dribble:'돌파',tackle:'태클',interception:'차단',aerial:'공중볼',handling:'공 처리',sweep:'스위핑',longKick:'롱킥'};
  const keyEvents=match.events.filter(e=>['goal','yellow','red','injury','substitution','save'].includes(e.type)),mom=match.performers?.find(p=>p.id===match.momPlayerId);
  return <Modal title={`${seasonLabel(match.seasonYear)} · ${match.scope==='national'?'국가대표 경기':`${match.round}라운드`}`} onClose={onClose} wide><div className="scoreboard"><div><TeamBadge id={match.homeId}/><strong>{teamName(match.homeId,match.homeName)}</strong><span>HOME</span></div><div className="scoreboard-score"><strong>{match.homeGoals}<small>–</small>{match.awayGoals}</strong><span>{match.shootout?`승부차기 ${match.shootout.home}–${match.shootout.away}`:'경기 종료'}</span></div><div><TeamBadge id={match.awayId}/><strong>{teamName(match.awayId,match.awayName)}</strong><span>AWAY</span></div></div>{match.date&&<p className="match-date">{new Date(match.date).toLocaleDateString('ko-KR',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'})} · {match.competitionId}</p>}{match.shootout&&<div className="notice"><Trophy size={17}/><p>{teamName(match.shootout.winnerId)} 승부차기 승리 · 승부차기 득점은 선수의 본경기 득점에 포함되지 않습니다.</p></div>}{mom&&<div className="notice"><Trophy size={18}/><div><strong>경기 MOM · {mom.name}</strong><p>{teamName(mom.teamId??mom.clubId)} · 평점 {mom.rating.toFixed(1)} · 게임 내 경기 평가</p></div></div>}<div className="detail-heading"><h3>{career.player.name}</h3><span>{match.playerPlayed?`${match.playerStarted?'선발':'교체'} · ${match.playerMinutes}분 · 평점 ${match.playerRating.toFixed(1)}`:'출전하지 않았습니다'}</span></div><StatsNine stats={match.playerStats} position={career.player.position} compact/>{match.performers&&<details className="lineups"><summary>양 팀 선수 평점</summary><div className="lineup-grid">{[match.homeId,match.awayId].map(id=><div key={id}><h3>{teamName(id,id===match.homeId?match.homeName:match.awayName)}</h3>{match.performers?.filter(p=>(p.teamId??p.clubId)===id).sort((a,b)=>b.rating-a.rating).map(p=><div className={p.id===match.momPlayerId?'own-player':''} key={p.id}><span>{p.position}</span><strong>{p.name}{p.captain?' Ⓒ':''}</strong><span>{p.minutes}′</span><b>{p.rating.toFixed(1)}</b></div>)}</div>)}</div></details>}<h3 className="form-section">골 · 교체 · 주요 선방</h3><div className="match-timeline">{keyEvents.length?keyEvents.map(e=><div key={e.id}><span>{e.minute}′</span><i className={e.type}/><div><strong>{labels[e.type]} · {e.playerName}</strong><p>{e.detail}</p><small>{teamName(e.teamId)}</small></div></div>):<p className="muted">기록된 주요 이벤트가 없습니다.</p>}</div><div className="modal-actions"><button className="button primary" onClick={onClose}>확인<ArrowRight size={16}/></button></div></Modal>;
}
function Presentation({matches,events,onClose,reduced}:{matches:MatchRecord[];events:PresentationEvent[];onClose:()=>void;reduced:boolean}) {
  const items=[...matches.map(m=>({id:m.id,title:`${teamName(m.homeId,m.homeName)} ${m.homeGoals} – ${m.awayGoals} ${teamName(m.awayId,m.awayName)}`,body:`R${m.round} · ${m.playerPlayed?`${m.playerMinutes}분 출전 · 평점 ${m.playerRating.toFixed(1)}${m.playerStats.mom?' · MOM':''}${m.events.some(e=>e.type==='injury')?' · 부상 발생':''}`:'미출전'}`,important:false})),...events.filter(e=>e.importance==='milestone').slice(-2).map(e=>({...e,important:true}))];
  const [index,setIndex]=useState(0);
  useEffect(()=>{if(reduced||!items.length){onClose();return;}const timer=window.setTimeout(()=>{if(index>=items.length-1)onClose();else setIndex(i=>i+1);},items[index]?.important?850:200);return()=>clearTimeout(timer);},[index,reduced]);
  return <div className="presentation" role="status" aria-live="polite"><span className="eyebrow">시즌의 장면 · 결과 계산 완료</span><div className="presentation-rail">{items.map((r,i)=><i key={r.id} className={i<=index?'done':''}/>)}</div><strong>{items[index]?.title}</strong><p>{currencyText(items[index]?.body??'')}</p><button className="button secondary small" onClick={onClose}><SkipForward size={15}/>연출 건너뛰기</button></div>;
}
export default function App() {
  const [career, setCareer] = useState<Career | null>(null);
  const [page, setPage] = useState<Page>('locker');
  const [playerView,setPlayerView]=useState<PlayerView>('attributes');
  const [playerViewRequest,setPlayerViewRequest]=useState(0);
  const [careerView,setCareerView]=useState<CareerView>('records');
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creation, setCreation] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchRecord | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved'|'saving'|'error'>('saved');
  const [common, setCommon] = useState(false);
  const [presentation, setPresentation] = useState<{matches:MatchRecord[];events:PresentationEvent[]}|null>(null);
  const [reduced, setReduced] = useState(() => { try { return localStorage.getItem('kball-reduced-motion') === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } });
  const careerRef = useRef<Career | null>(null);
  const locked = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { listSlots().then(setSlots).catch(e => setError(errorMessage(e))).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3500); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    function protectProgress(event: BeforeUnloadEvent) {
      if (careerRef.current && (saveStatus !== 'saved' || busy)) { event.preventDefault(); event.returnValue = ''; }
    }
    window.addEventListener('beforeunload', protectProgress);
    return () => window.removeEventListener('beforeunload', protectProgress);
  }, [saveStatus, busy]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', close); };
  }, [mobileOpen]);
  function confirmReplace(action: string) {
    return !careerRef.current || saveStatus !== 'error' || window.confirm(`저장되지 않은 진행이 있습니다. 파일로 내보내지 않고 ${action}?`);
  }
  function requestNewCareer() {
    if (locked.current || !confirmReplace('새 커리어를 시작할까요')) return;
    setMobileOpen(false); setCommon(false); setCreation(true);
  }
  function mainMenu() {
    if (locked.current || !confirmReplace('메인 메뉴로 돌아갈까요')) return;
    careerRef.current = null; setCareer(null); setCommon(false); setSelectedMatch(null); setMobileOpen(false); setError('');
  }
  const closeCreation = () => { if (!locked.current) setCreation(false); };
  const closeMatch = () => setSelectedMatch(null);
  function navigate(next: Page) { if(next==='player')setPlayerView('attributes');if(next==='career')setCareerView('records');setPage(next); setMobileOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function openPlayer(view:PlayerView){navigate('player');setPlayerView(view);setPlayerViewRequest(value=>value+1);}
  function openTraining(){openPlayer('training');}
  function openCareer(view:CareerView){navigate('career');setCareerView(view);}
  async function refresh() { setSlots(await listSlots()); }
  function display(next: Career) { careerRef.current = next; setCareer(next); }
  async function commit(next: Career): Promise<boolean> {
    display(next); setSaveStatus('saving');
    try { await saveCareer(next); }
    catch (e) { setSaveStatus('error'); setError(`자동 저장에 실패했습니다. 현재 진행은 화면에 유지됩니다. 파일로 내보내기를 권장합니다. ${errorMessage(e)}`); return false; }
    setSaveStatus('saved');
    try { await refresh(); }
    catch (e) { setError(`현재 진행은 저장되었지만 저장 슬롯 목록을 갱신하지 못했습니다. ${errorMessage(e)}`); }
    return true;
  }
  async function command(value: GameCommand) {
    if (locked.current || !careerRef.current) return;
    locked.current = true; setBusy(true); setError('');
    try { const previous = careerRef.current; const next = await runGameCommand(previous, value); const saved=await commit(next);if(value.type==='training'&&saved)navigate('locker');
      if (['advanceHalf','continueHalf','transfer','nextSeason','retire'].includes(value.type) && !reduced) { const matchIds = new Set([...careerMatchLedger(previous).club,...careerMatchLedger(previous).national].map(m => m.id)), eventIds = new Set(previous.systems?.events.map(e => e.id) || []); const matches = [...careerMatchLedger(next).club,...careerMatchLedger(next).national].filter(m => !matchIds.has(m.id)), events = next.systems?.events.filter(e => !eventIds.has(e.id)) || []; if (matches.length || events.some(e => e.importance === 'milestone')) setPresentation({ matches, events }); } if (value.type === 'nextSeason' || value.type === 'retire') navigate(value.type === 'retire' ? 'career' : 'locker'); if (value.type === 'training') setToast('새로운 훈련 계획을 적용했습니다.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function newCareer(options: CreateOptions) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { const next = createCareer(options); await commit(next); setCreation(false); navigate('locker'); setToast('당신의 커리어가 시작되었습니다.'); }
    catch (e) { setError(errorMessage(e)); throw e; }
    finally { locked.current = false; setBusy(false); }
  }
  async function load(id: string) {
    if (locked.current) return;
    if (!confirmReplace('다른 저장을 불러올까요')) return;
    locked.current = true; setBusy(true); setError('');
    try { const next = await loadCareer(id); display(next); setSelectedMatch(null); setSaveStatus('saved'); setCommon(false); navigate('locker'); setToast('커리어를 불러왔습니다.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function saveNow() {
    if (locked.current || !careerRef.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await commit(careerRef.current); }
    finally { locked.current = false; setBusy(false); }
  }
  async function exportFile() {
    const exporting = careerRef.current;
    if (!exporting) return;
    try { const text = await exportCareer(exporting); const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `K볼_${exporting.player.name}_${exporting.season.year}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('커리어를 JSON 파일로 내보냈습니다.'); }
    catch (e) { setError(errorMessage(e)); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || locked.current || !confirmReplace('가져온 커리어를 열까요')) return;
    locked.current = true; setBusy(true); setError('');
    try { if (file.size > 256 * 1024 * 1024) throw new Error('256MB 이하의 K볼 저장 파일을 선택해 주세요.'); const next = await importCareer(await file.text()); const saved = await commit(next); setSelectedMatch(null); setCommon(false); navigate('locker'); if (saved) setToast('별도 슬롯으로 커리어를 가져왔습니다.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function remove(id: string) {
    if (locked.current || !window.confirm('이 커리어의 저장 파일과 백업을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.')) return;
    locked.current = true; setBusy(true); setError('');
    try { await deleteSlot(id); if (careerRef.current?.id === id) { careerRef.current = null; setCareer(null); } await refresh(); setToast('커리어를 삭제했습니다.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function restore(id: string) {
    if (locked.current || !window.confirm('직전 정상 저장본으로 복원할까요? 현재 저장본은 복원용 백업으로 남습니다.')) return;
    locked.current = true; setBusy(true); setError('');
    try { const next = await restoreBackup(id); display(next); setSaveStatus('saved'); await refresh(); setCommon(false); navigate('locker'); setToast('이전 저장본을 복원했습니다.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { locked.current = false; setBusy(false); }
  }
  function copyCareer() {
    const career=careerRef.current;if(!career)return;
    try {
      const blob=new Blob([...careerTextChunks(career)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=careerTextFilename(career);document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
      setToast('전체 커리어 상세 기록을 TXT 한 파일로 다운로드했습니다.');
    } catch(error) {setError(errorMessage(error));}
  }
  function changeReduced(value:boolean){setReduced(value);try{localStorage.setItem('kball-reduced-motion',String(value));}catch{/* Active for this session. */}}
  const strip=useMemo(()=>career?<PlayerStrip career={career}/>:null,[career]);
  const competitions=useMemo(()=>career?<SeasonCompetitions career={career} onMatch={setSelectedMatch}/>:null,[career]);
  return <div className={reduced?'reduce-motion':''}>
    <input ref={fileRef} type="file" hidden accept=".json,application/json" aria-label="K볼 저장 파일 가져오기" onChange={importFile}/>
    {!career?<Landing slots={slots} loading={loading} busy={busy} onNew={requestNewCareer} onLoad={load} onImport={()=>fileRef.current?.click()}/>:<div className="app-shell">
      <header className="app-header"><div className="header-inner"><Brand/><nav className="main-nav" aria-label="주요 화면">{NAVIGATION.map(n=><button key={n.id} data-testid={`${n.id}-tab`} aria-current={page===n.id?'page':undefined} className={page===n.id?'active':''} onClick={()=>navigate(n.id)}><n.icon size={17}/><span>{n.label}{n.id==='player'&&career.systems?.leadership.offers?.some(o=>o.status==='pending')&&<small className="nav-captain-offer">주장 제의</small>}</span></button>)}</nav><div className="header-tools"><span className={`save-status ${saveStatus}`} data-testid="save-status" aria-live="polite">{saveStatus==='saving'?<Loader2 size={13} className="spinner"/>:saveStatus==='error'?<AlertCircle size={13}/>:<CheckCircle2 size={13}/>}<span>{saveStatus==='saved'?'자동 저장됨':saveStatus==='saving'?'저장 중':'저장 실패'}</span></span><button className="icon-button" data-testid="common-menu" aria-label="저장 및 설정 메뉴" onClick={()=>setCommon(true)}><Menu size={21}/></button></div>{toast&&<div className="toast" role="status"><CheckCircle2 size={17}/>{toast}</div>}</div></header>
      <main className="game-main">{strip}{competitions}<div className="page-title"><h1>{page==='locker'?'라커룸':page==='player'?'선수':'커리어'}</h1><span className="page-context">{calendarLabel(career)} · {phaseLabel(career)} · {career.season.competitionName}</span></div>
        {error&&<div className="error-banner" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="icon-button" aria-label="오류 알림 닫기" onClick={()=>setError('')}><X size={16}/></button></div>}
        {busy&&<div className="processing" role="status"><Loader2 className="spinner" size={17}/>경기와 성장 기록을 계산하고 있습니다.</div>}
        {page==='locker'&&<LockerRoom career={career} busy={busy} command={command} onMatch={setSelectedMatch} presenting={Boolean(presentation)} onTraining={openTraining} onCareer={openCareer}/>}{page==='player'&&<PlayerPanel career={career} busy={busy} command={command} requestedView={playerView} viewRequest={playerViewRequest}/>} {page==='career'&&<CareerPanel career={career} busy={busy} command={command} onExport={exportFile} onCopy={copyCareer} onMatch={setSelectedMatch} requestedView={careerView}/>}
        <footer className="game-footer"><span data-testid="game-version">K볼 {ENGINE_VERSION} · A FOOTBALL LIFE</span><span>이 브라우저에 자동 저장</span></footer>
      </main></div>}
    {!career&&error&&<div className="landing-error error-banner" role="alert"><AlertCircle size={17}/>{error}<button className="icon-button" aria-label="오류 알림 닫기" onClick={()=>setError('')}><X size={15}/></button></div>}
    {creation&&<Creation busy={busy} onCreate={newCareer} onClose={closeCreation}/>}
    {selectedMatch&&career&&<MatchDialog match={selectedMatch} career={career} onClose={closeMatch}/>}
    {common&&<Modal title="커리어 보관함과 설정" onClose={()=>setCommon(false)} wide><p className="muted">이 브라우저에 자동 저장됩니다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 JSON으로 보관하세요.</p><div className="common-actions">{career&&<><button className="button primary" disabled={busy} onClick={saveNow}><Save size={16}/>지금 저장</button><button className="button secondary" disabled={busy} onClick={exportFile}><Download size={16}/>JSON 내보내기</button></>}<button className="button secondary" disabled={busy} onClick={()=>fileRef.current?.click()}><Upload size={16}/>파일 가져오기</button><button className="button secondary" disabled={busy} onClick={requestNewCareer}><Plus size={16}/>새 커리어</button></div><h3 className="form-section">저장된 커리어</h3><div className="save-list">{slots.map(s=><div className="save-item" key={s.id}><div className="save-item-info"><span className="slot-ovr">{s.ovr}<small>OVR</small></span><div><strong>{s.playerName}{s.id===career?.id&&<span className="pill">현재</span>}</strong><span>{s.clubName} · {seasonLabel(s.year)} · {shortDate(s.updatedAt)}</span></div></div><div className="save-item-actions"><button className="button secondary small" disabled={busy} onClick={()=>load(s.id)}><FolderOpen size={14}/>불러오기</button><button className="text-button" disabled={busy} onClick={()=>restore(s.id)}><RotateCcw size={14}/>이전 저장 복원</button><button className="icon-button danger-text" aria-label={`${s.playerName} 커리어 삭제`} disabled={busy} onClick={()=>remove(s.id)}><Trash2 size={16}/></button></div></div>)}</div>{career&&<CheatSettings career={career} busy={busy} command={command} onEdit={()=>{setCommon(false);openPlayer('attributes');}}/>}<h3 className="form-section"><Settings2 size={17}/>화면 설정</h3><label className="setting-row"><span><strong>연출 줄이기</strong><small>경기 결과와 성장 수치는 동일하며, 결과 장면을 바로 넘깁니다.</small></span><input type="checkbox" checked={reduced} onChange={e=>changeReduced(e.target.checked)}/></label><p className="fine-print">자동 저장은 이전 정상 저장본을 백업합니다. 가져온 파일은 새 슬롯에 보관합니다.</p><details className="data-provenance"><summary>데이터와 규정 안내</summary><p className="muted">{DATA_PROVENANCE}</p></details>{career&&<div className="modal-actions"><button className="button secondary" disabled={busy} onClick={mainMenu}>시작 화면으로</button></div>}</Modal>}
    {presentation&&<Presentation {...presentation} reduced={reduced} onClose={()=>setPresentation(null)}/>}{!career&&toast&&<div className="toast" role="status"><CheckCircle2 size={17}/>{toast}</div>}
  </div>;
}
