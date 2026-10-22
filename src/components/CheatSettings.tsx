import type {Career,GameCommand} from '../game/types';
import {useEffect,useState} from 'react';
export default function CheatSettings({career,busy,command,onEdit}:{career:Career;busy:boolean;command:(c:GameCommand)=>void;onEdit:()=>void}){
 const cheats=career.systems?.cheats,[enabled,setEnabled]=useState(cheats?.enabled??false),[freezeAging,setFreezeAging]=useState(cheats?.freezeAging??false);
 useEffect(()=>{if(!busy){setEnabled(cheats?.enabled??false);setFreezeAging(cheats?.freezeAging??false);}},[career.id,career.revision,busy]);
 return <section className="cheat-settings" data-testid="cheat-settings"><h3 className="form-section">치트 모드</h3>
  <label className="setting-row"><span><strong>치트 모드 {enabled?'ON':'OFF'}</strong><small>켜면 선수의 능력치를 직접 올리고 노화를 중지할 수 있습니다.</small></span><input type="checkbox" aria-label="치트 모드" checked={enabled} disabled={busy} onChange={e=>{setEnabled(e.target.checked);command({type:'cheatSettings',enabled:e.target.checked,freezeAging});}}/></label>
  {enabled&&<><label className="setting-row"><span><strong>노화 중지</strong><small>나이 증가와 노화에 따른 능력치 하락을 멈춥니다. 시즌은 계속 진행됩니다.</small></span><input type="checkbox" aria-label="노화 중지" checked={freezeAging} disabled={busy} onChange={e=>{setFreezeAging(e.target.checked);command({type:'cheatSettings',enabled,freezeAging:e.target.checked});}}/></label>
   <button className="button secondary" disabled={busy||career.stage==='retired'} onClick={onEdit}>능력치 편집 열기</button><p className="muted">능력치 화면의 + 버튼으로 올립니다. 모드를 꺼도 이미 올린 수치는 유지됩니다.</p></>}
 </section>;
}
