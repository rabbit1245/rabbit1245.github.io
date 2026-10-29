export interface CheckpointHint {bytes:number;entries:number;journalBytes:number;}
interface State {hint?:CheckpointHint;timer?:ReturnType<typeof setTimeout>;lastFull?:number;running:boolean;reschedule?:boolean;}
/** Journals are already durable. Batch expensive full snapshots away from active
 * input, but flush a growing journal well before its storage safety limit. */
export class CheckpointScheduler {
 private states=new Map<string,State>();private holds=0;
 constructor(private run:(id:string)=>Promise<void>,private now=()=>Date.now()){}
 private state(id:string){let s=this.states.get(id);if(!s){s={running:false};this.states.set(id,s);}return s;}
 cancelTimer(id:string){const s=this.states.get(id);if(s?.timer!==undefined)clearTimeout(s.timer);if(s)s.timer=undefined;}
 fullSaved(id:string){const s=this.state(id);this.cancelTimer(id);s.lastFull=this.now();s.hint=undefined;s.reschedule=false;}
 forget(id:string){this.cancelTimer(id);this.states.delete(id);}
 schedule(id:string,hint:CheckpointHint){
  const s=this.state(id);s.hint=hint;this.cancelTimer(id);if(s.running)s.reschedule=true;if(this.holds||s.running||!hint.entries)return;
  const large=hint.bytes>=32*1024*1024,urgent=hint.entries>=64||hint.journalBytes>=256*1024;
  const delay=urgent?0:large?Math.max(15_000,s.lastFull===undefined?0:60_000-(this.now()-s.lastFull)):1500;
  s.timer=setTimeout(()=>{s.timer=undefined;if(this.holds||s.running)return;s.running=true;s.reschedule=false;void this.run(id).catch(()=>undefined).finally(()=>{s.running=false;if(this.states.get(id)===s&&s.reschedule&&s.hint&&!this.holds)this.schedule(id,s.hint);});},delay);
 }
 activity(id:string){const s=this.states.get(id);if(s?.hint)this.schedule(id,s.hint);}
 pause(){this.holds++;for(const id of this.states.keys())this.cancelTimer(id);let released=false;return()=>{if(released)return;released=true;if(--this.holds===0)for(const [id,s]of this.states)if(s.hint)this.schedule(id,s.hint);};}
}
