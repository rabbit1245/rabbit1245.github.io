import OVRLevels from './OVRLevels';
import type {Career,GameCommand} from '../game/types';
import {ATTRIBUTE_LABELS} from '../game/attributes';
import {attributeCap,playSkillDefinitions} from '../game/play-skills';

export default function PlaySkills({career,busy,command}:{career:Career;busy:boolean;command:(c:GameCommand)=>void}){
 const selected=career.player.playSkills??[];
 return <details className="play-skills" data-testid="play-skills"><summary>플레이스타일 <span>{selected.length}/5</span></summary><p>선택은 성장 상한만 110으로 엽니다. 체크한 훈련만 성장하며, 포지션 핵심 5개를 110까지 육성하면 OVR 120에 도달할 수 있습니다.</p><div className="play-skill-grid">{playSkillDefinitions(career.player.position).map(skill=>{
  const active=selected.includes(skill.key),value=career.player.attributes[skill.key]??0,locked=career.systems?.attributeLocks?.includes(skill.key);
  return <article className={active?'play-skill selected':'play-skill'} key={skill.key}><strong>{skill.name} <span>{skill.english}</span></strong><small>{ATTRIBUTE_LABELS[skill.key]} · 현재 {value.toFixed(1)} / 상한 {attributeCap(career.player,skill.key)}{locked?' · 잠금':''}</small><button type="button" aria-pressed={active} data-testid={`skill-${skill.key}`} disabled={busy||career.stage==='retired'||!active&&selected.length>=5} onClick={()=>command({type:'playSkill',key:skill.key,selected:!active})}>{active?(value>100?'삭제 · 초과 숙련 종료':'선택 해제'):selected.length>=5?'5개 선택됨':'선택 · 상한 110'}</button>{active&&value>100&&<small>삭제 시 현재 값은 100으로 조정되며 이전 수치는 이력에 보존됩니다.</small>}</article>;
 })}</div><p className="fine-print">기존 전술 역할은 유지됩니다. 시즌 종료 후 변경은 다음 시즌부터 기록합니다. 삭제한 연도부터 연도별 은퇴 기록에서 제외됩니다. 스킬 삭제는 명시적 조정이므로 잠금 중에도 가능합니다.</p><OVRLevels value={career.player.ovr}/></details>;
}
