import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Check,Search} from 'lucide-react';
import {currencyText} from '../game/currency';
import {getClub,getLeague} from '../game/data';
import {expiryReturnClub} from '../game/employment';
import type {Career,GameCommand,TransferOffer} from '../game/types';
import {Delta,Empty,Modal,money,Money,TeamBadge,teamName} from './Shared';

type Props = {
  career:Career;
  busy:boolean;
  command:(command:GameCommand,onError?:(message:string)=>void)=>void;
  onClose:()=>void;
};

function leagueFor(career:Career,clubId:string) {
  const world=career.systems?.world;
  return getLeague(world?.pendingMovements?.find(m=>m.clubId===clubId)?.toLeagueId??world?.clubs[clubId]?.leagueId??getClub(clubId).leagueId);
}

const normalizeName=(name:string)=>name.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const SEARCH_RESULT_LIMIT=12;

function ClubSearch({career,busy,onRequest}:{career:Career;busy:boolean;onRequest:(clubId:string)=>void}) {
  const [query,setQuery]=useState('');
  const world=career.systems?.world,currentClub=career.player.clubId;
  const clubs=useMemo(()=>Object.keys(world?.clubs??{}).filter(id=>id!==currentClub).map(id=>{
    const club=getClub(id);
    return {club,names:[normalizeName(club.name),normalizeName(club.nativeName)]};
  }).sort((a,b)=>a.club.name.localeCompare(b.club.name,'ko')),[world,currentClub]);

  const term=normalizeName(query);
  const matching=term?clubs.filter(({names})=>names.some(name=>name.includes(term))):[];
  const exact=matching.filter(({names})=>names.includes(term));
  const ordered=exact.length?[...exact,...matching.filter(row=>!exact.includes(row))]:matching;

  return <div className="counter-club-search" id="counter-club-search">
    <label htmlFor="counter-club-query">구단명 검색</label>
    <input id="counter-club-query" type="search" autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="한글 또는 현지 구단명" autoComplete="off"/>
    {term&&<p className="muted" role="status">{matching.length===0?'검색 결과가 없습니다.':`${matching.length}개 구단${matching.length>SEARCH_RESULT_LIMIT?` · 최대 ${SEARCH_RESULT_LIMIT}개 표시`:''}`}</p>}
    {ordered.length>0&&<ul className="counter-club-results">
      {ordered.slice(0,SEARCH_RESULT_LIMIT).map(({club})=><li key={club.id}>
        <TeamBadge id={club.id} small/>
        <div><strong>{club.name}</strong><small>{leagueFor(career,club.id).name} · {club.country}</small></div>
        <button className="button secondary" disabled={busy} onClick={()=>onRequest(club.id)}>역제안 보내기</button>
      </li>)}
    </ul>}
  </div>;
}

function OfferCard({career,offer,busy,onAccept}:{career:Career;offer:TransferOffer;busy:boolean;onAccept:()=>void}) {
  const p=career.player,counter=offer.source==='counter',club=getClub(offer.clubId);
  const title=offer.type==='renew'?'재계약':counter?'역제안 응답':offer.clubId===expiryReturnClub(career)?'전 소속팀 재계약':'이적 제안';
  return <section className={`offer${counter?' counter-offer-card':''}`} data-testid={counter?'counter-offer':undefined}>
    <div className="offer-title"><TeamBadge id={offer.clubId}/><span className="pill">{title}</span></div>
    <h3 tabIndex={counter?-1:undefined}>{club.name} <small className="offer-league">{leagueFor(career,club.id).name} · {club.country}</small></h3>
    <p className="muted">{currencyText(offer.reason)}</p>
    <dl className="detail-list">
      <div><dt>주급 변화</dt><dd><Money value={p.wage}/> → <Money value={offer.wage}/></dd></div>
      {counter&&<div><dt>제안 연봉</dt><dd><Money value={offer.wage*52}/></dd></div>}
      <div><dt>이전 대비</dt><dd>{p.wage>0?<><Delta value={Math.round((offer.wage-p.wage)/p.wage*100)}/> %</>:'FA · 신규 급여'}</dd></div>
      <div><dt>계약 / 역할</dt><dd>{offer.years}년 · {offer.role}</dd></div>
      <div><dt>구단 간 이적료</dt><dd>{offer.type==='renew'?'해당 없음':<Money value={offer.fee}/>}</dd></div>
      <div><dt>효력</dt><dd>{offer.effective==='now'?'즉시 합류':'다음 시즌'}</dd></div>
    </dl>
    <button className="button primary full" disabled={busy} onClick={onAccept}>제안 수락<ArrowRight size={17}/></button>
  </section>;
}

export default function Transfers({career,busy,command,onClose}:Props) {
  const [searchOpen,setSearchOpen]=useState(false);
  const [requestedClub,setRequestedClub]=useState<string>();
  const [error,setError]=useState('');
  const quoteRef=useRef<HTMLDivElement>(null),errorRef=useRef<HTMLParagraphElement>(null);
  const p=career.player,contract=career.systems?.economics.contract;
  const active=career.stage==='offseason'||career.stage==='season'&&p.clubId==='FA';
  const confirmed=career.transferDecision&&p.clubId!=='FA';
  const offers=active?career.offers:[];
  const counter=offers.find(offer=>offer.source==='counter');
  const ordinaryOffers=offers.filter(offer=>offer.source!=='counter');
  useEffect(()=>{
    if(!busy&&requestedClub&&counter?.clubId===requestedClub){
      setRequestedClub(undefined);
      setSearchOpen(false);
      quoteRef.current?.querySelector('h3')?.focus();
    }
  },[busy,counter?.clubId,requestedClub]);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);

  function requestOffer(clubId:string) {
    setError('');
    setRequestedClub(clubId);
    command({type:'counterOffer',clubId},message=>{
      setRequestedClub(undefined);
      setError(message);
    });
  }

  return <Modal title="계약과 다음 행선지" onClose={onClose} wide>
    {active&&!confirmed&&<div className="counter-offer-tools">
      <button className="button secondary" type="button" aria-expanded={searchOpen} aria-controls={searchOpen?'counter-club-search':undefined} disabled={busy} onClick={()=>{setSearchOpen(!searchOpen);setError('');}}><Search size={17}/>역제안</button>
      {error&&<p className="error-banner" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      {searchOpen&&<ClubSearch career={career} busy={busy} onRequest={requestOffer}/>}
    </div>}
    <div className="contract-current">
      <TeamBadge id={p.clubId}/>
      <div><span className="eyebrow">현재 계약</span><strong>{teamName(p.clubId)}</strong>
        <span>{money(p.wage)}/주 · {contract?.role||'역할 미집계'} · {contract?.signedDate||contract?.signedYear||'—'} → {contract?.expiresDate||contract?.expiresYear||'—'}</span>
      </div>
      <span className="pill">{p.contractYears}년 남음</span>
    </div>
    {confirmed?<div className="notice"><Check size={18}/>다음 시즌 행선지를 확정했습니다. {teamName(p.clubId)}에서 계속합니다.</div>:active?<>
      {counter&&<div ref={quoteRef} className="counter-offer-quote"><OfferCard career={career} offer={counter} busy={busy} onAccept={()=>{setError('');command({type:'transfer',offerId:counter.id},setError);}}/></div>}
      <div className="offer-grid">{ordinaryOffers.map(offer=><OfferCard key={offer.id} career={career} offer={offer} busy={busy} onAccept={()=>command({type:'transfer',offerId:offer.id})}/>)}</div>
      {!offers.length&&<Empty title="도착한 제안이 없습니다">{p.clubId==='FA'?'구단에 역제안을 보내거나 반 시즌을 진행할 수 있습니다.':'구단에 역제안을 보내거나 현재 구단에 잔류할 수 있습니다.'}</Empty>}
      {p.clubId!=='FA'&&<div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>command({type:'stay'})}>현재 구단에 잔류</button></div>}
    </>:<p className="muted">이적과 재계약은 시즌 종료 후 진행합니다.</p>}
    {p.clubId!=='FA'&&career.stage!=='retired'&&<div className="release-contract"><p>계약을 해지하면 즉시 FA가 됩니다. 클럽 출전·주급이 중단되고 반 시즌마다 새 제안을 확인할 수 있습니다.</p><button className="button danger" data-testid="release-contract" disabled={busy} onClick={()=>command({type:'releaseContract'})}>직접 계약 해지 · FA 전환</button></div>}
    {p.clubId==='FA'&&<p className="notice">FA · 무소속입니다. 제안을 수락하거나 창을 닫고 반 시즌씩 진행할 수 있습니다.</p>}
    <p className="fine-print">주급은 선수 수입이며, 이적료는 구단 간 거래입니다. 전체 계약 이력은 선수 → 계약·몸값에서 확인합니다.</p>
  </Modal>;
}
