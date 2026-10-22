import { DEFAULT_ENGINE_WEIGHTS, fixtureHasEvidence, sanitizeEngineWeights } from '../engine/rulesEngine';
import { evaluateHistoricalMatches, trainMultipleEpochs } from '../engine/selfLearningEngine';
import { CANONICAL_INITIAL_MATRICES, synthesizeTeamIntelligenceMatrices } from '../engine/teamIntelligenceMatrix';
import type { EngineWeights, HistoricalMatchResult } from '../types/soccer';
import type { TeamIntelligenceMatrices } from '../types/superLearning';

/** The engine trains synchronously (~0.6s per epoch per 1,000 matches), so the caps keep a run to roughly 15-60s. */
export const TRAIN_LIMITS = { defaultEpochs: 5, maxEpochs: 10, defaultMatches: 5_000, maxMatches: 30_000, minUsable: 200 } as const;

export interface HistoricalTrainingOutcome {
  ok: boolean;
  reason?: string;
  usableMatches: number;
  trainedOn: number;
  holdoutSize: number;
  epochs: number;
  proposedWeights?: EngineWeights;
  before?: { accuracyPct: number; brierLoss: number };
  after?: { accuracyPct: number; brierLoss: number };
  /** What a model with NO football knowledge scores on the same unseen holdout. Beat these or the rules add nothing. */
  baselines?: {
    alwaysMostCommonOutcome: { outcome: 'home' | 'draw' | 'away'; accuracyPct: number; brierLoss: number };
  };
  improvedOnHoldout?: boolean;
  lossHistory?: number[];
  note: string;
}

export interface HistoricalHoldoutMatch {
  matchId: string;
  date: string;
  fixture: {
    league: string;
    homeTeam: { name: string };
    awayTeam: { name: string };
  };
  homeScore: number;
  awayScore: number;
  actualOutcome: 'home' | 'draw' | 'away';
  predictedOutcome: 'home' | 'draw' | 'away';
  isCorrect: boolean;
  probabilities: { home: number; draw: number; away: number };
  brierScore: number;
}

export interface HistoricalHoldoutEvaluation {
  status: 'ok' | 'insufficient_data';
  usableMatches: number;
  windowMatches: number;
  holdoutSize: number;
  evaluatedMatches: number;
  correctCount: number;
  accuracyPct: number | null;
  brierLoss: number | null;
  baselineAccuracyPct: number | null;
  baselineBrierLoss: number | null;
  /** Most recent scored matches only, to keep the dashboard payload and rendering bounded. */
  matches: HistoricalHoldoutMatch[];
  note: string;
}

/**
 * Re-evaluates the currently active weights against the recent chronological holdout
 * from the server's imported archive. The holdout is not fitted; its team matrices
 * are derived from the preceding fit partition only.
 */
/**
 * Build team profiles for future/live predictions from the complete archive.
 * This is intentionally separate from holdout evaluation, which derives matrices
 * from its fit partition only to prevent evaluation leakage.
 */
export function buildPredictionTeamMatrices(results: HistoricalMatchResult[]): TeamIntelligenceMatrices {
  const usable = (results || []).filter(
    match => Boolean(match && match.fixture && fixtureHasEvidence(match.fixture))
  );
  return synthesizeTeamIntelligenceMatrices(usable, CANONICAL_INITIAL_MATRICES);
}

export function evaluateHistoricalModelOnHoldout(
  all: HistoricalMatchResult[],
  weights: Partial<EngineWeights> | null | undefined,
  maxMatches: number = TRAIN_LIMITS.maxMatches
): HistoricalHoldoutEvaluation {
  const usable = (all || [])
    .filter(m => m && m.fixture && fixtureHasEvidence(m.fixture))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const boundedMax = Math.min(TRAIN_LIMITS.maxMatches, Math.max(100, Math.floor(maxMatches)));
  const window = usable.slice(-boundedMax);
  const holdoutSize = window.length >= 2 ? Math.max(1, Math.floor(window.length * 0.2)) : 0;
  const fit = window.slice(0, window.length - holdoutSize);
  const holdout = holdoutSize > 0 ? window.slice(window.length - holdoutSize) : [];
  if (usable.length < TRAIN_LIMITS.minUsable || holdout.length === 0) {
    return {
      status: 'insufficient_data',
      usableMatches: usable.length,
      windowMatches: window.length,
      holdoutSize: holdout.length,
      evaluatedMatches: 0,
      correctCount: 0,
      accuracyPct: null,
      brierLoss: null,
      baselineAccuracyPct: null,
      baselineBrierLoss: null,
      matches: [],
      note: `Insufficient usable historical matches for a chronological holdout (need at least ${TRAIN_LIMITS.minUsable}). Metrics are unavailable, not zero.`,
    };
  }

  const matrices = synthesizeTeamIntelligenceMatrices(fit, CANONICAL_INITIAL_MATRICES);
  const activeEvaluation = evaluateHistoricalMatches(holdout, sanitizeEngineWeights(weights), matrices);
  const baselineEvaluation = evaluateHistoricalMatches(holdout, DEFAULT_ENGINE_WEIGHTS, matrices);
  const evaluatedMatches = activeEvaluation.evaluations.length;
  if (evaluatedMatches === 0) {
    return {
      status: 'insufficient_data',
      usableMatches: usable.length,
      windowMatches: window.length,
      holdoutSize: holdout.length,
      evaluatedMatches: 0,
      correctCount: 0,
      accuracyPct: null,
      brierLoss: null,
      baselineAccuracyPct: null,
      baselineBrierLoss: null,
      matches: [],
      note: 'The evidence gate withheld every automatic prediction in the holdout. Accuracy and Brier loss are unavailable, not zero.',
    };
  }

  const matches: HistoricalHoldoutMatch[] = activeEvaluation.evaluations.slice(-100).map(item => ({
    matchId: item.matchId,
    date: item.fixture.kickoffTime.slice(0, 10) || item.fixture.kickoffTime,
    fixture: {
      league: item.fixture.league,
      homeTeam: { name: item.fixture.homeTeam.name },
      awayTeam: { name: item.fixture.awayTeam.name },
    },
    homeScore: item.homeScore,
    awayScore: item.awayScore,
    actualOutcome: item.actualOutcome,
    predictedOutcome: item.predictedOutcome,
    isCorrect: item.isCorrect,
    probabilities: item.probabilities,
    brierScore: item.brierScore,
  }));

  return {
    status: 'ok',
    usableMatches: usable.length,
    windowMatches: window.length,
    holdoutSize: holdout.length,
    evaluatedMatches,
    correctCount: activeEvaluation.correctCount,
    accuracyPct: activeEvaluation.accuracyPct,
    brierLoss: activeEvaluation.brierLoss,
    baselineAccuracyPct: baselineEvaluation.accuracyPct,
    baselineBrierLoss: baselineEvaluation.brierLoss,
    matches,
    note: 'Measured on imported historical results in the most recent chronological holdout; only prior-window team matrices were used. Default-weight baseline is scored on the same holdout and matrices.',
  };
}

const NOTE =
  'Weights are PROPOSED only and have not been applied. Accuracy is measured on the most recent 20% of matches, which were never used to fit. ' +
  'Compare against the no-feature baseline: its accuracy always picks the most common training outcome, while its Brier score uses the training-set outcome frequencies as constant probabilities. A rule model that does not beat this baseline on holdout Brier loss has not demonstrated useful probabilistic skill.';

// Same multi-class Brier convention as evaluateHistoricalMatches so numbers are comparable.
const brier = (p: { home: number; draw: number; away: number }, y: 'home' | 'draw' | 'away') =>
  ((p.home - +(y === 'home')) ** 2 + (p.draw - +(y === 'draw')) ** 2 + (p.away - +(y === 'away')) ** 2) / 2;

export function trainOnHistoricalResults(
  all: HistoricalMatchResult[],
  opts: { epochs?: number; maxMatches?: number; startWeights?: Partial<EngineWeights> | null } = {}
): HistoricalTrainingOutcome {
  const epochs = Math.min(TRAIN_LIMITS.maxEpochs, Math.max(1, Math.floor(opts.epochs ?? TRAIN_LIMITS.defaultEpochs)));
  const maxMatches = Math.min(TRAIN_LIMITS.maxMatches, Math.max(100, Math.floor(opts.maxMatches ?? TRAIN_LIMITS.defaultMatches)));

  const usable = all.filter(m => fixtureHasEvidence(m.fixture)); // already chronological from buildTrainingSet
  if (usable.length < TRAIN_LIMITS.minUsable) {
    return {
      ok: false, usableMatches: usable.length, trainedOn: 0, holdoutSize: 0, epochs,
      reason: `Only ${usable.length} matches have enough prior history to carry real evidence; need at least ${TRAIN_LIMITS.minUsable}. Import more seasons.`,
      note: NOTE,
    };
  }

  const window = usable.slice(-maxMatches); // most recent matches; keeps run time bounded
  const holdoutSize = Math.max(1, Math.floor(window.length * 0.2));
  const trainPart = window.slice(0, window.length - holdoutSize);
  const holdout = window.slice(window.length - holdoutSize);

  const res = trainMultipleEpochs(sanitizeEngineWeights(opts.startWeights), epochs, window);

  const freq = { home: 0, draw: 0, away: 0 };
  for (const m of trainPart) freq[m.actualOutcome]++;
  const best = (Object.keys(freq) as ('home' | 'draw' | 'away')[]).sort((a, b) => freq[b] - freq[a])[0];
  const prior = { home: freq.home / trainPart.length, draw: freq.draw / trainPart.length, away: freq.away / trainPart.length };
  let correct = 0;
  let b = 0;
  for (const m of holdout) {
    if (m.actualOutcome === best) correct++;
    b += brier(prior, m.actualOutcome);
  }

  return {
    ok: true,
    usableMatches: usable.length,
    trainedOn: trainPart.length,
    holdoutSize,
    epochs: res.epochsCompleted,
    proposedWeights: res.finalWeights,
    before: { accuracyPct: res.initialAccuracy, brierLoss: res.initialLoss },
    after: { accuracyPct: res.finalAccuracy, brierLoss: res.finalLoss },
    baselines: {
      alwaysMostCommonOutcome: {
        outcome: best,
        accuracyPct: Math.round((correct / holdout.length) * 1000) / 10,
        brierLoss: Math.round((b / holdout.length) * 1000) / 1000,
      },
    },
    improvedOnHoldout: res.finalLoss < res.initialLoss,
    lossHistory: res.lossHistory,
    note: NOTE,
  };
}
