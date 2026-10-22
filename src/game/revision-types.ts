import type { Attributes, Award, Club, Fixture, MatchRecord, PlayerStats, Position, Standing } from './types';

export interface MatchParticipant { id: string; name: string; position: Position; ovr: number; attributes?: Attributes; nationality?: string; clubId: string }
export interface MatchPerformance extends MatchParticipant { stats: PlayerStats; rating: number; minutes: number; started: boolean; captain?: boolean; teamId?: string }
export interface MatchEffects { fitnessAfter: number; moraleAfter: number; formAfter: number; injuryWeeksAfter: number; trustAfter: number }
export interface MatchOptions {
  home?: Club; away?: Club; homePlayers?: MatchParticipant[]; awayPlayers?: MatchParticipant[];
  scope?: 'club'|'national'; competitionId?: string; date?: string; userParticipates?: boolean; detailed?: boolean;
  forceSelection?: { from: number; to: number; started: boolean };
  neutralVenue?:boolean;
}
export interface WorldPlayer { id: string; clubId: string; name: string; position: Position; age: number; ovr: number; potential: number; injuryWeeks: number; nationality: string; leadership: number }
export interface ClubSeasonDevelopment {year:number;leagueId:string;rank:number;expectedRank:number|null;points:number;teams:number;bonus:number;reinvestment:number;beforePower:number;afterPower:number;prestigeBefore:number;prestigeAfter:number;improvedPlayers:number;recruits:number;userContribution?:{apps:number;minutes:number;goals:number;assists:number;rating:number};}
export interface ClubDevelopment {basePower:number;prestige:number;baselineYear:number;baselinePower:number;expectedRank:number|null;history:ClubSeasonDevelopment[];}
export interface ClubWorld { id: string; leagueId: string; power: number; depth: number; averageAge: number; injuryImpact: number; budget: number; wageBudget: number; revenue: number; rosterIds: string[]; changes: string[];development?:ClubDevelopment; }
export interface CompetitionState { leagueId: string; fixtures: Fixture[]; table: Standing[]; round: number; totalRounds: number }
export interface CompetitorSeason { playerId: string; name: string; clubId: string; leagueId: string; position: Position; nationality: string; ovr: number; stats: PlayerStats; rank?: number; nationalStats?: PlayerStats }
export interface LeagueMovement { year: number; clubId: string; fromLeagueId: string; toLeagueId: string; kind: 'promotion'|'relegation'; reason: string }
export interface WorldState { year: number; clubs: Record<string, ClubWorld>; players: Record<string, WorldPlayer>; competitions: Record<string, CompetitionState>; playerStats: Record<string, CompetitorSeason>; movements: LeagueMovement[] }
export interface LeagueRule { id: string; country: string; startMonth: number; promotion: number; relegation: number; upperLeagueId?: string; lowerLeagueId?: string; automatic: boolean; note: string; sourceUrl: string; medalApps: number }
export interface NationalSeason { year: number; squad: 'U20'|'senior'; competitionId: string; competitionName: string; stats: PlayerStats; matches: MatchRecord[]; result: string; qualified: boolean }
export interface NationalState { country: string; squad: 'U20'|'senior'; status: 'unselected'|'watchlist'|'called'|'injured'|'retired'; reason: string; competitionId: string; competitionName: string; phase: 'friendlies'|'qualifying'|'finals'|'eliminated'; points: number; rank: number; qualified: boolean; fatigue: number; reputation: number; matches: MatchRecord[]; history: NationalSeason[]; processedWindows: string[]; teamResults?: MatchRecord[]; timingVersion?: 1; processedThrough?: string }
export interface ValuePoint { year: number; round: number; value: number; reason: string }
export interface ContractTermsSnapshot { clubId:string; wage:number; years:number; signedYear:number; expiresYear:number; role:string; signedDate?:string; expiresDate?:string }
export interface ContractSnapshot { id:string; year:number; round:number; type:'initial'|'renew'|'transfer'|'legacy'; effective:'now'|'nextSeason'; reason:string; fee:number; previous?:ContractTermsSnapshot; current:ContractTermsSnapshot }
export interface Economics { marketValue: number; previousValue: number; peakValue: number; valueHistory: ValuePoint[]; salaryIncome: number; bonusIncome: number; totalTransferFees: number; highestWage: number; contractHistory?: ContractSnapshot[]; seasonStartValue?:number; seasonStartYear?:number; contract: { signedYear: number; expiresYear: number; wageAtSigning: number; role: string; clubId: string; previousWage?:number; signedDate?:string; expiresDate?:string } }
export interface CaptainTerm { scope: 'club'|'national'; teamId: string; role: 'captain'|'vice'|'match'; startYear: number; endYear?: number; startRound?: number; endRound?: number; apps: number; reason: string }
export interface CaptainAssessment { scope:'club'|'national'; teamId:string; eligibleRole:'none'|'captain'|'vice'; teamPower:number; squadOvr:number; playerOvr:number; abilityRank:number; candidateRank:number; age:number; leadership:number; tenure:number; apps:number; recentApps:number; recentMinutes:number; rating:number; trust:number; score:number; reasons:string[] }
export interface CaptainOffer { id:string; scope:'club'|'national'; teamId:string; role:'captain'|'vice'; year:number; round:number; status:'pending'|'accepted'|'declined'|'expired'; reason:string; assessment:CaptainAssessment; answeredYear?:number; answeredRound?:number }
export interface Leadership { trait: number; baseTrait?: number; traitUpdatedYear?: number; clubSinceYear: number; clubId: string; clubRole: 'none'|'captain'|'vice'; nationalRole: 'none'|'captain'|'vice'; clubMatches: number; nationalMatches: number; terms: CaptainTerm[]; reason: string; offers?:CaptainOffer[] }
export interface RankingCandidate { playerId: string; name: string; clubId: string; position: Position; score: number; rank: number; stats: PlayerStats; nationalStats: PlayerStats }
export interface BallonDorYear { year: number; candidates: RankingCandidate[]; playerRank: number|null; winnerId: string; world11: RankingCandidate[]; awards: Award[] }
export type GrowthCause='training'|'experience'|'development'|'injury'|'aging';
export type GrowthBreakdown=Record<GrowthCause,Attributes>;
export interface GrowthLedger {year:number;baselineAttributes:Attributes;trackedFromRound:number;byCause:GrowthBreakdown;injuredRounds:number;trainingQuality:number;legacy:boolean}
export interface AgingReport {year:number;startAttributes:Attributes;endAttributes:Attributes;changes:Attributes;ovrStart:number;ovrEnd:number}
export interface TrainingPlan {forYear:number;confirmed:boolean;confirmedAtRound:number;source:'creation'|'offseason'|'legacy'}
export interface GrowthReport { year: number; half: 'first'|'season'; fromRound: number; toRound: number; startAttributes: Attributes; endAttributes: Attributes; ovrStart: number; ovrEnd: number; stats: PlayerStats; previousStats: PlayerStats; valueStart: number; valueEnd: number; context: string; growth?:GrowthLedger; offseasonAging?:AgingReport }
export interface PresentationEvent { id: string; year: number; round: number; type: 'mom'|'injury'|'national'|'transfer'|'renewal'|'captain'|'award'|'growth'|'promotion'|'retirement'; title: string; body: string; importance: 'brief'|'decision'|'milestone' }
export interface CareerSystems {
  version: 2; growthLedger?:GrowthLedger; agingReport?:AgingReport; trainingPlan?:TrainingPlan; world: WorldState; national: NationalState; economics: Economics; leadership: Leadership;
  phase: 'preseason'|'first'|'midseason'|'second'|'review'|'retired'; halfRound: number; trainingLocked: boolean;
  firstHalfSnapshot?: { attributes: Attributes; stats: PlayerStats; ovr: number; value: number; round: number };
  growthReports: GrowthReport[]; pendingChoice?: { kind: 'renewal'|'transfer'; offerIds: string[]; deadlineRound: number; reason: string };
  rankings: BallonDorYear[]; events: PresentationEvent[]; legacyMetrics?: boolean;
}
