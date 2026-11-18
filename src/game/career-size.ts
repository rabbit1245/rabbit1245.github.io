import type {Career} from './types';

const compactCareers=new WeakSet<Career>();
export const usesCompactCareer=(career:Career)=>career.history.length>=6||compactCareers.has(career);
export function markCompactCareer(career:Career):Career{
 compactCareers.add(career);
 return career;
}
