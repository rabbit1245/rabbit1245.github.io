import {OVR_LEVELS,ovrLevel} from '../game/ovr-levels';
export default function OVRLevels({value}:{value:number}){
 return <details className="ovr-levels"><summary>OVR {value} · {ovrLevel(value)?.label} · 선수 수준표</summary><p className="fine-print">메시·호날두의 전성기 2~3시즌을 100~110으로 잡은 게임용 상대평가입니다. 손흥민은 85~90, 120은 역사에 없던 수준, 130은 영원한 GOAT급 성과를 낼 실력입니다. 한국 선수의 비교 예시는 손흥민만 포함합니다. 같은 OVR도 포지션·세부 능력치와 출전 환경에 따라 성과는 달라집니다.</p><table><tbody>{OVR_LEVELS.map(r=><tr key={r.min}><th>{r.range}</th><td>{r.label}<br/>{r.examples.join(' · ')}</td></tr>)}</tbody></table></details>;
}
