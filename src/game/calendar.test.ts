import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDate,isInternationalBreak,seasonDate,seasonHalfEndDate,nextCalendarYear } from './calendar';
import type { SeasonState } from './types';
const season=(leagueId:string,year=2026,totalWeeks=38)=>({leagueId,year,totalWeeks,week:0} as SeasonState);
test('local season halves end at real month boundaries and club dates avoid international breaks',()=>{
  for(const leagueId of ['KR1','EN1'])for(const rounds of [22,34,38,58]){
    const s=season(leagueId,2026,rounds),dates=Array.from({length:rounds},(_,i)=>fixtureDate(s,i+1));
    assert.equal(new Set(dates).size,rounds);assert.deepEqual([...dates].sort(),dates);
    assert.ok(dates.every(d=>!isInternationalBreak(d)));
    assert.ok(dates[Math.ceil(rounds/2)-1]<=seasonHalfEndDate(s,'first'));
    assert.ok(dates[Math.ceil(rounds/2)]>seasonHalfEndDate(s,'first'));
    assert.ok(dates.at(-1)!<=seasonHalfEndDate(s,'second'));
  }
  assert.equal(seasonHalfEndDate(season('KR1'),'first').slice(0,10),'2026-06-30');
  assert.equal(seasonHalfEndDate(season('EN1'),'second').slice(0,10),'2027-06-30');
  assert.equal(seasonDate(season('KR1'),38).slice(0,10),'2026-12-31');
  assert.equal(nextCalendarYear(season('EN1'),'KR1'),2028);
});
