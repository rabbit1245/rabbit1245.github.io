export interface LoadingProgress {phase:string;percent?:number}

let previous:LoadingProgress|undefined;
export function resetLoadingProgress():void{previous=undefined;}
export function loadingProgress(phase:string,percent?:number):void{
  if(previous?.phase===phase&&previous.percent===percent)return;
  previous={phase,percent};
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('kball-loading',{detail:previous}));
}
