import {
  EngineWeights,
  HistoricalMatchResult,
  BacktestEvaluation,
  LearningModelState,
  AITacticalSynthesis,
} from '../types/soccer';
import { evaluateFixturePrediction, DEFAULT_ENGINE_WEIGHTS } from './rulesEngine';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';

const STORAGE_KEY_LEARNING_STATE = 'football_pulse_learning_state_v1';

export const BOUNDS_ENGINE_WEIGHTS: Record<keyof EngineWeights, { min: number; max: number }> = {
  stakesMotivationBoost: { min: 1.0, max: 4.5 },
  deadRubberPenalty: { min: 0.08, max: 0.35 },
  rankPointsMultiplier: { min: 0.20, max: 0.80 },
  formWinPoints: { min: 0.50, max: 2.20 },
  formDrawPoints: { min: 0.15, max: 0.90 },
  homeAdvantageBaseline: { min: 7.0, max: 13.5 },
  awayAdvantageBaseline: { min: 6.0, max: 11.5 },
  homeDominanceBonus: { min: 0.05, max: 0.28 },
  awayFormBonus: { min: 0.6, max: 2.8 },
  tacticalPossessionWeight: { min: 0.05, max: 0.35 },
  tacticalShotsWeight: { min: 0.20, max: 0.80 },
  h2hMultiplier: { min: 3.0, max: 9.0 },
  fatiguePenaltyRate: { min: 0.06, max: 0.28 },
  volatilityDrawBoost: { min: 0.50, max: 0.85 },
  favouriteWinFloor: { min: 50, max: 65 },
  drawEquilibriumMargin: { min: 2.0, max: 8.0 },
  drawEquilibriumBoost: { min: 30.0, max: 46.0 },
};

/**
 * Evaluates the entire historical dataset against a specific set of engine weights.
 * Computes accuracy, individual match correctness, and Brier Loss.
 */
export function evaluateHistoricalBacktest(
  results: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  weights: EngineWeights = DEFAULT_ENGINE_WEIGHTS
): {
  evaluations: BacktestEvaluation[];
  accuracyPct: number;
  brierLoss: number;
  correctCount: number;
  totalCount: number;
} {
  const evaluations: BacktestEvaluation[] = [];
  let totalBrier = 0;
  let correctCount = 0;

  for (const match of results) {
    const prediction = evaluateFixturePrediction(match.fixture, 'none', weights);
    const pH = prediction.homeWinPct / 100;
    const pD = prediction.drawPct / 100;
    const pA = prediction.awayWinPct / 100;

    const yH = match.actualOutcome === 'home' ? 1 : 0;
    const yD = match.actualOutcome === 'draw' ? 1 : 0;
    const yA = match.actualOutcome === 'away' ? 1 : 0;

    // Multi-class Brier Score component
    const matchBrier = ((pH - yH) ** 2 + (pD - yD) ** 2 + (pA - yA) ** 2) / 2;
    totalBrier += matchBrier;

    const isCorrect = prediction.predictedWinner === match.actualOutcome;
    if (isCorrect) {
      correctCount++;
    }

    evaluations.push({
      matchId: match.id,
      fixture: match.fixture,
      actualOutcome: match.actualOutcome,
      predictedOutcome: prediction.predictedWinner,
      isCorrect,
      probabilities: {
        home: prediction.homeWinPct,
        draw: prediction.drawPct,
        away: prediction.awayWinPct,
      },
      brierScore: matchBrier,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    });
  }

  const totalCount = results.length;
  const accuracyPct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
  const brierLoss = totalCount > 0 ? totalBrier / totalCount : 0;

  return {
    evaluations,
    accuracyPct: Math.round(accuracyPct * 10) / 10,
    brierLoss: Math.round(brierLoss * 1000) / 1000,
    correctCount,
    totalCount,
  };
}

/**
 * Runs 1 training epoch across the historical results dataset using coordinate gradient descent.
 * Adjusts rule weights in the direction of minimizing Brier loss and maximizing outcome accuracy.
 */
export function trainSingleEpoch(
  currentWeights: EngineWeights,
  results: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  learningRate: number = 0.04
): {
  updatedWeights: EngineWeights;
  oldAccuracy: number;
  newAccuracy: number;
  oldLoss: number;
  newLoss: number;
  deltas: Record<keyof EngineWeights, number>;
} {
  const baseEval = evaluateHistoricalBacktest(results, currentWeights);
  const updatedWeights: EngineWeights = { ...currentWeights };
  const deltas: Partial<Record<keyof EngineWeights, number>> = {};

  const keys = Object.keys(BOUNDS_ENGINE_WEIGHTS) as (keyof EngineWeights)[];

  for (const key of keys) {
    const currentVal = currentWeights[key];
    const bounds = BOUNDS_ENGINE_WEIGHTS[key];
    const stepSize = Math.max((bounds.max - bounds.min) * learningRate * 0.4, 0.01);

    // Test positive step
    const testPlus = Math.min(bounds.max, currentVal + stepSize);
    const evalPlus = evaluateHistoricalBacktest(results, { ...updatedWeights, [key]: testPlus });

    // Test negative step
    const testMinus = Math.max(bounds.min, currentVal - stepSize);
    const evalMinus = evaluateHistoricalBacktest(results, { ...updatedWeights, [key]: testMinus });

    let bestVal = currentVal;
    let minLoss = baseEval.brierLoss;

    if (evalPlus.brierLoss < minLoss && evalPlus.accuracyPct >= baseEval.accuracyPct - 2) {
      minLoss = evalPlus.brierLoss;
      bestVal = testPlus;
    }
    if (evalMinus.brierLoss < minLoss && evalMinus.accuracyPct >= baseEval.accuracyPct - 2) {
      bestVal = testMinus;
    }

    // Apply smoothing momentum
    const smoothedVal = Number((currentVal * 0.7 + bestVal * 0.3).toFixed(3));
    updatedWeights[key] = Math.min(bounds.max, Math.max(bounds.min, smoothedVal));

    const baselineVal = DEFAULT_ENGINE_WEIGHTS[key];
    const deltaPct = baselineVal !== 0
      ? Math.round(((updatedWeights[key] - baselineVal) / baselineVal) * 1000) / 10
      : 0;
    deltas[key] = deltaPct;
  }

  const finalEval = evaluateHistoricalBacktest(results, updatedWeights);

  return {
    updatedWeights,
    oldAccuracy: baseEval.accuracyPct,
    newAccuracy: finalEval.accuracyPct,
    oldLoss: baseEval.brierLoss,
    newLoss: finalEval.brierLoss,
    deltas: deltas as Record<keyof EngineWeights, number>,
  };
}

/**
 * Runs multiple epochs sequentially to converge on optimal weights
 */
export function trainMultipleEpochs(
  startWeights: EngineWeights,
  epochs: number = 5,
  results: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): {
  finalWeights: EngineWeights;
  initialLoss: number;
  finalLoss: number;
  initialAccuracy: number;
  finalAccuracy: number;
  epochsCompleted: number;
  lossHistory: number[];
} {
  let currentWeights = { ...startWeights };
  const initialEval = evaluateHistoricalBacktest(results, currentWeights);
  const lossHistory: number[] = [initialEval.brierLoss];

  for (let i = 0; i < epochs; i++) {
    // Dynamic annealing learning rate
    const lr = Math.max(0.015, 0.05 * (1 - i / (epochs + 1)));
    const epochResult = trainSingleEpoch(currentWeights, results, lr);
    currentWeights = epochResult.updatedWeights;
    lossHistory.push(epochResult.newLoss);
  }

  const finalEval = evaluateHistoricalBacktest(results, currentWeights);

  return {
    finalWeights: currentWeights,
    initialLoss: initialEval.brierLoss,
    finalLoss: finalEval.brierLoss,
    initialAccuracy: initialEval.accuracyPct,
    finalAccuracy: finalEval.accuracyPct,
    epochsCompleted: epochs,
    lossHistory,
  };
}

/**
 * Generates default initial state with computed baselines
 */
export function getInitialLearningState(): LearningModelState {
  const baselineEval = evaluateHistoricalBacktest(HISTORICAL_MATCH_RESULTS, DEFAULT_ENGINE_WEIGHTS);

  return {
    weights: { ...DEFAULT_ENGINE_WEIGHTS },
    baselineWeights: { ...DEFAULT_ENGINE_WEIGHTS },
    totalEpochsTrained: 0,
    accuracyPct: baselineEval.accuracyPct,
    baselineAccuracyPct: baselineEval.accuracyPct,
    brierLoss: baselineEval.brierLoss,
    baselineBrierLoss: baselineEval.brierLoss,
    lastTrainedAt: new Date().toISOString(),
    isAutoLearningEnabled: true,
    recentLossHistory: [baselineEval.brierLoss],
    aiTacticalSynthesis: {
      summary: `Engine calibrated against ${HISTORICAL_MATCH_RESULTS.length} comprehensive historical match outcomes across competitive leagues.`,
      recommendations: [
        'Tactical shot differential is the highest predictor of victory in open matches.',
        'High-volatility leagues benefit from variance compression to dampen overconfident away predictions.',
        'Midweek continental travel fatigue penalty accurately predicts weekend road fatigue.',
      ],
      ruleEfficiency: [
        { rule: 'Rule 1: Motivation Stakes', impact: '+2.5 pts boost', status: 'optimal' },
        { rule: 'Rule 3: Home Dominance', impact: '+15% home multiplier', status: 'optimal' },
        { rule: 'Rule 5: Shot/Possession', impact: '+3.5 pts modifier', status: 'optimal' },
        { rule: 'Rule 6: 72h Fatigue', impact: '-15% road fatigue', status: 'optimal' },
        { rule: 'Rule 7: Volatility Cap', impact: '0.68 compression', status: 'optimal' },
        { rule: 'Rule 8: Favourite Floor', impact: '55% win floor', status: 'optimal' },
        { rule: 'Rule 9: Draw Equilibrium', impact: '≤5% parity margin', status: 'optimal' },
      ],
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Loads learning state from localStorage with fallback to default
 */
export function loadLearningState(): LearningModelState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEARNING_STATE);
    if (!raw) return getInitialLearningState();
    const parsed = JSON.parse(raw) as LearningModelState;
    if (!parsed || !parsed.weights) return getInitialLearningState();
    return parsed;
  } catch {
    return getInitialLearningState();
  }
}

/**
 * Saves learning state to localStorage AND durable server API storage
 */
export function saveLearningState(state: LearningModelState): void {
  try {
    localStorage.setItem(STORAGE_KEY_LEARNING_STATE, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to persist learning state to localStorage:', err);
  }

  // Asynchronously persist to server so data is never lost across browser cache clears or APK updates
  if (typeof fetch !== 'undefined') {
    fetch('/api/learning-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    }).catch(() => {
      // Offline fallback is expected in standalone mode
    });
  }
}

/**
 * Asynchronously loads learning state from server if available and newer,
 * otherwise falls back to local storage
 */
export async function loadLearningStateWithServerFallback(): Promise<LearningModelState> {
  const localState = loadLearningState();

  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch('/api/learning-state');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.state && data.state.weights) {
          const serverState = data.state as LearningModelState;
          // If server state has equal or more epochs trained, take the server's state
          if (serverState.totalEpochsTrained >= localState.totalEpochsTrained) {
            localStorage.setItem(STORAGE_KEY_LEARNING_STATE, JSON.stringify(serverState));
            return serverState;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return localState;
}
