import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {copySystems} from '../src/game/snapshot';
import {advanceCareer} from '../src/game/engine';
import {validateCareer} from '../src/game/storage';
import type {Career} from '../src/game/types';
async function main(){
 const old=await import('/tmp/kball-p26-perf/src/game/engine.ts');
 const base=JSON.parse(await readFile('test-results/p26/browser/career-baseline.json','utf8')).career as Career;
 const unchanged=[];for(const rounds of [1,3,5]){const a=old.advanceCareer(base,rounds),b=advanceCareer(base,rounds);for(const key of ['attributes','ovr','age','fitness','form','morale','injuryWeeks'] as const)assert.deepEqual(b.player[key],a.player[key],`same-seed ${rounds} ${key}`);assert.deepEqual(b.season.matches,a.season.matches);assert.deepEqual(b.season.table,a.season.table);assert.deepEqual(b.systems?.growthLedger,a.systems?.growthLedger);assert.deepEqual(b.systems?.world.playerStats,a.systems?.world.playerStats);unchanged.push({rounds,leagueGames:b.season.matches.length,exact:true});}
 const snapshots=[];for(const years of [1,10,20]){const raw=await readFile(`test-results/p27/long/career-${years}.json`,'utf8'),c=validateCareer(JSON.parse(raw).career),s=c.systems!,measure=(fn:()=>unknown)=>{const values=[];for(let i=0;i<3;i++){const t=performance.now();const out=fn();assert.ok(out);values.push(performance.now()-t);}return values.sort((a,b)=>a-b)[1];};const legacyCopy=measure(()=>structuredClone(s)),light=measure(()=>copySystems(s,true)),full=measure(()=>copySystems(s));snapshots.push({years,bytes:Buffer.byteLength(raw),legacyCopyMs:legacyCopy,lightCopyMs:light,fullCopyMs:full});console.log(JSON.stringify(snapshots.at(-1)));}
 await mkdir('test-results/p27/performance',{recursive:true});await writeFile('test-results/p27/performance/engine.json',JSON.stringify({baseline:'9b78cbb',method:'Same input save and RNG seed on 2.6 and 2.7; unchanged existing competition save. Snapshot copy medians, three repetitions; actual complete new career at 1/10/20 seasons.',unchanged,snapshots},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
