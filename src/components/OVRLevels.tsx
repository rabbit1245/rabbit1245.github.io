import {OVR_LEVELS,ovrLevel} from '../game/ovr-levels';
export default function OVRLevels({value}:{value:number}){
 return <details className="ovr-levels"><summary>OVR {value} · {ovrLevel(value)?.label} · 선수 수준표</summary><p className="fine-print">실제 선수의 전성기를 비교한 게임용 예시이며 공식 선수 평가는 아닙니다. 110 이상은 가상의 초월적 수준입니다.</p><table><tbody>{OVR_LEVELS.map(r=><tr key={r.min}><th>{r.min}~{r.max}</th><td>{r.label}<br/>{r.examples.join(' · ')}</td></tr>)}</tbody></table></details>;
}
