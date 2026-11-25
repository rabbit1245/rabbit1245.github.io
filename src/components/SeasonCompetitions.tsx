import {useMemo,useState} from 'react';
import type {Career,MatchRecord} from '../game/types';
import type {ClubTournament} from '../game/revision-types';
import {competitionGamesLabel,type CompetitionParticipation} from '../game/season-competitions';
import {clubPhaseTable,cupLedger} from '../game/club-competitions';
import {getClub} from '../game/data';
import {Modal,MatchRow} from './Shared';
import NationalAudit from './NationalAudit';
import './SeasonCompetitions.css';

function resultText(row:CompetitionParticipation) {
 return row.competitionId||row.nationalPhase?`${row.statusLabel} · ${competitionGamesLabel(row)}`:row.statusLabel;
}
function ClubCupDetail({cup,row,onMatch}:{cup:ClubTournament;row:CompetitionParticipation;onMatch:(match:MatchRecord)=>void}) {
 const phase=clubPhaseTable(cup,row.teamId);
 return <>
  <p><strong>{row.teamName}</strong> · {resultText(row)}</p>
  <p className="fine-print">{cup.basis} · {cup.rules}</p>
  {cup.winnerId&&<p><strong>우승 {getClub(cup.winnerId).name}</strong></p>}
  {cup.matches.filter(match=>match.playerClubId===row.teamId).map(match=><MatchRow key={match.id} match={match} onClick={()=>onMatch(match)}/>)}
  <details><summary>대진 {cup.fixtures.length}경기 · 진행 {cup.fixtures.filter(fixture=>fixture.played).length}경기</summary>
    <div className="full-standings-scroll"><table className="league-table">
      <thead><tr><th>날짜</th><th>라운드</th><th>홈</th><th>결과</th><th>원정</th></tr></thead>
      <tbody>{cup.fixtures.map(fixture=><tr key={fixture.id}><td>{fixture.date?.slice(0,10)??'일정 대기'}</td>
        <td>{fixture.stage}{fixture.leg===2?' 2차전':''}</td><td>{getClub(fixture.homeId).name}</td>
        <td>{fixture.played?`${fixture.homeGoals} : ${fixture.awayGoals}${fixture.shootout?` (승부차기 ${fixture.shootout.home}:${fixture.shootout.away})`:''}`:'예정'}</td>
        <td>{getClub(fixture.awayId).name}</td></tr>)}</tbody>
    </table></div>
  </details>
  {cup.leagueRounds>0&&<details><summary>{phase.label} 순위</summary>
    <div className="full-standings-scroll"><table className="league-table">
      <thead><tr><th>순위</th><th>구단</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>승점</th></tr></thead>
      <tbody>{phase.table.map((rank,index)=><tr key={rank.clubId}><td>{index+1}</td><td>{getClub(rank.clubId).name}</td>
        <td>{rank.played}</td><td>{rank.won}</td><td>{rank.drawn}</td><td>{rank.lost}</td><td>{rank.points}</td></tr>)}</tbody>
    </table></div>
  </details>}
 </>;
}

export default function SeasonCompetitions({career,rows,onMatch}:{career:Career;rows:CompetitionParticipation[];onMatch?:(m:MatchRecord)=>void}){
 const [open,setOpen]=useState<string|null>(null);
 const cups=useMemo(()=>new Map(cupLedger(career,career.season.year).map(cup=>[cup.id,cup])),[career]);
 const selected=rows.find(row=>row.id===open),cup=selected?.competitionId?cups.get(selected.competitionId):undefined;
 const clubRows=rows.filter(row=>row.scope==='club'),nationalRows=rows.filter(row=>row.scope==='national');
 const scopes=[{id:'club',label:'클럽 대회',rows:clubRows},{id:'national',label:'국가대표 대회',rows:nationalRows}];
 return <>
  <section className="season-competitions" data-testid="season-competitions" aria-label="이번 시즌 참여 대회">
    {scopes.map(scope=><div key={scope.id} className="competition-scope">
      <span className="competition-scope-label">{scope.label}</span>
      <div className="competition-items">
        {scope.rows.map(row=>{
          const repeated=scope.rows.some(other=>other!==row&&other.name===row.name);
          return <div key={row.id} className="competition-item" data-testid={scope.id==='club'?'club-competition':row.nationalPhase?'national-competition':'national-competition-status'} title={`${row.teamName} · ${row.reason}`}>
            <strong>{row.name}{repeated?` · ${row.teamName}`:''}</strong><span>{resultText(row)}</span>
          </div>;
        })}
        <button className="text-button" data-testid={`competition-details-${scope.id}`} onClick={()=>setOpen(scope.id)}>상세</button>
      </div>
    </div>)}
  </section>
  {open&&<Modal title={cup?.name??(open==='national'?'대표팀 일정·출전':'이번 시즌 클럽 대회')} onClose={()=>setOpen(null)} wide>
    {open==='national'?<>
      <ul className="competition-detail-list">{nationalRows.map(row=><li key={row.id}><strong>{row.name}</strong> · {row.teamName} · {resultText(row)}</li>)}</ul>
      <NationalAudit career={career}/>
    </>:cup&&selected?<ClubCupDetail cup={cup} row={selected} onMatch={match=>{setOpen(null);onMatch?.(match);}}/>:<>
      <ul className="competition-detail-list">{clubRows.map(row=><li key={row.id}>
        {row.competitionId&&cups.has(row.competitionId)?<button className="text-button" onClick={()=>setOpen(row.id)}>{row.name}</button>:<strong>{row.name}</strong>}
        {' · '}{row.teamName} · {resultText(row)}
      </li>)}</ul>
      {career.systems?.world.promotionReviews?.filter(review=>review.year===career.season.year&&(clubRows.some(row=>row.teamId===review.clubId)||career.season.leagueId==='KR3')).map(review=><p key={`${review.year}:${review.clubId}`}><strong>승강 검토 · {review.status==='unverified'?'판정 보류':review.promoted?'승격 확정':'승격 없음'}</strong><br/>{review.reason}</p>)}
    </>}
  </Modal>}
 </>;
}
