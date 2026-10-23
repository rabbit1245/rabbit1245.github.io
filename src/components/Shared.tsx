import {money as formatMoney,compactMoney as compact,EUR_KRW} from '../game/currency';
import {cupStats} from '../game/club-competitions';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Flag, Shield, X } from 'lucide-react';
import type { Award, Career, Club, MatchRecord, PlayerStats } from '../game/types';
import { COUNTRY_FLAGS, getClub } from '../game/data';
import { emptyStats, sumStats } from '../game/math';
import { nationalMatchLedger } from '../game/season-overview';
import { getLeagueRule } from '../game/league-rules';

export const money=formatMoney;
export const compactMoney=compact;
export function Money({value}:{value:number}){return <span className="money-value" title={`표시 환율 1유로 = ${EUR_KRW.toLocaleString()}원`}><span className="money-full">{money(value)}</span><small>{compactMoney(value)}</small></span>;}
export const average = (s: PlayerStats) => s.ratingCount ? (s.ratingSum / s.ratingCount).toFixed(2) : '—';
export const seasonLabel = (y: number) => `${y}/${String(y + 1).slice(-2)}`;
export const shortDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export function teamName(id: string, supplied?: string) { if (supplied) return supplied; if (id.startsWith('NAT:')) { const [, country, squad] = id.split(':'); return `${country} ${squad === 'U20' ? 'U20' : '대표팀'}`; } try { return getClub(id).name; } catch { return id || '소속 없음'; } }
export function TeamBadge({ id, small = false }: { id: string; small?: boolean }) {
  let club: Club | undefined; try { club = getClub(id); } catch { /* National sides have their own identity. */ }
  const [failed, setFailed] = useState(false); useEffect(() => setFailed(false), [id]);
  return <span className={`team-badge ${small ? 'small' : ''}`} style={{ '--club-color': club?.color || '#39796d' } as React.CSSProperties} aria-hidden="true">{club?.crest && !failed ? <img src={club.crest} alt="" onError={() => setFailed(true)} /> : id.startsWith('NAT:') ? COUNTRY_FLAGS[id.split(':')[1]] || '🏳️' : <Shield size={small?18:25} strokeWidth={1.6}/>}</span>;
}
export function Brand() { return <div className="brand"><span className="brand-mark">K<span>·</span></span><span><strong>K볼</strong><small>A FOOTBALL LIFE</small></span></div>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><Flag size={22} /><strong>{title}</strong>{children && <p>{children}</p>}</div>; }
export function Panel({ title, eyebrow, action, children, className = '' }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><div className="panel-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>{children}</section>; }
export function Metric({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) { return <div className="metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>; }
export function Delta({ value }: { value: number }) { return <span className={`delta ${value > 0 ? 'positive' : value < 0 ? 'negative' : ''}`}>{value > 0 ? '+' : ''}{Math.round(value * 100) / 100}</span>; }
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => { const previous = document.activeElement as HTMLElement | null, old = document.body.style.overflow; document.body.style.overflow = 'hidden'; const items = () => [...ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]') || []]; const timer = window.setTimeout(() => items()[0]?.focus(), 0); const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); if (event.key === 'Tab') { const all = items(), first = all[0], last = all.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }; document.addEventListener('keydown', key); return () => { clearTimeout(timer); document.body.style.overflow = old; document.removeEventListener('keydown', key); previous?.focus(); }; }, []);
  return createPortal(<div className="modal-backdrop" onMouseDown={e => { if (e.currentTarget === e.target) onClose(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><span className="eyebrow">K-BALL</span><h2>{title}</h2></div><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={21} /></button></div><div className="modal-content">{children}</div></div></div>,document.body);
}
export function MatchRow({ match, onClick }: { match: MatchRecord; onClick: () => void }) {
  const home = match.homeId === match.playerClubId, a = home ? match.homeGoals : match.awayGoals, b = home ? match.awayGoals : match.homeGoals, opponent = home ? match.awayId : match.homeId, result=match.shootout?(match.shootout.winnerId===match.playerClubId?'win':'loss'):a>b?'win':a<b?'loss':'draw';
  return <button className="match-row" onClick={onClick}><span className="round">{match.scope === 'national' ? '국대' : `R${match.round}`}</span><span className={`result ${result}`}>{result==='win'?'승':result==='loss'?'패':'무'}</span><TeamBadge id={opponent} small /><span className="match-opponent"><strong>{teamName(opponent, home ? match.awayName : match.homeName)}</strong><small>{match.shootout?`승부차기 ${home?match.shootout.home:match.shootout.away}–${home?match.shootout.away:match.shootout.home}`:home?'홈':'원정'} · {match.playerPlayed ? `${match.playerMinutes}분` : '미출전'}</small></span><strong className="match-score">{a} <span>–</span> {b}</strong><span className="rating">{match.playerPlayed ? match.playerRating.toFixed(1) : '—'}</span><ArrowUpRight size={15} /></button>;
}
export function Sparkline({ values, label, format = v => String(Math.round(v)) }: { values: number[]; label: string; format?: (n: number) => string }) {
  const all = values.length ? values : [0], min = Math.min(...all), max = Math.max(...all), points = all.map((v, i) => `${12 + i * 476 / Math.max(1, all.length - 1)},${89 - (v - min) / Math.max(1, max - min) * 65}`).join(' ');
  return <div className="sparkline"><svg viewBox="0 0 500 110" role="img" aria-label={`${label}: ${all.map(format).join(', ')}`}><line x1="12" y1="89" x2="488" y2="89" className="chart-grid" /><polyline points={points} fill="none" className="chart-line" />{all.map((v, i) => { const [x, y] = points.split(' ')[i].split(',').map(Number); return <g key={i}><title>{format(v)}</title><circle cx={x} cy={y} r="3" className="chart-dot" />{(i === 0 || i === all.length - 1) && <text x={x} y={y - 10} textAnchor={i === 0 ? 'start' : 'end'}>{format(v)}</text>}</g>; })}</svg><div><span>시작</span><span>현재</span></div></div>;
}
export function clubTotal(career: Career) { return sumStats([cupStats(career),...career.history.map(s => s.stats), ...(career.stage === 'season' ? [career.season.playerStats] : [])]); }
export function nationalTotal(career: Career) { return sumStats(nationalMatchLedger(career).map(match => match.playerStats)); }
export const STAT_LABELS: Partial<Record<keyof PlayerStats, string>> = { apps:'출전', starts:'선발', minutes:'출전 시간', goals:'득점', assists:'도움', shots:'슈팅', shotsOnTarget:'유효 슈팅', passes:'패스 시도', passesCompleted:'패스 성공', keyPasses:'키패스', dribbleAttempts:'드리블 시도', dribblesCompleted:'드리블 성공', tackles:'태클 성공', tackleAttempts:'태클 시도', interceptions:'인터셉트', aerialAttempts:'공중볼 시도', aerialWon:'공중볼 승리', saves:'선방', shotsFaced:'상대 유효 슈팅', goalsConceded:'실점', cleanSheets:'클린시트', oneOnOneAttempts:'일대일 시도', oneOnOneSaves:'일대일 선방', penaltiesFaced:'상대 페널티', penaltiesSaved:'페널티 선방', crossesFaced:'상대 크로스', crossesCaught:'크로스 포구', sweepingAttempts:'스위핑 시도', sweepingSuccesses:'스위핑 성공', buildUpPasses:'빌드업 패스 시도', buildUpCompleted:'빌드업 패스 성공', longKicks:'롱킥 시도', longKicksCompleted:'롱킥 성공', handlingAttempts:'공 처리 시도', handlingSuccesses:'공 처리 성공', lateActions:'후반 행동', lateSuccesses:'후반 성공', mom:'MOM' };

export const visibleAwards = (awards: Award[]) => awards.filter(a => a.category!=='commercial'&&!/^K볼 (성장상|시즌 베스트|라이징 스타)$/.test(a.name) && a.name !== '구단 득점왕');

export function calendarLabel(career:Career,year=career.season.year) { const season=year===career.season.year?career.season:career.history.find(h=>h.year===year);const displayYear=season?.calendarYear??year;return season&&getLeagueRule(season.leagueId).startMonth===1?String(displayYear):seasonLabel(displayYear); }
