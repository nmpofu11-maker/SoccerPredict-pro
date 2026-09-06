export type MatchMotivation = 'title_race' | 'relegation_battle' | 'regular' | 'dead_rubber';

export type ManualOverrideType = 'none' | 'force_home' | 'force_away';

export interface TeamStats {
  id: string;
  name: string;
  shortName: string;
  leagueRank: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
  avgPossession: number; // e.g. 58.4 (%)
  avgShotsOnTarget: number; // e.g. 6.8
  isHomeDominant?: boolean; // For Home team: record at home is dominant
  hasTopTierAwayForm?: boolean; // For Away team: top-tier away form
  hasMidweekFatigue72h?: boolean; // Played cup/continental match within 72h
  badgeColor?: string; // hex for visual avatar badge
  badgeSecondary?: string;
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
  venue: string;
  round?: string;
  isHighStakes: boolean;
  motivation: MatchMotivation;
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  h2h: H2HRecord;
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

