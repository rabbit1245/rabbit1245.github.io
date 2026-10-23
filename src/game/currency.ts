/** Existing saves store EUR. Display conversion only; never changes contracts or transactions. */
export const EUR_KRW=1500;
export const krw=(eur:number)=>Math.round(eur*EUR_KRW);
export const money=(eur:number)=>`${krw(eur).toLocaleString('ko-KR')}원`;
export function koreanWon(wholeWon:number):string{
 const n=Math.abs(Math.round(wholeWon)),eok=Math.floor(n/1e8),man=Math.floor(n%1e8/1e4),won=n%1e4;
 return `${wholeWon<0?'−':''}${[eok?`${eok.toLocaleString('ko-KR')}억`:null,man?`${man.toLocaleString('ko-KR')}만`:null,won||!n?`${won.toLocaleString('ko-KR')}`:null].filter(Boolean).join(' ')} 원`;
}
export const compactMoney=(eur:number)=>koreanWon(krw(eur));
export const moneyText=(eur:number)=>`${money(eur)} (${compactMoney(eur)})`;
/** Display legacy generated prose with the same fixed conversion, without rewriting its stored history. */
export function currencyText(text:string):string{return text.replace(/€([\d,]+(?:\.\d+)?)/g,(_,n)=>moneyText(Number(n.replaceAll(',','')))).replace(/([\d,]+)천 유로/g,(_,n)=>compactMoney(Number(n.replaceAll(',',''))*1000));}
