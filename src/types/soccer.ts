export type MatchMotivation = 'title_race' | 'relegation_battle' | 'regular' | 'dead_rubber';

export type ManualOverrideType = 'none' | 'force_home' | 'force_away';

export interface TeamStats {
  id: string;
  name: string;
  shortName: string;
  leagueRank: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
  formScores?: string[]; // FT scores for last 5 matches e.g. ["2-1", "3-0", "1-1", "2-0", "1-0"]
  formDetails?: {
    result: 'W' | 'D' | 'L';
    score: string;
    opponent?: string;
    venue?: 'H' | 'A';
    date?: string;
  }[];
  avgPossession: number; // e.g. 58.4 (%)
  avgShotsOnTarget: number; // e.g. 6.8
  isHomeDominant?: boolean; // For Home team: record at home is dominant
  hasTopTierAwayForm?: boolean; // For Away team: top-tier away form
  hasMidweekFatigue72h?: boolean; // Played cup/continental match within 72h
  badgeColor?: string; // hex for visual avatar badge
  badgeSecondary?: string;
  hasOutliersCleaned?: boolean; // Set when engine has automatically cleaned/ignored anomalous match results or clamped extreme outliers
  outlierCleanedReason?: string; // Descriptive explanation of why anomalies were quarantined (e.g. 10-man collapse / freak blowout ignored)
  anomalousMatchesIgnored?: number; // Count of outlier games quarantined from baseline
  lastSeasonRank?: number; // Final standing in same competition last season (1 = Champion, 2 = 2nd, 21 = Promoted)
  lastSeasonStanding?: string; // e.g. "1st (Champions)", "2nd", "14th", "Promoted"
  lastSeasonPoints?: number; // Points tally from last season in the same competition
  totalSquadValueEur?: number; // Total squad market value in millions of EUR (e.g. 1170 = €1.17B, 340 = €340M)
  avgMatchRating?: number; // Squad average match rating across the season (6.40 - 7.35 scale)
  expectedGoalsAvg?: number; // Average Expected Goals (xG) generated per match (e.g. 1.85)
  keyPlayerAbsenceSeverity?: 'none' | 'minor' | 'critical'; // Lineup availability status
}

export interface H2HRecord {
  homeWins: number;
  draws: number;
  awayWins: number;
  totalLast5: number;
  scoresLast5?: string[]; // e.g. ["2-1", "3-0", "1-1", "2-0", "4-1"]
}

export interface MatchFixture {
  id: string;
  kickoffTime: string; // ISO string e.g. "2026-09-04T16:30:00Z"
  league: string;
  competition?: string;
  venue: string;
  round?: string;
  isHighStakes: boolean;
  motivation: MatchMotivation;
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  h2h: H2HRecord;
  odds?: {
    home: number;
    draw: number;
    away: number;
    provider?: string;
  };
  isBookmakerProtected?: boolean;
  impliedProbabilities?: {
    home: number;
    draw: number;
    away: number;
    marginPercent: number;
  };
  authenticity?: MatchAuthenticityStamp;
}

export interface RuleAppliedItem {
  ruleNumber: number;
  ruleName: string;
  tag: string;
  impact: string;
  beneficiary?: 'home' | 'away' | 'draw' | 'both' | 'neutral';
  description: string;
}

export interface PredictionResult {
  matchId: string;
  homeWinPct: number; // 0 - 100
  drawPct: number; // 0 - 100
  awayWinPct: number; // 0 - 100
  predictedWinner: 'home' | 'draw' | 'away';
  confidenceScore: number; // 0 - 100
  appliedRules: RuleAppliedItem[];
  rawPoints: {
    home: number;
    away: number;
    draw: number;
  };
  finalPoints: {
    home: number;
    away: number;
    draw: number;
  };
  isFavouriteMatch: boolean;
  favouriteTeams: string[];
  manualOverride: ManualOverrideType;
  isVolatilityCompressed: boolean;
}

export interface IngestionMetadata {
  source: string;
  ingestionMode: string;
  lastParsedTimestamp: string;
  totalParsedFixtures: number;
  favouriteMatchesCount: number;
  dataVersion: string;
}

export interface AutoScrapeConfig {
  enabled: boolean;
  intervalSeconds: number; // e.g. 15, 30, 60, 300
  lastScrapedAt: string;
  totalScrapesCount: number;
}

export interface ScrapeLogItem {
  id: string;
  timestamp: string;
  fixturesCount: number;
  favouritesCount: number;
  status: 'SUCCESS' | 'SYNCED' | 'PARSED';
  details: string;
}

export interface EngineWeights {
  stakesMotivationBoost: number; // default 2.5
  deadRubberPenalty: number; // default 0.20
  rankPointsMultiplier: number; // default 0.40
  formWinPoints: number; // default 1.20
  formDrawPoints: number; // default 0.40
  homeAdvantageBaseline: number; // default 10.0
  awayAdvantageBaseline: number; // default 8.5
  homeDominanceBonus: number; // default 1.8
  awayFormBonus: number; // default 1.5
  tacticalPossessionWeight: number; // default 0.15
  tacticalShotsWeight: number; // default 0.45
  h2hMultiplier: number; // default 0.80
  fatiguePenaltyRate: number; // default 0.15
  volatilityDrawBoost: number; // default 1.30
  favouriteWinFloor: number; // default 55
  drawEquilibriumMargin: number; // default 5.0 (percentage margin difference between Home and Away)
  drawEquilibriumBoost: number; // default 38.0 (calibrated draw probability for close matchups)
  lastSeasonStandingWeight: number; // default 0.30 (points per standing place difference from last season in same competition)
  squadValueWeight: number; // default 0.40 (multiplier for squad market valuation disparity ratio)
  matchRatingWeight: number; // default 4.50 (points multiplier for average match rating differential)
  lowTotalDrawBoost: number; // default 1.25 (multiplier boost for low-scoring defensive synergy fixtures)
  defensiveSynergyDrawWeight: number; // default 0.35 (points weight for combined low shot/concede draw equilibrium)
  leagueClusterWeight: number; // default 0.40 (weight for league tactical archetype adjustments: draw-heavy vs high-scoring)
  xgWeight: number; // default 0.50 (weight for expected goals differential)
  absencePenaltyRate: number; // default 0.12 (penalty rate for critical player absences)
}

export interface HistoricalMatchResult {
  id: string;
  fixture: MatchFixture;
  homeScore: number;
  awayScore: number;
  actualOutcome: 'home' | 'draw' | 'away';
  date: string;
  notes?: string;
}

export interface BacktestEvaluation {
  matchId: string;
  fixture: MatchFixture;
  actualOutcome: 'home' | 'draw' | 'away';
  predictedOutcome: 'home' | 'draw' | 'away';
  isCorrect: boolean;
  probabilities: { home: number; draw: number; away: number };
  brierScore: number;
  homeScore: number;
  awayScore: number;
}

export interface AITacticalSynthesis {
  summary: string;
  recommendations: string[];
  ruleEfficiency: {
    rule: string;
    impact: string;
    status: 'optimal' | 'recalibrating' | 'underweight';
  }[];
  timestamp: string;
}

export interface LearningModelState {
  weights: EngineWeights;
  baselineWeights: EngineWeights;
  totalEpochsTrained: number;
  accuracyPct: number;
  baselineAccuracyPct: number;
  brierLoss: number;
  baselineBrierLoss: number;
  lastTrainedAt: string;
  isAutoLearningEnabled: boolean;
  recentLossHistory: number[];
  aiTacticalSynthesis?: AITacticalSynthesis;
}

export type DatePresetId =
  | 'all'
  | 'today'
  | 'tomorrow'
  | 'weekend'
  | '7days'
  | '14days'
  | 'month'
  | 'custom';

export interface DateRangeFilter {
  startDate: string; // 'YYYY-MM-DD' or ''
  endDate: string; // 'YYYY-MM-DD' or ''
  presetId: DatePresetId;
}

export interface EnginePerformanceSummary {
  yesterdayDate: string;
  yesterdayTotal: number;
  yesterdayCorrect: number;
  yesterdayWrong: number;
  yesterdayAccuracyPct: number;
  allTimeTotal: number;
  allTimeCorrect: number;
  allTimeWrong: number;
  allTimeAccuracyPct: number;
  homeWinAccuracyPct: number;
  awayWinAccuracyPct: number;
  drawAccuracyPct: number;
  brierLoss: number;
}

export type DataAuthenticityStatus =
  | 'VERIFIED_AUTHENTIC'
  | 'AUTO_REPAIRED'
  | 'ANOMALIES_DETECTED'
  | 'UNVERIFIED';

export interface VerificationCheckResult {
  checkName: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface MatchAuthenticityStamp {
  status: DataAuthenticityStatus;
  authenticityScore: number; // 0 - 100
  isAuthentic: boolean;
  verifiedAt: string;
  source: 'OFFICIAL_ESPN_STANDINGS' | 'CANONICAL_AUDITED_DATASET' | 'MATHEMATICAL_VALIDATOR';
  checks: VerificationCheckResult[];
  repairedFields?: string[];
}

export interface DataIntegrityAuditReport {
  timestamp: string;
  totalFixturesAudited: number;
  fullyAuthenticCount: number;
  autoRepairedCount: number;
  anomalousCount: number;
  overallAuthenticityScore: number; // 0 - 100
  standingsCrossReferencedCount: number;
  monotonicityPassRate: number; // 0 - 100
  metricsSanityPassRate: number; // 0 - 100
  leaguesAudited: {
    league: string;
    teamsCount: number;
    isOfficialTableSynced: boolean;
    status: 'VERIFIED' | 'CALIBRATED';
  }[];
  repairedAnomaliesLog: {
    fixtureId: string;
    matchTitle: string;
    field: string;
    originalValue: any;
    repairedValue: any;
    reason: string;
  }[];
}

export interface BetSlipItem {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffTime: string;
  selection: 'home' | 'draw' | 'away';
  selectionName: string;
  odds: number;
  probability?: number; // AI-calculated selection probability (0 - 100)
}

