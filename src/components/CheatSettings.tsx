import type {Career,GameCommand} from '../game/types';
import {getCheatSettings} from '../game/cheat-settings';
import {ATTRIBUTE_ADJUSTMENT_AMOUNTS} from '../game/attributes';
import {useEffect,useState} from 'react';
export default function CheatSettings({career,busy,command,onEdit}:{career:Career;busy:boolean;command:(c:GameCommand)=>void;onEdit:()=>void}){
 const cheats=getCheatSettings(career),[enabled,setEnabled]=useState(cheats.enabled),[freezeAging,setFreezeAging]=useState(cheats.freezeAging);
 useEffect(()=>{if(!busy){setEnabled(cheats.enabled);setFreezeAging(cheats.freezeAging);}},[career.id,career.revision,busy]);
 return <section className="cheat-settings" data-testid="cheat-settings"><h3 className="form-section">치트 모드</h3>
  <label className="setting-row"><span><strong>치트 모드 {enabled?'ON':'OFF'}</strong><small>켜면 선수 능력치를 직접 올리고 나이 증가를 멈출 수 있습니다.</small></span><input type="checkbox" aria-label="치트 모드" checked={enabled} disabled={busy} onChange={e=>{setEnabled(e.target.checked);command({type:'cheatSettings',enabled:e.target.checked,freezeAging});}}/></label>
  {enabled&&<><label className="setting-row"><span><strong>노화 중지</strong><small>나이 증가를 멈춥니다. 자동 노화 하락은 없으며 부상은 출전·훈련량에만 영향을 줍니다. 시즌은 계속 진행됩니다.</small></span><input type="checkbox" aria-label="노화 중지" checked={freezeAging} disabled={busy} onChange={e=>{setFreezeAging(e.target.checked);command({type:'cheatSettings',enabled,freezeAging:e.target.checked});}}/></label>
   <button className="button secondary" disabled={busy||career.stage==='retired'} onClick={onEdit}>능력치 편집 열기</button><p className="muted">훈련 탭에서 치트 → {ATTRIBUTE_ADJUSTMENT_AMOUNTS.map(step=>`+${step}`).join('·')}을 선택하고, 능력치나 전체 적용을 누르세요. 모드를 꺼도 이미 올린 수치는 유지됩니다.</p></>}
 </section>;
}
