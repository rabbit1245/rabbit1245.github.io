import {getClub,getLeague} from './data';
import {clamp} from './math';

export const MARKET_SOURCE='https://www.deloitte.com/uk/en/services/financial-advisory/analysis/deloitte-football-money-league.html';
/** Revenue: Deloitte Football Money League 2026, 2024/25 EUR millions.
 * Shirt units are separate game calibration assumptions, NOT reported sales.
 * Commercial revenue is not equated with shirt receipts or player income. */
export const MARKET_BENCHMARKS:Record<string,{revenue:number;shirts:number}>={
 ES1_01:{revenue:1161,shirts:3000000},ES1_02:{revenue:974.8,shirts:2800000},DE1_02:{revenue:860.6,shirts:2100000},FR1_01:{revenue:837,shirts:1600000},
 EN1_12:{revenue:836.1,shirts:2100000},EN1_13:{revenue:829.3,shirts:1600000},EN1_01:{revenue:821.7,shirts:1700000},EN1_14:{revenue:793.1,shirts:2400000},
 EN1_18:{revenue:672.6,shirts:1000000},EN1_06:{revenue:584.1,shirts:1400000},IT1_01:{revenue:537.5,shirts:1100000},DE1_05:{revenue:531.3,shirts:1000000},
 ES1_03:{revenue:454.5,shirts:650000},EN1_02:{revenue:450.2,shirts:300000},IT1_02:{revenue:410.4,shirts:1000000},IT1_03:{revenue:401.7,shirts:1200000},
 EN1_15:{revenue:398.4,shirts:450000},DE1_03:{revenue:296.3,shirts:280000},PT1_02:{revenue:283.4,shirts:650000},EN1_19:{revenue:276,shirts:300000},
};
const heritage:Record<string,number>={ES1_09:380000,ES1_10:400000,IT1_06:500000,IT1_09:550000,FR1_03:650000,FR1_05:350000,DE1_01:350000,PT1_01:500000,PT1_03:550000,TR1_01:750000,TR1_02:650000,US1_12:650000};
const countries:Record<string,number>={'영국':1.3,'스페인':1.15,'독일':1.15,'이탈리아':1,'프랑스':.9,'브라질':1.1,'미국':.85,'일본':.65,'대한민국':.35,'튀르키예':1,'포르투갈':.7,'네덜란드':.7};
export function baseShirtMarket(id:string):number{
 const club=getClub(id),league=getLeague(club.leagueId);
 return MARKET_BENCHMARKS[id]?.shirts??heritage[id]??Math.round(Math.max(1500,125000*Math.pow(club.power/75,4)*(countries[club.country]??.5)/Math.pow(league.tier,2)));
}
export function benchmarkRevenue(id:string,power:number):number|undefined{
 const b=MARKET_BENCHMARKS[id];return b?Math.round(b.revenue*1e6*Math.pow(clamp(power/getClub(id).power,.75,1.25),2)):undefined;
}
