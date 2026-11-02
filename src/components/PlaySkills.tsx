import OVRLevels from './OVRLevels';
import type {Career,GameCommand} from '../game/types';
import {ATTRIBUTE_LABELS} from '../game/attributes';
import {attributeCap,playSkillDefinitions} from '../game/play-skills';

export default function PlaySkills({career,busy,command}:{career:Career;busy:boolean;command:(c:GameCommand)=>void}){
 const selected=career.player.playSkills??[];
 return <details className="play-skills" data-testid="play-skills"><summary>플레이스타일 <span>{selected.length}/5</span></summary><p>능력치 상한은 모두 120입니다. 선택한 최대 5개 능력치를 실제로 훈련해 쌓은 숙련과 100 초과 능력에 따라 개당 최대 +2, 합계 +10을 OVR에 반영합니다. 선택만으로 점수가 오르지 않습니다.</p><div className="play-skill-grid">{playSkillDefinitions(career.player.position).map(skill=>{
  const active=selected.includes(skill.key),value=career.player.attributes[skill.key]??0,locked=career.systems?.attributeLocks?.includes(skill.key);
  return <article className={active?'play-skill selected':'play-skill'} key={skill.key}><strong>{skill.name} <span>{skill.english}</span></strong><small>{ATTRIBUTE_LABELS[skill.key]} · 현재 {value.toFixed(1)} / 상한 {attributeCap(career.player,skill.key)}{locked?' · 잠금':''}</small><button type="button" aria-pressed={active} data-testid={`skill-${skill.key}`} disabled={busy||career.stage==='retired'||!active&&selected.length>=5} onClick={()=>command({type:'playSkill',key:skill.key,selected:!active})}>{active?(value>100?'삭제 · 숙련 보정 종료':'선택 해제'):selected.length>=5?'5개 선택됨':'선택 · 숙련 훈련'}</button>{active&&value>100&&<small>선택 해제 시 능력치는 유지하고 해당 숙련 보정을 종료합니다.</small>}</article>;
 })}</div><p className="fine-print">기존 전술 역할은 유지됩니다. 시즌 종료 후 변경은 다음 시즌부터 기록합니다. 삭제한 연도부터 연도별 은퇴 기록에서 제외됩니다. 스킬 삭제는 명시적 조정이므로 잠금 중에도 가능합니다.</p><OVRLevels value={career.player.ovr}/></details>;
}
