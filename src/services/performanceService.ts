import {
  HistoricalMatchResult,
  BacktestEvaluation,
  EngineWeights,
  EnginePerformanceSummary,
} from '../types/soccer';
import { evaluateFixturePrediction, DEFAULT_ENGINE_WEIGHTS } from '../engine/rulesEngine';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';
import { toIsoDateString } from '../utils/dateFilterUtils';

/**
 * Returns yesterday's ISO date string (YYYY-MM-DD) based on reference date
 */
export function getYesterdayDateString(baseDate = new Date()): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - 1);
  return toIsoDateString(d);
}

export interface DetailedMatchEvaluation extends BacktestEvaluation {
  date: string;
  notes?: string;
  predictedWinnerLabel: string;
  actualOutcomeLabel: string;
  pickProbability: number;
  pickFairOdds: string;
  confidenceScore: number;
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
    (m): m is HistoricalMatchResult => Boolean(m && m.id && m.fixture && m.fixture.id && m.fixture.homeTeam && m.fixture.awayTeam && m.actualOutcome)
  );

  let homePickTotal = 0;
  let homePickCorrect = 0;
  let awayPickTotal = 0;
  let awayPickCorrect = 0;
  let drawPickTotal = 0;
  let drawPickCorrect = 0;

  for (const match of validResults) {
    const pred = evaluateFixturePrediction(match.fixture, 'none', weights);
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
    } else {
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

    const formatWinner = (w: 'home' | 'draw' | 'away') =>
      w === 'home' ? 'Home Win' : w === 'away' ? 'Away Win' : 'Draw';

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
      confidenceScore: pred.confidenceScore,
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
  const yesterdayAccuracyPct = yesterdayTotal > 0 ? (yesterdayCorrect / yesterdayTotal) * 100 : 0;

  const allTimeTotal = allEvaluations.length;
  const allTimeWrong = allTimeTotal - allCorrect;
  const allTimeAccuracyPct = allTimeTotal > 0 ? (allCorrect / allTimeTotal) * 100 : 0;

  const homeWinAccuracyPct = homePickTotal > 0 ? (homePickCorrect / homePickTotal) * 100 : 0;
  const awayWinAccuracyPct = awayPickTotal > 0 ? (awayPickCorrect / awayPickTotal) * 100 : 0;
  const drawAccuracyPct = drawPickTotal > 0 ? (drawPickCorrect / drawPickTotal) * 100 : 0;

  const summary: EnginePerformanceSummary = {
    yesterdayDate: yesterdayStr,
    yesterdayTotal,
    yesterdayCorrect,
    yesterdayWrong,
    yesterdayAccuracyPct: Math.round(yesterdayAccuracyPct * 10) / 10,
    allTimeTotal,
    allTimeCorrect: allCorrect,
    allTimeWrong,
    allTimeAccuracyPct: Math.round(allTimeAccuracyPct * 10) / 10,
    homeWinAccuracyPct: Math.round(homeWinAccuracyPct * 10) / 10,
    awayWinAccuracyPct: Math.round(awayWinAccuracyPct * 10) / 10,
    drawAccuracyPct: Math.round(drawAccuracyPct * 10) / 10,
    brierLoss: allTimeTotal > 0 ? Math.round((totalBrier / allTimeTotal) * 1000) / 1000 : 0,
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
