import type {Career} from '../game/types';
import {shirtSalesSeason} from '../game/commercial';
import {teamName,TeamBadge} from './Shared';
import './ShirtSales.css';
export default function ShirtSales({career,year=career.season.year}:{career:Career;year?:number}){
 const s=shirtSalesSeason(career,year),old=year<(career.systems?.commercial?.firstYear??career.season.year+(career.stage==='season'?0:1));
 return <section className="shirt-sales" data-testid="shirt-sales" data-year={year}>
  <div className="shirt-sales-summary"><strong>유니폼 판매</strong><b data-testid="shirt-units">{s?`${s.playerUnits.toLocaleString('ko-KR')}장`:old?'미집계':'시즌 종료 후 집계'}</b>{s&&<span data-testid="shirt-rank">{s.completed?'시즌 결산':'은퇴 시점 집계'} · {s.playerRank?`세계 ${s.playerRank.toLocaleString('ko-KR')}위`:'판매 기록 없음'}</span>}</div>
  {s?<details className="shirt-market-details"><summary>판매 시장 · 세계 순위 보기</summary>
   <div className="shirt-club-sales">{s.playerClubs.map(r=><p key={r.clubId}><b>{teamName(r.clubId)}</b> · 내 판매 {r.units.toLocaleString('ko-KR')}장 · 구단 내 {r.rank}위 · 구단 전체 {r.clubTotal.toLocaleString('ko-KR')}장 · 인기도 {r.clubPopularity>=1?'+':''}{((r.clubPopularity-1)*100).toFixed(1)}% <small>(기준 팬 기반 대비)</small></p>)}</div>
   <div className="shirt-table-wrap"><table><caption>세계 유니폼 판매 상위 {s.leaders.length}명</caption><thead><tr><th>순위</th><th>선수 · 대표 소속</th><th>판매량</th></tr></thead><tbody>{s.leaders.map(r=><tr key={r.playerId} className={r.playerId===career.player.id?'shirt-own':''}><td>{r.rank}</td><td><span>{r.name}</span><small><TeamBadge id={r.clubId}/>{teamName(r.clubId)}</small></td><td>{r.units.toLocaleString('ko-KR')}장</td></tr>)}</tbody></table></div>
   <p className="fine-print">세계 시장 {s.marketTotal.toLocaleString('ko-KR')}장 · 선수 이름 유니폼 {s.namedTotal.toLocaleString('ko-KR')}장 · 무지·레트로 등 {s.otherTotal.toLocaleString('ko-KR')}장</p>
   <p className="fine-print">개인 실적·팀 성적·실력·스타성·명성과 클럽 인기도를 반영한 게임 내 판매량입니다. 세계 1~3위는 시즌 종료 시 개인상을 받습니다.</p>
  </details>:<p className="fine-print">{old?'이 시장을 도입하기 전 시즌의 판매량은 미집계입니다.':'시즌 성적과 클럽 인기도에 따라 판매량이 결정됩니다.'}</p>}
 </section>;
}
