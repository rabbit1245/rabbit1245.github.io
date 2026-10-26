import type { CareerSystems, MatchPerformance, MatchEffects, ClubSeasonDevelopment } from './revision-types';
export type Position = 'GK'|'CB'|'LB'|'RB'|'LWB'|'RWB'|'CDM'|'CM'|'CAM'|'LM'|'RM'|'LW'|'RW'|'CF'|'SS'|'ST';
export type Talent = 'SSS'|'SS'|'S'|'A'|'B'|'C'|'D';
export type Foot = 'right'|'left'|'both';
export type Squad = 'youth'|'senior';
export type Intensity = 'balanced'|'intense'|'rest';
export interface GameProgress {year:number;round:number;total:number}
export type AttributeKey = 'strength'|'stamina'|'speed'|'agility'|'jumping'|'ballControl'|'dribbling'|'passing'|'crossing'|'shooting'|'heading'|'defending'|'setPieces'|'decisions'|'vision'|'anticipation'|'positioning'|'composure'|'concentration'|'teamwork'|'gkShotStopping'|'gkReflexes'|'gkHandling'|'gkAerialCommand'|'gkOneOnOnes'|'gkPositioning'|'gkDistribution'|'gkDefensiveOrganization';
export type Attributes = Partial<Record<AttributeKey, number>>;
export interface Club { id: string; name: string; nativeName: string; country: string; leagueId: string; power: number; color: string; crest?: string }
export interface League { id: string; name: string; country: string; tier: number; verified: boolean }
export interface RosterPlayer { id: string; name: string; clubId: string; position: Position; ovr: number; age: number }
export interface Player {
  id: string; name: string; nationality: string; age: number; height: number; weight: number; foot: Foot;
  position: Position; secondaryPositions: Position[]; talent: Talent; style: string; attributes: Attributes; playSkills?:AttributeKey[];
  clubId: string; squad: Squad; fitness: number; morale: number; form: number; injuryWeeks: number;
  ovr: number; potential: number; wage: number; contractYears: number;
}
export interface PlayerStats {
  apps: number; starts: number; minutes: number; goals: number; assists: number;
  shots: number; shotsOnTarget: number; passes: number; passesCompleted: number;
  tackles: number; interceptions: number; saves: number; goalsConceded: number;
  cleanSheets: number; ratingSum: number; ratingCount: number; yellowCards: number; redCards: number;
  mom?: number; keyPasses?: number; dribbleAttempts?: number; dribblesCompleted?: number;
  tackleAttempts?: number; aerialAttempts?: number; aerialWon?: number; shotsFaced?: number;
  oneOnOneAttempts?: number; oneOnOneSaves?: number; penaltiesFaced?: number; penaltiesSaved?: number;
  crossesFaced?: number; crossesCaught?: number; sweepingAttempts?: number; sweepingSuccesses?: number;
  buildUpPasses?: number; buildUpCompleted?: number; longKicks?: number; longKicksCompleted?: number;
  handlingAttempts?: number; handlingSuccesses?: number; lateActions?: number; lateSuccesses?: number;
  detailedApps?: number;
}
export interface Standing { clubId: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number }
export interface Fixture { id: string; round: number; homeId: string; awayId: string; played: boolean; homeGoals?: number; awayGoals?: number }
export interface MatchEvent { id: string; minute: number; type: 'shot'|'goal'|'save'|'assist'|'yellow'|'red'|'injury'|'substitution'|'pass'|'keyPass'|'dribble'|'tackle'|'interception'|'aerial'|'handling'|'sweep'|'longKick'; teamId: string; playerName: string; playerId?: string; relatedId?: string; detail: string }
export interface MatchRecord {
  aggregate?:{home:number;away:number};nationalSelection?:{called:boolean;role:'starter'|'substitute'|'bench'|'excluded';reason:string;};
  id: string; fixtureId: string; round: number; seasonYear: number; homeId: string; awayId: string;
  homeGoals: number; awayGoals: number; events: MatchEvent[]; playerClubId: string;
  playerPlayed: boolean; playerStarted: boolean; playerMinutes: number; playerRating: number;
  playerStats: PlayerStats; seed: string;
  metricsVersion?: 2; scope?: 'club'|'national'; competitionId?: string; date?: string;
  homeName?: string; awayName?: string; performers?: MatchPerformance[]; momPlayerId?: string; effects?: MatchEffects;
  shootout?: { home: number; away: number; winnerId: string; attempts: { teamId: string; playerId: string; scored: boolean }[] };
}
export interface Award { id: string; name: string; year: number; clubId: string; description: string; organiser?: string; criterion?: string; sourceUrl?: string; category?: string; official?: boolean; position?: Position; rank?: number; ruleVersion?:string; evaluationPeriod?:string; verification?:'game-model' }
export interface SeasonState {
  year: number; index: number; week: number; totalWeeks: number; leagueId: string; competitionName: string;
  calendarYear?: number;
  fixtures: Fixture[]; table: Standing[]; matches: MatchRecord[]; playerStats: PlayerStats;
  ovrStart: number; attributeStart: Attributes; completed: boolean;
}
export interface SeasonSummary {
  year: number; clubId: string; clubName: string; leagueId: string; competitionName: string;
  calendarYear?: number;
  age: number; position: Position; squad: Squad; rank: number; ovrStart: number; ovrEnd: number;
  stats: PlayerStats; awards: Award[]; matches: MatchRecord[]; attributeGrowth: Attributes;
  income: number; completed: boolean; details?:SeasonDetails;
}
export interface SeasonDetails {
  employmentStandings?:{clubId:string;leagueId:string;rank:number;played:number;won:number;drawn:number;lost:number;points:number}[];
  playSkills?:AttributeKey[];
  version:1; clubDevelopment?:ClubSeasonDevelopment; table:Standing[]; attributes:Attributes; startAttributes:Attributes;
  marketValue:number; seasonStartValue?:number; contract:{clubId:string;wage:number;years:number;signedYear:number;expiresYear:number;role:string};
  personalRanks:{goals:number|null;assists:number|null;cleanSheets:number|null};
  captain:{club:'none'|'captain'|'vice';national:'none'|'captain'|'vice'};
}
export interface NewsItem { id: string; week: number; year: number; kind: 'match'|'training'|'transfer'|'injury'|'award'|'career'; title: string; body: string }
export interface TransferOffer { band?:'similar'|'lower'|'higher'|'wild'; id: string; clubId: string; wage: number; years: number; role: string; fee: number; reason: string; type: 'transfer'|'renew'; expiresRound?: number; effective?: 'now'|'nextSeason'; currentWage?: number; budgetLimit?: number }
export interface TransferRecord { year: number; fromClubId: string; toClubId: string; fee: number; wage: number }
export interface Career {
  schemaVersion: 1; id: string; seed: string; revision: number; createdAt: string; updatedAt: string;
  player: Player; season: SeasonState; history: SeasonSummary[]; news: NewsItem[];
  training: AttributeKey[]; intensity: Intensity; transfers: TransferRecord[]; offers: TransferOffer[];
  stage: 'season'|'offseason'|'retired'; lastMatchId?: string; retiredYear?: number;
  managerTrust: number; careerIncome: number; awards: Award[]; transferDecision?: 'stay'|'signed';
  difficulty: 'realistic'|'challenge'|'free'; processedCommands: string[]; systems?: CareerSystems;
}
export interface CreateOptions {
  name: string; nationality: string; age: number; height: number; weight: number; foot: Foot;
  position: Position; secondaryPositions?: Position[]; talent: Talent; style: string; clubId: string;
  squad: Squad; difficulty: 'realistic'|'challenge'|'free'; seed: string; training?: AttributeKey[]; intensity?: Intensity;
}
export type GameCommand = {type:'refreshOffers'} | {type:'releaseContract'} | {type:'playSkill';key:AttributeKey;selected:boolean} | {type:'manualAging';amount:1|5|10;key:AttributeKey} | {type:'attributeLock';key:AttributeKey;locked:boolean} | {type:'attributeLockAll';locked:boolean} | {type:'manualInjury';duration:'half'|'season'|5|10|20} | {type:'advance'; weeks:number} | {type:'training'; keys:AttributeKey[]; intensity:Intensity} | {type:'transfer'; offerId:string} | {type:'captainDecision';offerId:string;accept:boolean} | {type:'cheatSettings';enabled:boolean;freezeAging:boolean} | {type:'increaseAttribute';key:AttributeKey;amount:number} | {type:'stay'} | {type:'nextSeason'} | {type:'retire'} | {type:'advanceHalf'} | {type:'continueHalf'} | {type:'dismissChoice'};
export interface SaveSlot { id: string; name: string; playerName: string; clubName: string; year: number; age: number; ovr: number; updatedAt: string; revision: number }
export interface SaveEnvelope { format: 'kball-save'; schemaVersion: 1; hash: string; savedAt: string; career: Career }
