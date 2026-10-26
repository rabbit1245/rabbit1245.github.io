import type { AttributeKey, Attributes, Award, Club, Fixture, MatchRecord, PlayerStats, Position, Standing } from './types';

export interface MatchParticipant { id: string; name: string; position: Position; ovr: number; attributes?: Attributes; nationality?: string; clubId: string }
export interface MatchPerformance extends MatchParticipant { stats: PlayerStats; rating: number; minutes: number; started: boolean; captain?: boolean; teamId?: string }
export interface MatchEffects { fitnessAfter: number; moraleAfter: number; formAfter: number; injuryWeeksAfter: number; trustAfter: number }
export interface MatchOptions {
  home?: Club; away?: Club; homePlayers?: MatchParticipant[]; awayPlayers?: MatchParticipant[];
  scope?: 'club'|'national'; competitionId?: string; date?: string; userParticipates?: boolean; detailed?: boolean;
  forceSelection?: { from: number; to: number; started: boolean };
  neutralVenue?:boolean;
}
export interface WorldPlayer { id: string; clubId: string; name: string; position: Position; age: number; ovr: number; potential: number; injuryWeeks: number; nationality: string; leadership: number; joinedYear?:number; transferFee?:number; leagueDebutYear?:number; }
export interface ClubStarContribution {playerId:string;name:string;position:Position;ovr:number;apps:number;minutes:number;rating:number;influence:number;retained:boolean;}
export interface ClubSeasonDevelopment {year:number;leagueId:string;rank:number;expectedRank:number|null;points:number;teams:number;bonus:number;reinvestment:number;beforePower:number;afterPower:number;prestigeBefore:number;prestigeAfter:number;improvedPlayers:number;recruits:number;star?:ClubStarContribution;starBudget?:number;revenueBasis?:number;userContribution?:{apps:number;minutes:number;goals:number;assists:number;rating:number};}
export interface ClubDevelopment {investmentPower?:number;basePower:number;prestige:number;baselineYear:number;baselinePower:number;expectedRank:number|null;history:ClubSeasonDevelopment[];}
export interface ClubWorld { id: string; leagueId: string; power: number; depth: number; averageAge: number; injuryImpact: number; budget: number; wageBudget: number; revenue: number; rosterIds: string[]; changes: string[];development?:ClubDevelopment; }
export interface CompetitionState { leagueId: string; fixtures: Fixture[]; table: Standing[]; round: number; totalRounds: number }
export interface CompetitorSeason {leagueSplits?:{leagueId:string;stats:PlayerStats}[]; playerId: string; name: string; clubId: string; leagueId: string; position: Position; nationality: string; ovr: number; stats: PlayerStats; rank?: number; nationalStats?: PlayerStats }
export interface LeagueMovement { year: number; clubId: string; fromLeagueId: string; toLeagueId: string; kind: 'promotion'|'relegation'; reason: string }
export interface WorldState {promotionReviews?:import('./korean-promotion').PromotionReview[];koreanLicenseEditions?:import('./korean-promotion').KoreanLicenseEdition[];pendingMovements?:LeagueMovement[]; rosterVersion?:number; year: number; clubs: Record<string, ClubWorld>; players: Record<string, WorldPlayer>; competitions: Record<string, CompetitionState>; playerStats: Record<string, CompetitorSeason>; movements: LeagueMovement[] }
export interface LeagueRule { id: string; country: string; startMonth: number; promotion: number; relegation: number; upperLeagueId?: string; lowerLeagueId?: string; automatic: boolean; note: string; sourceUrl: string; medalApps: number }
export interface NationalSeason { year: number; squad: 'U20'|'senior'; competitionId: string; competitionName: string; stats: PlayerStats; matches: MatchRecord[]; result: string; qualified: boolean }
export interface NationalState { country: string; squad: 'U20'|'senior'; status: 'unselected'|'watchlist'|'called'|'injured'|'retired'; reason: string; competitionId: string; competitionName: string; phase: 'friendlies'|'qualifying'|'finals'|'eliminated'; points: number; rank: number; qualified: boolean; fatigue: number; reputation: number; matches: MatchRecord[]; history: NationalSeason[]; processedWindows: string[]; teamResults?: MatchRecord[]; timingVersion?: 1; processedThrough?: string }
export interface NationalFixturePlan {id:string;date:string;competitionId:string;stage:string;squad:'U20'|'senior';homeId:string;awayId:string;}
export interface NationalState {schedule?:NationalFixturePlan[];formatVersion?:2;tournamentStats?:Record<string,Record<string,{id:string;name:string;position:Position;stats:PlayerStats}>>;windowQualifiers?:Record<string,number[]>;qualifyingDraws?:Record<string,{groups:string[][];legs:1|2}>;finalDraws?:Record<string,{groups:string[][];size:number}>;windowSquads?:Record<string,'U20'|'senior'>;}
export interface ValuePoint { year: number; round: number; value: number; reason: string }
export interface ContractTermsSnapshot { clubId:string; wage:number; years:number; signedYear:number; expiresYear:number; role:string; signedDate?:string; expiresDate?:string }
export interface ContractSnapshot { id:string; year:number; round:number; type:'initial'|'renew'|'transfer'|'legacy'|'release'; effective:'now'|'nextSeason'; reason:string; fee:number; previous?:ContractTermsSnapshot; current:ContractTermsSnapshot }
export interface EmploymentPeriod {year:number;totalRounds:number;fromRound:number;toRound?:number;clubId:string;leagueId:string;wage:number;reason:'initial'|'transfer'|'expiry'|'release'|'continued';}
export interface Economics { marketValue: number; previousValue: number; peakValue: number; valueHistory: ValuePoint[]; salaryIncome: number; bonusIncome: number; totalTransferFees: number; highestWage: number; contractHistory?: ContractSnapshot[]; seasonStartValue?:number; seasonStartYear?:number; contract: { signedYear: number; expiresYear: number; wageAtSigning: number; role: string; clubId: string; previousWage?:number; signedDate?:string; expiresDate?:string } }
export interface CaptainTerm { scope: 'club'|'national'; teamId: string; role: 'captain'|'vice'|'match'; startYear: number; endYear?: number; startRound?: number; endRound?: number; apps: number; reason: string }
export interface CaptainAssessment { scope:'club'|'national'; teamId:string; eligibleRole:'none'|'captain'|'vice'; teamPower:number; squadOvr:number; playerOvr:number; abilityRank:number; candidateRank:number; age:number; leadership:number; tenure:number; apps:number; recentApps:number; recentMinutes:number; rating:number; trust:number; score:number; reasons:string[] }
export interface CaptainOffer { id:string; scope:'club'|'national'; teamId:string; role:'captain'|'vice'; year:number; round:number; status:'pending'|'accepted'|'declined'|'expired'; reason:string; assessment:CaptainAssessment; answeredYear?:number; answeredRound?:number }
export interface Leadership { trait: number; baseTrait?: number; traitUpdatedYear?: number; clubSinceYear: number; clubId: string; clubRole: 'none'|'captain'|'vice'; nationalRole: 'none'|'captain'|'vice'; clubMatches: number; nationalMatches: number; terms: CaptainTerm[]; reason: string; offers?:CaptainOffer[] }
export interface RankingCandidate { playerId: string; name: string; clubId: string; position: Position; score: number; rank: number; stats: PlayerStats; nationalStats: PlayerStats }
export interface BallonDorYear { diagnostics?:{name:string;scope:string;eligible:boolean;result:string;detail:string}[]; year: number; candidates: RankingCandidate[]; playerRank: number|null; winnerId: string; world11: RankingCandidate[]; awards: Award[] }
export interface CupFixture extends Fixture {stage:string;step:number;leg:number;tieId:string;date?:string;winnerId?:string;shootout?:{home:number;away:number};}
export interface ClubTournament {format?:'groups'|'intercontinental'|'super';groups?:string[][];singleLeg?:boolean;doubleFinal?:boolean;calendar?:string[];maxSteps?:number;playerStats?:Record<string,CompetitorSeason>;id:string;name:string;year:number;country?:string;kind:'cup'|'leagueCup'|'continental';entrants:string[];basis:string;rules:string;phase:'league'|'knockout'|'completed';step:number;leagueRounds:number;stage:string;active:string[];byes:string[];fixtures:CupFixture[];matches:MatchRecord[];table:Standing[];winnerId?:string;startedAtRound:number;}
export interface ClubCompetitions {version:1;year:number;current:ClubTournament[];history:ClubTournament[];}
export interface ManualAging {key?:AttributeKey;playerId?:string;playerName?:string;id:string;year:number;round:number;date:string;amount:1|5|10;before:Attributes;after:Attributes;ovrBefore:number;ovrAfter:number;}
export interface ManualInjury {id:string;year:number;clubId:string;duration:'half'|'season'|5|10|20;start:string;end:string;pendingNextSeason?:boolean;returned?:string;selectionVersion?:2;remainingMatches?:number;targetMatches?:number;lastCheckedDate?:string;missed:{fixtureId:string;year:number;scope:'club'|'national';date?:string}[];}
export type GrowthCause='training'|'experience'|'development'|'injury'|'aging'|'cheat'|'skillChange';
export type GrowthBreakdown=Record<Exclude<GrowthCause,'cheat'|'skillChange'>,Attributes>&{cheat?:Attributes;skillChange?:Attributes};
export interface GrowthLedger {year:number;baselineAttributes:Attributes;trackedFromRound:number;byCause:GrowthBreakdown;fractionalGains?:Partial<Record<GrowthCause,Attributes>>;injuredRounds:number;trainingQuality:number;legacy:boolean}
export interface AgingReport {year:number;startAttributes:Attributes;endAttributes:Attributes;changes:Attributes;ovrStart:number;ovrEnd:number}
export interface TrainingPlan {forYear:number;confirmed:boolean;confirmedAtRound:number;source:'creation'|'offseason'|'legacy'}
export interface GrowthReport { year: number; half: 'first'|'season'; fromRound: number; toRound: number; startAttributes: Attributes; endAttributes: Attributes; ovrStart: number; ovrEnd: number; stats: PlayerStats; previousStats: PlayerStats; valueStart: number; valueEnd: number; context: string; growth?:GrowthLedger; offseasonAging?:AgingReport }
export interface PresentationEvent { id: string; year: number; round: number; type: 'mom'|'injury'|'national'|'transfer'|'renewal'|'captain'|'award'|'growth'|'promotion'|'retirement'; title: string; body: string; importance: 'brief'|'decision'|'milestone' }
export interface CareerSystems {
  employment?:EmploymentPeriod[];
  achievementEvidence?:import('./achievement-evidence').AchievementEvidence;
  playSkillChanges?:import('./play-skills').PlaySkillChange[];
  manualClock?:string; monthlyLeague?:import('./extra-honours').MonthlyLedger; clubCompetitions?:ClubCompetitions; manualAging?:ManualAging[]; attributeLocks?:AttributeKey[]; manualInjuries?:ManualInjury[];
  version: 2; growthModelVersion?:2; cheats?:{enabled:boolean;freezeAging:boolean;used:boolean}; growthLedger?:GrowthLedger; agingReport?:AgingReport; trainingPlan?:TrainingPlan; world: WorldState; national: NationalState; economics: Economics; leadership: Leadership;
  phase: 'preseason'|'first'|'midseason'|'second'|'review'|'retired'; halfRound: number; trainingLocked: boolean;
  firstHalfSnapshot?: { attributes: Attributes; stats: PlayerStats; ovr: number; value: number; round: number };
  growthReports: GrowthReport[]; pendingChoice?: { kind: 'renewal'|'transfer'; offerIds: string[]; deadlineRound: number; reason: string };
  rankings: BallonDorYear[]; events: PresentationEvent[]; legacyMetrics?: boolean;
}
