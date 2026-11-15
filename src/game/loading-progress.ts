let last='';
export function loadingProgress(phase:string,percent?:number){if(last===phase+':'+percent)return;last=phase+':'+percent;if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('kball-loading',{detail:{phase,percent}}));}
