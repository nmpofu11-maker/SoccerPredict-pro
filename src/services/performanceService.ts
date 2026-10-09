import {
  HistoricalMatchResult,
  HistoricalEvaluation,
  EngineWeights,
  EnginePerformanceSummary,
} from '../types/soccer';
import { evaluateFixturePrediction, DEFAULT_ENGINE_WEIGHTS, fixtureHasEvidence } from '../engine/rulesEngine';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';
import { toIsoDateString } from '../utils/dateFilterUtils';
import { PredictionRecord, Outcome, wilsonInterval } from './predictionLogTypes';

/**
 * Calculates the Brier score for a multiclass 3-way outcome (Home, Draw, Away).
 * Supports both standard multiclass convention (sum of 3 squared errors, range 0..2)
 * and half-sum convention (half the sum of squared errors, range 0..1).
 */
export function calculateMultiClassBrierScore(
  probabilities: { home: number; draw: number; away: number },
  actualOutcome: 'home' | 'draw' | 'away',
  convention: 'standard_sum' | 'half_sum' = 'standard_sum'
): { score: number; standardSum: number; halfSum: number } {
  const pH = probabilities.home / 100;
  const pD = probabilities.draw / 100;
  const pA = probabilities.away / 100;

  const yH = actualOutcome === 'home' ? 1 : 0;
  const yD = actualOutcome === 'draw' ? 1 : 0;
  const yA = actualOutcome === 'away' ? 1 : 0;

  const standardSum = (pH - yH) ** 2 + (pD - yD) ** 2 + (pA - yA) ** 2;
  const halfSum = standardSum / 2;

  return {
    score: convention === 'half_sum' ? halfSum : standardSum,
    standardSum,
    halfSum,
  };
}

const TRUSTED_SETTLEMENT_NOTES = new Set([
  'Settled via SportAPI.ai',
  'Settled via Sportmonks',
  'Settled via Football-Data.org',
  'Settled via PitchAPI',
  'Settled via TheRundown.io',
  'Settled via manual result upload',
]);

function hasTrustedSettlementProvenance(result: HistoricalMatchResult): boolean {
  return typeof result.notes === 'string' && TRUSTED_SETTLEMENT_NOTES.has(result.notes.trim());
}

export interface AuditedPredictionEvaluation {
  fixtureId: string;
  homeTeam?: string;
  awayTeam?: string;
  league?: string;
  kickoffTime: string;
  frozenAt: string;
  probabilities: { home: number; draw: number; away: number };
  probabilitySum: number;
  predictedOutcome: Outcome;
  actualOutcome: Outcome;
  homeScore: number;
  awayScore: number;
  settledAt?: string;
  resultSource?: string;
  modelVersion?: string;
  inputCoverage?: number;
  isCorrect: boolean;
  brierStandardSum: number;
  brierHalfSum: number;
  logLoss?: number;
  status: 'eligible' | 'excluded';
  exclusionReason?: string;
}

export interface AuditedPerformanceReport {
  evaluatedCount: number;
  correctCount: number;
  accuracyPct: number | null;
  accuracy95CiPct: { low: number; high: number } | null;
  meanBrierStandardSum: number | null;
  meanBrierHalfSum: number | null;
  meanLogLoss: number | null;
  uniformBaselineBrier: number;
  evaluations: AuditedPredictionEvaluation[];
  excludedCount: number;
  pendingCount: number;
  minSample: number;
  isSampleSufficient: boolean;
}

/**
 * Evaluates performance strictly across immutable pre-kickoff predictions joined
 * with verified settled results according to the 7-point audit integrity protocol:
 * 1. Immutable prediction record exists
 * 2. Recorded freeze timestamp strictly before kickoff
 * 3. Deterministic 1-to-1 join to verified settled result
 * 4. Result has trusted provenance and valid non-negative integer scores
 * 5. Probability distribution contains finite values summing to ~100% (+/- 1.5%)
 * 6. Deduplication ensures prediction and result are counted at most once
 * 7. Verified pre-match feature evidence (inputCoverage > 0)
 */
export function evaluateAuditedPredictionPerformance(
  predictions: PredictionRecord[],
  settledResults: HistoricalMatchResult[],
  minSample = 30
): AuditedPerformanceReport {
  const settledMap = new Map<string, HistoricalMatchResult>();
  const duplicateSettledIds = new Set<string>();
  for (const r of settledResults || []) {
    if (!r?.id || !Number.isFinite(r.homeScore) || !Number.isFinite(r.awayScore) || !r.actualOutcome) continue;
    const id = String(r.id);
    if (settledMap.has(id) || duplicateSettledIds.has(id)) {
      settledMap.delete(id);
      duplicateSettledIds.add(id);
      continue;
    }
    settledMap.set(id, r);
  }

  const evaluations: AuditedPredictionEvaluation[] = [];
  const seenFixtureIds = new Set<string>();
  const seenSettledIds = new Set<string>();
  let correctCount = 0;
  let totalBrierStandard = 0;
  let totalBrierHalf = 0;
  let totalLogLoss = 0;
  let eligibleCount = 0;
  let excludedCount = 0;
  let pendingCount = 0;

  for (const pred of predictions || []) {
    if (!pred || !pred.fixtureId) {
      excludedCount++;
      continue;
    }

    if (seenFixtureIds.has(pred.fixtureId)) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: pred.probabilities,
        probabilitySum: (pred.probabilities?.home || 0) + (pred.probabilities?.draw || 0) + (pred.probabilities?.away || 0),
        predictedOutcome: pred.predicted,
        actualOutcome: 'draw',
        homeScore: 0,
        awayScore: 0,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Duplicate prediction entry in log',
      });
      excludedCount++;
      continue;
    }
    seenFixtureIds.add(pred.fixtureId);

    const kickoffMs = Date.parse(pred.kickoffTime);
    const frozenMs = Date.parse(pred.frozenAt);

    if (!Number.isFinite(kickoffMs) || !Number.isFinite(frozenMs)) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: pred.probabilities,
        probabilitySum: 0,
        predictedOutcome: pred.predicted,
        actualOutcome: 'draw',
        homeScore: 0,
        awayScore: 0,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Invalid timestamp format',
      });
      excludedCount++;
      continue;
    }

    if (frozenMs >= kickoffMs) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: pred.probabilities,
        probabilitySum: (pred.probabilities?.home || 0) + (pred.probabilities?.draw || 0) + (pred.probabilities?.away || 0),
        predictedOutcome: pred.predicted,
        actualOutcome: 'draw',
        homeScore: 0,
        awayScore: 0,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Prediction timestamp not strictly before kickoff',
      });
      excludedCount++;
      continue;
    }

    const probs = pred.probabilities;
    const pVals = [probs?.home, probs?.draw, probs?.away];
    const pSum = pVals.reduce((a, b) => (a || 0) + (b || 0), 0);
    if (pVals.some((v) => !Number.isFinite(v) || (v as number) < 0 || (v as number) > 100) || Math.abs(pSum - 100) > 1.5) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: pred.probabilities,
        probabilitySum: pSum,
        predictedOutcome: pred.predicted,
        actualOutcome: 'draw',
        homeScore: 0,
        awayScore: 0,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Invalid probability vector: must be non-negative and sum to ~100%',
      });
      excludedCount++;
      continue;
    }

    // Pre-match feature evidence requirement
    if (!Number.isFinite(pred.inputCoverage) || pred.inputCoverage <= 0 || pred.inputCoverage > 1) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: pred.probabilities,
        probabilitySum: pSum,
        predictedOutcome: pred.predicted,
        actualOutcome: 'draw',
        homeScore: 0,
        awayScore: 0,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Prediction lacks valid verified pre-match feature evidence (inputCoverage must be finite and > 0)',
      });
      excludedCount++;
      continue;
    }

    if (duplicateSettledIds.has(pred.fixtureId)) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: probs,
        probabilitySum: pSum,
        predictedOutcome: pred.predicted,
        actualOutcome: 'draw',
        homeScore: 0,
        awayScore: 0,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Multiple settled result records share this fixture ID',
      });
      excludedCount++;
      continue;
    }

    const settled = settledMap.get(pred.fixtureId);
    if (!settled) {
      pendingCount++;
      continue;
    }

    if (!hasTrustedSettlementProvenance(settled)) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: probs,
        probabilitySum: pSum,
        predictedOutcome: pred.predicted,
        actualOutcome: settled.actualOutcome,
        homeScore: settled.homeScore,
        awayScore: settled.awayScore,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Settled result lacks recognized provider or manual-upload provenance',
      });
      excludedCount++;
      continue;
    }

    // Ensure settled result has not already been paired
    if (seenSettledIds.has(String(settled.id))) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: pred.probabilities,
        probabilitySum: pSum,
        predictedOutcome: pred.predicted,
        actualOutcome: settled.actualOutcome,
        homeScore: settled.homeScore,
        awayScore: settled.awayScore,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Settled result already paired with another prediction',
      });
      excludedCount++;
      continue;
    }
    seenSettledIds.add(String(settled.id));

    // Provenance and score validity
    if (!Number.isInteger(settled.homeScore) || !Number.isInteger(settled.awayScore) || settled.homeScore < 0 || settled.awayScore < 0) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: pred.probabilities,
        probabilitySum: pSum,
        predictedOutcome: pred.predicted,
        actualOutcome: settled.actualOutcome,
        homeScore: settled.homeScore,
        awayScore: settled.awayScore,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Settled result has invalid final scores',
      });
      excludedCount++;
      continue;
    }

    const scoreOutcome = settled.homeScore > settled.awayScore
      ? 'home'
      : settled.homeScore < settled.awayScore
        ? 'away'
        : 'draw';
    if (settled.actualOutcome !== scoreOutcome) {
      evaluations.push({
        fixtureId: pred.fixtureId,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        league: pred.league,
        kickoffTime: pred.kickoffTime,
        frozenAt: pred.frozenAt,
        probabilities: probs,
        probabilitySum: pSum,
        predictedOutcome: pred.predicted,
        actualOutcome: settled.actualOutcome,
        homeScore: settled.homeScore,
        awayScore: settled.awayScore,
        modelVersion: pred.modelVersion,
        inputCoverage: pred.inputCoverage,
        isCorrect: false,
        brierStandardSum: 0,
        brierHalfSum: 0,
        status: 'excluded',
        exclusionReason: 'Recorded actual outcome conflicts with the final score',
      });
      excludedCount++;
      continue;
    }

    const actual = settled.actualOutcome;
    const isCorrect = pred.predicted === actual;
    if (isCorrect) correctCount++;

    const brier = calculateMultiClassBrierScore(probs, actual);
    totalBrierStandard += brier.standardSum;
    totalBrierHalf += brier.halfSum;

    // Log-loss for 3-way multiclass evaluation: -ln(p_actual)
    const pActual = (actual === 'home' ? probs.home : actual === 'draw' ? probs.draw : probs.away) / 100;
    const clampedP = Math.max(1e-15, Math.min(1 - 1e-15, pActual));
    const logLoss = -Math.log(clampedP);
    totalLogLoss += logLoss;
    eligibleCount++;

    const resultSource = (settled as any).source || (settled as any).automationSource ||
      (settled.id.startsWith('sportapiai_') ? 'SportAPI.ai' : settled.id.startsWith('pitchapi_') ? 'PitchAPI' : 'Settled Ledger');

    evaluations.push({
      fixtureId: pred.fixtureId,
      homeTeam: pred.homeTeam || settled.fixture?.homeTeam?.name,
      awayTeam: pred.awayTeam || settled.fixture?.awayTeam?.name,
      league: pred.league || settled.fixture?.league,
      kickoffTime: pred.kickoffTime,
      frozenAt: pred.frozenAt,
      probabilities: probs,
      probabilitySum: pSum,
      predictedOutcome: pred.predicted,
      actualOutcome: actual,
      homeScore: settled.homeScore,
      awayScore: settled.awayScore,
      settledAt: (settled as any).settledAt,
      resultSource,
      modelVersion: pred.modelVersion,
      inputCoverage: pred.inputCoverage,
      isCorrect,
      brierStandardSum: brier.standardSum,
      brierHalfSum: brier.halfSum,
      logLoss,
      status: 'eligible',
    });
  }

  const ci = eligibleCount > 0 ? wilsonInterval(correctCount, eligibleCount) : null;
  const accuracy95CiPct = ci ? { low: Math.round(ci.low * 1000) / 10, high: Math.round(ci.high * 1000) / 10 } : null;

  return {
    evaluatedCount: eligibleCount,
    correctCount,
    accuracyPct: eligibleCount > 0 ? (correctCount / eligibleCount) * 100 : null,
    accuracy95CiPct,
    meanBrierStandardSum: eligibleCount > 0 ? totalBrierStandard / eligibleCount : null,
    meanBrierHalfSum: eligibleCount > 0 ? totalBrierHalf / eligibleCount : null,
    meanLogLoss: eligibleCount > 0 ? totalLogLoss / eligibleCount : null,
    uniformBaselineBrier: 2 / 3,
    evaluations,
    excludedCount,
    pendingCount,
    minSample,
    isSampleSufficient: eligibleCount >= minSample,
  };
}

/**
 * Returns yesterday's ISO date string (YYYY-MM-DD) based on reference date
 */
export function getYesterdayDateString(baseDate = new Date()): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - 1);
  return toIsoDateString(d);
}

export interface DetailedMatchEvaluation extends HistoricalEvaluation {
  date: string;
  notes?: string;
  predictedWinnerLabel: string;
  actualOutcomeLabel: string;
  pickProbability: number;
  pickFairOdds: string;
  modelLeaderProbabilityPct: number;
}

/**
 * Evaluates performance metrics strictly across authentic historical match results.
 * Zero synthetic generation. Strict calendar matching for yesterday.
 */
export function calculateEnginePerformance(
  results: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  weights: EngineWeights = DEFAULT_ENGINE_WEIGHTS,
  referenceDate = new Date()
): {
  summary: EnginePerformanceSummary;
  yesterdayEvaluations: DetailedMatchEvaluation[];
  latestSettledEvaluations: DetailedMatchEvaluation[];
  latestSettledDate: string;
  allEvaluations: DetailedMatchEvaluation[];
  availableDates: string[];
} {
  const yesterdayStr = getYesterdayDateString(referenceDate);

  const allEvaluations: DetailedMatchEvaluation[] = [];
  let totalBrier = 0;
  let allCorrect = 0;

  const validResults = (results || []).filter(
    (m): m is HistoricalMatchResult => Boolean(m && m.id && m.fixture && m.fixture.id && m.fixture.homeTeam && m.fixture.awayTeam && m.actualOutcome) && fixtureHasEvidence(m.fixture)
  );

  let homePickTotal = 0;
  let homePickCorrect = 0;
  let awayPickTotal = 0;
  let awayPickCorrect = 0;
  let drawPickTotal = 0;
  let drawPickCorrect = 0;

  for (const match of validResults) {
    const pred = evaluateFixturePrediction(match.fixture, 'none', weights);
    if (pred.predictedWinner === 'none') continue;
    const pH = pred.homeWinPct / 100;
    const pD = pred.drawPct / 100;
    const pA = pred.awayWinPct / 100;

    const yH = match.actualOutcome === 'home' ? 1 : 0;
    const yD = match.actualOutcome === 'draw' ? 1 : 0;
    const yA = match.actualOutcome === 'away' ? 1 : 0;

    const matchBrier = ((pH - yH) ** 2 + (pD - yD) ** 2 + (pA - yA) ** 2) / 2;
    totalBrier += matchBrier;

    const isCorrect = pred.predictedWinner === match.actualOutcome;
    if (isCorrect) {
      allCorrect++;
    }

    if (pred.predictedWinner === 'home') {
      homePickTotal++;
      if (isCorrect) homePickCorrect++;
    } else if (pred.predictedWinner === 'away') {
      awayPickTotal++;
      if (isCorrect) awayPickCorrect++;
    } else if (pred.predictedWinner === 'draw') {
      drawPickTotal++;
      if (isCorrect) drawPickCorrect++;
    }

    const pickProb =
      pred.predictedWinner === 'home'
        ? pred.homeWinPct
        : pred.predictedWinner === 'away'
        ? pred.awayWinPct
        : pred.drawPct;

    const pickOdds = (100 / Math.max(pickProb, 1)).toFixed(2);

    const formatWinner = (w: 'none' | 'home' | 'draw' | 'away') =>
      w === 'home' ? 'Home Win' : w === 'away' ? 'Away Win' : w === 'draw' ? 'Draw' : 'No Pick';

    allEvaluations.push({
      matchId: match.id,
      fixture: match.fixture,
      actualOutcome: match.actualOutcome,
      predictedOutcome: pred.predictedWinner,
      isCorrect,
      probabilities: {
        home: pred.homeWinPct,
        draw: pred.drawPct,
        away: pred.awayWinPct,
      },
      brierScore: matchBrier,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      date: match.date,
      notes: match.notes,
      predictedWinnerLabel: formatWinner(pred.predictedWinner),
      actualOutcomeLabel: formatWinner(match.actualOutcome),
      pickProbability: pickProb,
      pickFairOdds: pickOdds,
      modelLeaderProbabilityPct: pred.modelLeaderProbabilityPct,
    });
  }

  // Strict yesterday calendar matching
  const yesterdayEvaluations = allEvaluations.filter((m) => m.date === yesterdayStr);

  const uniqueDates = Array.from(new Set(allEvaluations.map((m) => m.date))).sort().reverse();
  const latestSettledDate = uniqueDates[0] || yesterdayStr;
  const latestSettledEvaluations = allEvaluations.filter((m) => m.date === latestSettledDate);

  const yesterdayTotal = yesterdayEvaluations.length;
  const yesterdayCorrect = yesterdayEvaluations.filter((m) => m.isCorrect).length;
  const yesterdayWrong = yesterdayTotal - yesterdayCorrect;
  const yesterdayAccuracyPct = yesterdayTotal > 0 ? (yesterdayCorrect / yesterdayTotal) * 100 : null;

  const allTimeTotal = allEvaluations.length;
  const allTimeWrong = allTimeTotal - allCorrect;
  const allTimeAccuracyPct = allTimeTotal > 0 ? (allCorrect / allTimeTotal) * 100 : null;

  const homeWinAccuracyPct = homePickTotal > 0 ? (homePickCorrect / homePickTotal) * 100 : null;
  const awayWinAccuracyPct = awayPickTotal > 0 ? (awayPickCorrect / awayPickTotal) * 100 : null;
  const drawAccuracyPct = drawPickTotal > 0 ? (drawPickCorrect / drawPickTotal) * 100 : null;

  const summary: EnginePerformanceSummary = {
    yesterdayDate: yesterdayStr,
    yesterdayTotal,
    yesterdayCorrect,
    yesterdayWrong,
    yesterdayAccuracyPct: yesterdayAccuracyPct === null ? null : Math.round(yesterdayAccuracyPct * 10) / 10,
    allTimeTotal,
    allTimeCorrect: allCorrect,
    allTimeWrong,
    allTimeAccuracyPct: allTimeAccuracyPct === null ? null : Math.round(allTimeAccuracyPct * 10) / 10,
    homeWinAccuracyPct: homeWinAccuracyPct === null ? null : Math.round(homeWinAccuracyPct * 10) / 10,
    awayWinAccuracyPct: awayWinAccuracyPct === null ? null : Math.round(awayWinAccuracyPct * 10) / 10,
    drawAccuracyPct: drawAccuracyPct === null ? null : Math.round(drawAccuracyPct * 10) / 10,
    brierLoss: allTimeTotal > 0 ? Math.round((totalBrier / allTimeTotal) * 1000) / 1000 : null,
  };

  return {
    summary,
    yesterdayEvaluations,
    latestSettledEvaluations,
    latestSettledDate,
    allEvaluations,
    availableDates: uniqueDates,
  };
}
