import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import StatsNine from '../src/components/StatsNine';
import BaselineStats from 'baseline-stats';
import fixtures from '../test-results/release-2.10.0/metric-fixtures.json';
import '../src/styles.css';
import '../src/components/LockerRoom.css';
import type {Position} from '../src/game/types';
function Fixture(){
  const [selected,setSelected]=useState({position:'ST',state:'known',baseline:false});
  useEffect(()=>{(window as any).__setStatsCase=(position:string,state:string,baseline:boolean)=>setSelected({position,state,baseline});},[]);
  const Component=selected.baseline?BaselineStats:StatsNine;
  return <main className="locker-workspace" style={{width:'min(1080px,100%)',margin:'auto',padding:16}} data-case={`${selected.position}:${selected.state}:${selected.baseline}`}><section className="panel locker-season-details"><div className="panel-body"><Component stats={(fixtures.cases as any)[selected.position][selected.state]} position={selected.position as Position}/></div></section></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
