import OVRLevels from './OVRLevels';
import type {Career,GameCommand} from '../game/types';
import {ATTRIBUTE_LABELS,overallParts} from '../game/attributes';
import {attributeCap,playSkillDefinitions} from '../game/play-skills';

export default function PlaySkills({career,busy,command}:{career:Career;busy:boolean;command:(c:GameCommand)=>void}){
 const selected=career.player.playSkills??[],parts=overallParts(career.player),modern=career.player.ovrVersion===3;
 return <details className="play-skills" data-testid="play-skills"><summary>플레이스타일 <span>{selected.length}/5</span></summary><p>개별 능력치는 기본 100, 선택한 플레이스타일의 능력치만 120까지 성장합니다. 5개 능력치의 100 초과 성장을 합산해 순수 OVR 최대 120, 실제 훈련한 숙련 보정 최대 +10으로 종합 130에 도달합니다. 선택만으로 점수가 오르지 않습니다.</p>{modern?<p data-testid="ovr-breakdown">순수 능력 {parts.ability.toFixed(2)} / 120 + 숙련 {parts.mastery.toFixed(2)} / 10 → 종합 {career.player.ovr} / 130</p>:<p>은퇴 시점의 능력치와 당시 산식의 OVR을 보존한 기록입니다.</p>}<div className="play-skill-grid">{playSkillDefinitions(career.player.position).map(skill=>{
  const active=selected.includes(skill.key),value=career.player.attributes[skill.key]??0,locked=career.systems?.attributeLocks?.includes(skill.key);
  return <article className={active?'play-skill selected':'play-skill'} key={skill.key}><strong>{skill.name} <span>{skill.english}</span></strong><small>{ATTRIBUTE_LABELS[skill.key]} · 현재 {value.toFixed(1)} / 상한 {attributeCap(career.player,skill.key)}{locked?' · 잠금':''}</small><button type="button" aria-pressed={active} data-testid={`skill-${skill.key}`} disabled={busy||career.stage==='retired'||!active&&selected.length>=5} onClick={()=>command({type:'playSkill',key:skill.key,selected:!active})}>{active?(value>100?'삭제 · 상한 100 복귀':'선택 해제'):selected.length>=5?'5개 선택됨':'선택 · 숙련 훈련'}</button>{active&&value>100&&<small>선택 해제 시 해당 능력치는 기본 상한 100으로 조정되고 숙련 보정이 종료됩니다.</small>}</article>;
 })}</div><p className="fine-print">기존 전술 역할은 유지됩니다. 시즌 종료 후 변경은 다음 시즌부터 기록합니다. 삭제한 연도부터 연도별 은퇴 기록에서 제외됩니다. 스킬 삭제는 명시적 조정이므로 잠금 중에도 가능합니다.</p><OVRLevels value={career.player.ovr}/></details>;
}
