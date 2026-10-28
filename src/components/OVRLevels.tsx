import {OVR_LEVELS,ovrLevel} from '../game/ovr-levels';
export default function OVRLevels({value}:{value:number}){
 return <details className="ovr-levels"><summary>OVR {value} · {ovrLevel(value)?.label} · 선수 수준표</summary><p className="fine-print">전성기 기량을 비교하는 게임용 비유입니다. 90은 손흥민급, 95~100은 케인·벤제마·네이마르급, 100~110은 메시·호날두급을 기준으로 합니다. 110 초과는 가상 확장입니다. 같은 OVR도 포지션·세부 능력치와 출전 환경에 따라 성과는 달라집니다.</p><table><tbody>{OVR_LEVELS.map(r=><tr key={r.min}><th>{r.min}~{r.max}</th><td>{r.label}<br/>{r.examples.join(' · ')}</td></tr>)}</tbody></table></details>;
}
