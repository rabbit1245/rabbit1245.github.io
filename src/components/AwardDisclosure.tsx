import {ChevronRight} from 'lucide-react';
import type {Award} from '../game/types';
import {teamName} from './Shared';
import './ShirtSales.css';
export default function AwardDisclosure({award:a}:{award:Award}){
 return <details className="award-disclosure" data-testid="award-disclosure" data-award-id={a.id}>
  <summary><strong>{a.name}</strong><ChevronRight size={17} aria-hidden="true"/></summary>
  <div className="award-criteria" data-testid="award-criteria"><small>{teamName(a.clubId)} · {a.official===false?'K볼 자체 선정':'실제 수상 명칭 · 게임 기록 평가'}</small>
   {a.criterion&&<p><b>수상 기준</b> · {a.criterion}</p>}<p>{a.description}</p>{a.organiser&&<small>선정 · {a.organiser}</small>}
  </div>
 </details>;
}
