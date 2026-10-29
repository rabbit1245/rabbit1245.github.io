import type {Career} from './types';
import type {WorldState} from './revision-types';
/** Named by the user; Chelsea also belongs to the established English big six. */
export const ESTABLISHED_CLUBS=new Set(['EN1_01','EN1_06','EN1_12','EN1_13','EN1_14','EN1_18','IT1_01','IT1_02','IT1_03','IT1_06','IT1_09','ES1_01','ES1_02','ES1_03','ES1_09','ES1_10','DE1_01','DE1_02','DE1_05','FR1_01','FR1_03','FR1_05']);
/** Paid development still builds small clubs. At the elite end its translation
 * to match strength has diminishing returns; prestige and investment cannot both
 * turn every member of a good squad into a 99-rated player. Capital is retained. */
export function effectiveDevelopmentGain(base:number,gain:number):number{
 const threshold=Math.max(0,86-base),room=Math.max(1,90.5-Math.max(86,base));
 return gain<=threshold?gain:threshold+room*-Math.expm1(-(gain-threshold)/room);
}
const indexes=new WeakMap<WorldState,{clubId:string;history:number;influenced:Set<string>}>();
/** Rebuilt only when club membership/history changes, never by scanning a career per fixture. */
export function userInfluencedClub(c:Career,id:string):boolean{
 const w=c.systems?.world;if(!w)return id===c.player.clubId;
 let index=indexes.get(w);
 if(!index||index.clubId!==c.player.clubId||index.history!==c.history.length){
  const built=c.history.filter(h=>h.squad==='senior'&&(h.stats?.apps??0)>=8&&(h.stats?.minutes??0)>=900&&(h.ovrEnd>=(w.clubs[h.clubId]?.development?.basePower??100)+8||h.stats.ratingCount>0&&h.stats.ratingSum/h.stats.ratingCount>=7.3));
  index={clubId:c.player.clubId,history:c.history.length,influenced:new Set([c.player.clubId,...built.map(h=>h.clubId),...Object.values(w.clubs).filter(t=>t.development?.history.some(r=>r.star?.playerId===c.player.id&&r.star.influence>=.2)).map(t=>t.id)])};indexes.set(w,index);
 }
 return index.influenced.has(id);
}
