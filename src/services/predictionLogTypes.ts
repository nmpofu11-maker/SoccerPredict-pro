export type Outcome = 'home' | 'draw' | 'away';

export interface PredictionRecord {
  type: 'prediction';
  fixtureId: string;
  kickoffTime: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  frozenAt: string;
  probabilities: { home: number; draw: number; away: number }; // percent, sums to ~100
  predicted: Outcome;
  modelVersion: string;
  inputCoverage: number; // 0..1, share of the 10 team-level inputs that were actually available
}

export interface OutcomeRecord {
  type: 'outcome';
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  actual: Outcome;
  recordedAt: string;
}

export type LogBody = PredictionRecord | OutcomeRecord;
export type LogLine = LogBody & { seq: number; prevHash: string; hash: string };

export interface MetricBlock {
  n: number;
  reportable: boolean; // false until n >= minSample; the numbers below are then null
  accuracyPct: number | null;
  accuracy95CiPct: { low: number; high: number } | null;
  brier: number | null; // multiclass Brier score: sum of squared errors over the 3 outcomes, range 0..2
  alwaysHomeAccuracyPct: number | null;
  mostCommonOutcomeAccuracyPct: number | null; // chosen with hindsight, so it flatters the baseline
  uniformGuessBrier: number; // 2/3: what predicting 1/3-1/3-1/3 every time scores
}

export interface TrackRecord {
  minSample: number;
  predictionsLogged: number;
  scored: number;
  pending: number;
  excludedNotFrozenBeforeKickoff: number;
  overall: MetricBlock;
  fullInputCoverageOnly: MetricBlock;
  generatedAt: string;
}

/** 95% Wilson score interval for a proportion. Browser-safe standalone utility. */
export function wilsonInterval(correct: number, n: number): { low: number; high: number } | null {
  if (n <= 0) return null;
  const z = 1.96;
  const p = correct / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}
