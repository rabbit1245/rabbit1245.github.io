/** Full nationality index from the retained FC25 snapshot, independently of old club matching. */
import retainedNationalityGroups from './national-index.json';
const nationalities=new Map<string,string>();
for(const [country,ids]of Object.entries(retainedNationalityGroups))for(const id of ids.split(','))nationalities.set(`fc25_${id}`,country);
export const NATIONALITY_SOURCE='보관된 FC25 전체 선수 국적 · 가상 선수는 생성 당시 국적 유지';
export function normalizeNationality(country:string):string{return country==='영국'?'잉글랜드':country;}
export function nationalityForPlayer(id:string,clubCountry:string):string{return normalizeNationality(nationalities.get(id)??clubCountry);}
/** Correct known real nationalities on read; old match and international histories remain untouched. */
export function currentNationality(p:{id:string;nationality:string}):string{return normalizeNationality(nationalities.get(p.id)??p.nationality);}
