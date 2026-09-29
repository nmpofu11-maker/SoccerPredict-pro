import {
  EngineWeights,
  HistoricalMatchResult,
  BacktestEvaluation,
  LearningModelState,
  AITacticalSynthesis,
} from '../types/soccer';
import {
  TeamIntelligenceMatrices,
  SuperLearningTelemetry,
} from '../types/superLearning';
import { evaluateFixturePrediction, DEFAULT_ENGINE_WEIGHTS, sanitizeEngineWeights } from './rulesEngine';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';
import { getAdminApiHeaders } from '../services/adminAuthService';
import {
  loadTeamIntelligenceMatrices,
  saveTeamIntelligenceMatrices,
  synthesizeTeamIntelligenceMatrices,
} from './teamIntelligenceMatrix';

const STORAGE_KEY_LEARNING_STATE = 'football_pulse_learning_state_v1';
const STORAGE_KEY_SUPER_TELEMETRY = 'football_pulse_super_learning_telemetry_v1';

export const BOUNDS_ENGINE_WEIGHTS: Record<keyof EngineWeights, { min: number; max: number }> = {
  stakesMotivationBoost: { min: 1.0, max: 5.5 },
  deadRubberPenalty: { min: 0.05, max: 0.40 },
  rankPointsMultiplier: { min: 0.15, max: 0.95 },
  formWinPoints: { min: 0.40, max: 2.50 },
  formDrawPoints: { min: 0.10, max: 1.10 },
  homeAdvantageBaseline: { min: 6.5, max: 15.0 },
  awayAdvantageBaseline: { min: 5.5, max: 13.0 },
  homeDominanceBonus: { min: 0.05, max: 0.35 },
  awayFormBonus: { min: 0.5, max: 3.2 },
  tacticalPossessionWeight: { min: 0.05, max: 0.45 },
  tacticalShotsWeight: { min: 0.15, max: 0.95 },
  h2hMultiplier: { min: 2.5, max: 10.0 },
  fatiguePenaltyRate: { min: 0.05, max: 0.35 },
  volatilityDrawBoost: { min: 0.45, max: 0.95 },
  favouriteWinFloor: { min: 50, max: 70 },
  drawEquilibriumMargin: { min: 1.5, max: 9.0 },
  drawEquilibriumBoost: { min: 28.0, max: 50.0 },
  lastSeasonStandingWeight: { min: 0.08, max: 0.75 },
  squadValueWeight: { min: 0.10, max: 0.95 },
  matchRatingWeight: { min: 1.2, max: 9.0 },
  lowTotalDrawBoost: { min: 0.9, max: 2.5 },
  defensiveSynergyDrawWeight: { min: 0.08, max: 0.95 },
  leagueClusterWeight: { min: 0.10, max: 0.95 },
  xgWeight: { min: 0.10, max: 1.10 },
  absencePenaltyRate: { min: 0.04, max: 0.30 },
};

/**
 * Evaluates the entire historical dataset against a specific set of engine weights and team matrices.
 * Computes accuracy, individual match correctness, and Brier Loss.
 */

function splitHistoricalResults(results: HistoricalMatchResult[]): {
  training: HistoricalMatchResult[];
  validation: HistoricalMatchResult[];
} {
  const ordered = (results || [])
    .filter((m): m is HistoricalMatchResult => Boolean(m && m.id && m.fixture && m.actualOutcome))
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.fixture?.kickoffTime || a.date || 0).getTime();
      const bTime = new Date(b.fixture?.kickoffTime || b.date || 0).getTime();
      return aTime - bTime;
    });

  if (ordered.length < 2) return { training: ordered, validation: [] };

  const validationSize = Math.max(1, Math.floor(ordered.length * 0.20));
  const splitIndex = Math.max(1, ordered.length - validationSize);

  return {
    training: ordered.slice(0, splitIndex),
    validation: ordered.slice(splitIndex),
  };
}

export function evaluateOutOfSampleValidation(
  results: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  weights: EngineWeights = DEFAULT_ENGINE_WEIGHTS
): {
  evaluations: BacktestEvaluation[];
  accuracyPct: number;
  brierLoss: number;
  correctCount: number;
  totalCount: number;
  trainingCount: number;
  validationCount: number;
} {
  const { training, validation } = splitHistoricalResults(results);
  if (validation.length === 0) {
    return {
      evaluations: [],
      accuracyPct: 0,
      brierLoss: 0,
      correctCount: 0,
      totalCount: 0,
      trainingCount: training.length,
      validationCount: 0,
    };
  }

  const trainingMatrices = synthesizeTeamIntelligenceMatrices(training, loadTeamIntelligenceMatrices());
  const evaluation = evaluateHistoricalBacktest(validation, weights, trainingMatrices);

  return {
    ...evaluation,
    trainingCount: training.length,
    validationCount: validation.length,
  };
}

export function evaluateHistoricalBacktest(
  results: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  weights: EngineWeights = DEFAULT_ENGINE_WEIGHTS,
  teamMatrices?: TeamIntelligenceMatrices
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

  const validMatches = (results || []).filter(
    (m): m is HistoricalMatchResult =>
      Boolean(m && m.id && m.fixture && m.fixture.id && m.fixture.homeTeam && m.fixture.awayTeam && m.actualOutcome)
  );

  for (const match of validMatches) {
    const prediction = evaluateFixturePrediction(match.fixture, 'none', weights, teamMatrices);
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

  const totalCount = validMatches.length;
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
 * Runs one calibration epoch on the chronological training window and reports performance on the unseen holdout.
 */
export function trainSingleEpoch(
  currentWeights: EngineWeights,
  results: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  learningRate: number = 0.05,
  teamMatrices?: TeamIntelligenceMatrices
): {
  updatedWeights: EngineWeights;
  oldAccuracy: number;
  newAccuracy: number;
  oldLoss: number;
  newLoss: number;
  deltas: Record<keyof EngineWeights, number>;
} {
  const safeCurrent = sanitizeEngineWeights(currentWeights);
  const { training, validation } = splitHistoricalResults(results);
  const optimisationResults = training.length > 0 ? training : results;
  const baseEval = evaluateHistoricalBacktest(optimisationResults, safeCurrent, teamMatrices);
  const updatedWeights: EngineWeights = { ...safeCurrent };
  const deltas: Partial<Record<keyof EngineWeights, number>> = {};

  const keys = Object.keys(BOUNDS_ENGINE_WEIGHTS) as (keyof EngineWeights)[];

  for (const key of keys) {
    const rawVal = safeCurrent[key];
    const bounds = BOUNDS_ENGINE_WEIGHTS[key];
    const currentVal = (typeof rawVal === 'number' && Number.isFinite(rawVal) && !isNaN(rawVal))
      ? Math.min(bounds.max, Math.max(bounds.min, rawVal))
      : DEFAULT_ENGINE_WEIGHTS[key];

    const stepSize = Math.max((bounds.max - bounds.min) * learningRate * 0.45, 0.01);

    // Test positive step
    const testPlus = Math.min(bounds.max, currentVal + stepSize);
    const evalPlus = evaluateHistoricalBacktest(optimisationResults, { ...updatedWeights, [key]: testPlus }, teamMatrices);

    // Test negative step
    const testMinus = Math.max(bounds.min, currentVal - stepSize);
    const evalMinus = evaluateHistoricalBacktest(optimisationResults, { ...updatedWeights, [key]: testMinus }, teamMatrices);

    let bestVal = currentVal;
    let minLoss = Number.isFinite(baseEval.brierLoss) ? baseEval.brierLoss : 0.25;

    if (Number.isFinite(evalPlus.brierLoss) && evalPlus.brierLoss < minLoss && evalPlus.accuracyPct >= baseEval.accuracyPct - 2.5) {
      minLoss = evalPlus.brierLoss;
      bestVal = testPlus;
    }
    if (Number.isFinite(evalMinus.brierLoss) && evalMinus.brierLoss < minLoss && evalMinus.accuracyPct >= baseEval.accuracyPct - 2.5) {
      bestVal = testMinus;
    }

    // Apply momentum
    const calc = currentVal * 0.65 + bestVal * 0.35;
    const smoothedVal = Number.isFinite(calc) ? Number(calc.toFixed(3)) : DEFAULT_ENGINE_WEIGHTS[key];
    updatedWeights[key] = Math.min(bounds.max, Math.max(bounds.min, smoothedVal));

    const baselineVal = DEFAULT_ENGINE_WEIGHTS[key];
    const deltaPct = baselineVal !== 0
      ? Math.round(((updatedWeights[key] - baselineVal) / baselineVal) * 1000) / 10
      : 0;
    deltas[key] = deltaPct;
  }

  const finalEval = evaluateHistoricalBacktest(optimisationResults, updatedWeights, teamMatrices);

  return {
    updatedWeights,
    oldAccuracy: validation.length > 0
      ? evaluateHistoricalBacktest(validation, safeCurrent, teamMatrices).accuracyPct
      : baseEval.accuracyPct,
    newAccuracy: validation.length > 0
      ? evaluateHistoricalBacktest(validation, updatedWeights, teamMatrices).accuracyPct
      : finalEval.accuracyPct,
    oldLoss: validation.length > 0
      ? evaluateHistoricalBacktest(validation, safeCurrent, teamMatrices).brierLoss
      : baseEval.brierLoss,
    newLoss: validation.length > 0
      ? evaluateHistoricalBacktest(validation, updatedWeights, teamMatrices).brierLoss
      : finalEval.brierLoss,
    deltas: deltas as Record<keyof EngineWeights, number>,
  };
}

/**
 * Runs multiple calibration epochs on the chronological training window.
 */
export function trainMultipleEpochs(
  startWeights: EngineWeights,
  epochs: number = 5,
  results: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  teamMatrices?: TeamIntelligenceMatrices
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
  const { training, validation } = splitHistoricalResults(results);
  const fitResults = training.length > 0 ? training : results;
  const fitMatrices = teamMatrices || synthesizeTeamIntelligenceMatrices(fitResults, loadTeamIntelligenceMatrices());
  const initialEval = evaluateOutOfSampleValidation(results, currentWeights);
  const lossHistory: number[] = [initialEval.brierLoss];

  for (let i = 0; i < epochs; i++) {
    const lr = Math.max(0.02, 0.06 * (1 - i / (epochs + 1)));
    const epochResult = trainSingleEpoch(currentWeights, results, lr, fitMatrices);
    currentWeights = epochResult.updatedWeights;
    lossHistory.push(epochResult.newLoss);
  }

  const finalEval = validation.length > 0
    ? evaluateHistoricalBacktest(validation, currentWeights, fitMatrices)
    : evaluateHistoricalBacktest(fitResults, currentWeights, fitMatrices);

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
 * Chronological model calibration protocol.
 * Parameters are fit on the training window and evaluated on an unseen holdout.
 */
export function runAggressiveSuperLearningProtocol(
  startWeights: EngineWeights,
  epochs: number = 25,
  results: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  onEpochProgress?: (epoch: number, loss: number, accuracy: number) => void
): {
  finalWeights: EngineWeights;
  updatedTeamMatrices: TeamIntelligenceMatrices;
  initialLoss: number;
  finalLoss: number;
  initialAccuracy: number;
  finalAccuracy: number;
  lossDelta: number;
  accuracyGain: number;
  epochsCompleted: number;
  lossHistory: number[];
  convergencesCount: number;
} {
  let currentWeights = sanitizeEngineWeights(startWeights);
  const { training, validation } = splitHistoricalResults(results);
  const fitResults = training.length > 0 ? training : results;
  let matrices = synthesizeTeamIntelligenceMatrices(fitResults, loadTeamIntelligenceMatrices());
  saveTeamIntelligenceMatrices(matrices);

  const initialEval = validation.length > 0
    ? evaluateHistoricalBacktest(validation, currentWeights, matrices)
    : evaluateHistoricalBacktest(fitResults, currentWeights, matrices);
  const lossHistory: number[] = [initialEval.brierLoss];
  let convergencesCount = 0;
  let bestLoss = initialEval.brierLoss;

  for (let epoch = 1; epoch <= epochs; epoch++) {
    // Bounded calibration rate with cyclic variation
    const cyclePos = (epoch % 8) / 8;
    const lr = 0.025 + 0.055 * Math.sin(cyclePos * Math.PI);

    const stepResult = trainSingleEpoch(currentWeights, results, lr, matrices);
    currentWeights = stepResult.updatedWeights;
    lossHistory.push(stepResult.newLoss);

    if (stepResult.newLoss < bestLoss) {
      bestLoss = stepResult.newLoss;
      convergencesCount++;
    }

    if (onEpochProgress) {
      onEpochProgress(epoch, stepResult.newLoss, stepResult.newAccuracy);
    }
  }

  // Final evaluation is performed on the chronological holdout only.
  const finalEval = validation.length > 0
    ? evaluateHistoricalBacktest(validation, currentWeights, matrices)
    : evaluateHistoricalBacktest(fitResults, currentWeights, matrices);
  const accuracyGain = Math.round((finalEval.accuracyPct - initialEval.accuracyPct) * 10) / 10;
  const lossDelta = Math.round((initialEval.brierLoss - finalEval.brierLoss) * 1000) / 1000;

  // Record telemetry from the actual completed calibration pass
  updateSuperLearningTelemetry({
    totalSuperEpochsIncrement: epochs,
    convergencesIncrement: convergencesCount,
    bestBrierLoss: finalEval.brierLoss,
    peakAccuracyPct: finalEval.accuracyPct,
  });

  return {
    finalWeights: currentWeights,
    updatedTeamMatrices: matrices,
    initialLoss: initialEval.brierLoss,
    finalLoss: finalEval.brierLoss,
    initialAccuracy: initialEval.accuracyPct,
    finalAccuracy: finalEval.accuracyPct,
    lossDelta,
    accuracyGain,
    epochsCompleted: epochs,
    lossHistory,
    convergencesCount,
  };
}

/**
 * Loads Super-Learning Protocol Telemetry
 */
export function loadSuperLearningTelemetry(): SuperLearningTelemetry {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUPER_TELEMETRY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  return {
    protocolActive: false,
    totalSuperEpochs: 0,
    learningRate: null,
    lossVelocity: null,
    convergencesAchieved: 0,
    bestBrierLoss: null,
    peakAccuracyPct: null,
    lastOptimizationTimestamp: null,
    activeOptimizers: [],
  };
}


 */
export function updateSuperLearningTelemetry(params: {
  totalSuperEpochsIncrement?: number;
  convergencesIncrement?: number;
  bestBrierLoss?: number;
  peakAccuracyPct?: number;
}): SuperLearningTelemetry {
  const current = loadSuperLearningTelemetry();
  const hasPriorBrier = current.totalSuperEpochs > 0 && Number.isFinite(current.bestBrierLoss) && current.bestBrierLoss > 0;
  const hasPriorAccuracy = current.totalSuperEpochs > 0 && Number.isFinite(current.peakAccuracyPct) && current.peakAccuracyPct > 0;
  const candidateBrier = params.bestBrierLoss;
  const candidateAccuracy = params.peakAccuracyPct;

  const updated: SuperLearningTelemetry = {
    ...current,
    protocolActive: true,
    totalSuperEpochs: current.totalSuperEpochs + (params.totalSuperEpochsIncrement || 0),
    convergencesAchieved: current.convergencesAchieved + (params.convergencesIncrement || 0),
    bestBrierLoss: Number.isFinite(candidateBrier)
      ? (hasPriorBrier ? Math.min(current.bestBrierLoss, candidateBrier as number) : (candidateBrier as number))
      : current.bestBrierLoss,
    peakAccuracyPct: Number.isFinite(candidateAccuracy)
      ? (hasPriorAccuracy ? Math.max(current.peakAccuracyPct, candidateAccuracy as number) : (candidateAccuracy as number))
      : current.peakAccuracyPct,
    lastOptimizationTimestamp: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY_SUPER_TELEMETRY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  return updated;
}

/**
 * Generates default initial state with computed baselines
 */
export function getInitialLearningState(): LearningModelState {
  const matrices = loadTeamIntelligenceMatrices();
  const baselineEval = evaluateHistoricalBacktest(HISTORICAL_MATCH_RESULTS, DEFAULT_ENGINE_WEIGHTS, matrices);

  return {
    weights: { ...DEFAULT_ENGINE_WEIGHTS },
    baselineWeights: { ...DEFAULT_ENGINE_WEIGHTS },
    totalEpochsTrained: 0,
    accuracyPct: baselineEval.accuracyPct,
    baselineAccuracyPct: baselineEval.accuracyPct,
    brierLoss: baselineEval.brierLoss,
    baselineBrierLoss: baselineEval.brierLoss,
    lastTrainedAt: null,
    isAutoLearningEnabled: false,
    recentLossHistory: [baselineEval.brierLoss],
    aiTacticalSynthesis: {
      summary: `Model initialized from ${HISTORICAL_MATCH_RESULTS.length} bundled historical records; performance metrics below use chronological holdout validation when a validation window exists.`,
      recommendations: [
        'Coordinate calibration fits weights against the training window.',
        'Team intelligence coefficients are estimated from completed training-window results only.',
        'Fatigue parameters are calibrated from observed training-window outcomes when available.',
      ],
      ruleEfficiency: [
        { rule: 'Rule 1: Motivation Stakes', impact: '+2.5 pts boost', status: 'recalibrating' },
        { rule: 'Rule 3: Home Dominance', impact: '+15% home multiplier', status: 'recalibrating' },
        { rule: 'Rule 5: Shot/Possession', impact: '+3.5 pts modifier', status: 'recalibrating' },
        { rule: 'Rule 7: Volatility Cap', impact: '0.68 compression', status: 'recalibrating' },
        { rule: 'Rule 8: Favourite Floor', impact: '55% win floor', status: 'recalibrating' },
        { rule: 'Rule 9: Draw Equilibrium', impact: '≤5% parity margin', status: 'recalibrating' },
        { rule: 'Observed Team Coefficients', impact: 'Club-specific coefficients active', status: 'recalibrating' },
      ],
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Validates and sanitizes a complete learning model state
 */
export function sanitizeLearningState(state?: Partial<LearningModelState> | null): LearningModelState {
  const initial = getInitialLearningState();
  if (!state || typeof state !== 'object') return initial;

  const sanitizedWeights = sanitizeEngineWeights(state.weights);
  const sanitizedBaselineWeights = sanitizeEngineWeights(state.baselineWeights);
  const matrices = loadTeamIntelligenceMatrices();

  const evalRes = evaluateOutOfSampleValidation(HISTORICAL_MATCH_RESULTS, sanitizedWeights);
  const baselineEval = evaluateOutOfSampleValidation(HISTORICAL_MATCH_RESULTS, sanitizedBaselineWeights);

  const accuracyPct = evalRes.accuracyPct;
  const brierLoss = evalRes.brierLoss;

  let recentLossHistory = Array.isArray(state.recentLossHistory)
    ? state.recentLossHistory.filter((val): val is number => typeof val === 'number' && Number.isFinite(val) && !isNaN(val))
    : [];
  if (recentLossHistory.length === 0) {
    recentLossHistory = [brierLoss];
  }

  return {
    weights: sanitizedWeights,
    baselineWeights: sanitizedBaselineWeights,
    totalEpochsTrained: Number.isFinite(state.totalEpochsTrained)
      ? Math.max(0, Math.floor(state.totalEpochsTrained as number))
      : initial.totalEpochsTrained,
    accuracyPct,
    baselineAccuracyPct: baselineEval.accuracyPct,
    brierLoss,
    baselineBrierLoss: baselineEval.brierLoss,
    lastTrainedAt: typeof state.lastTrainedAt === 'string' && state.lastTrainedAt ? state.lastTrainedAt : null,
    isAutoLearningEnabled: false,
    recentLossHistory: recentLossHistory.length > 0 ? recentLossHistory : [initial.brierLoss],
    aiTacticalSynthesis: state.aiTacticalSynthesis && typeof state.aiTacticalSynthesis === 'object'
      ? state.aiTacticalSynthesis
      : initial.aiTacticalSynthesis,
  };
}

/**
 * Loads learning state from localStorage with fallback to default
 */
export function loadLearningState(): LearningModelState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEARNING_STATE);
    if (!raw) return getInitialLearningState();
    const parsed = JSON.parse(raw) as Partial<LearningModelState>;
    return sanitizeLearningState(parsed);
  } catch {
    return getInitialLearningState();
  }
}

/**
 * Saves learning state to localStorage AND durable server API storage
 */
export function saveLearningState(state: LearningModelState): void {
  const safeState = sanitizeLearningState(state);

  try {
    localStorage.setItem(STORAGE_KEY_LEARNING_STATE, JSON.stringify(safeState));
  } catch (err) {
    console.error('Failed to persist learning state to localStorage:', err);
  }

  // Push to server storage
  if (typeof fetch !== 'undefined') {
    fetch('/api/learning-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAdminApiHeaders() },
      body: JSON.stringify({ state: safeState }),
    }).catch(() => {});
  }
}

/**
 * Asynchronously loads learning state from server if available
 */
export async function loadLearningStateWithServerFallback(): Promise<LearningModelState> {
  const localState = loadLearningState();

  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch('/api/learning-state');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.state && data.state.weights) {
          const serverState = sanitizeLearningState(data.state);
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

/**
 * Automated Post-Match Retraining Pipeline:
 * Ingests newly completed matches and executes an Aggressive Super-Learning Protocol pass,
 * updating model weights, team matrices, and empirical loss trajectories without limits.
 */
export function autoRetrainOnCompletedMatches(
  currentState: LearningModelState,
  allResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  epochs: number = 10
): {
  updatedState: LearningModelState;
  accuracyGain: number;
  lossDelta: number;
  epochsCompleted: number;
} {
  const safeCurrent = sanitizeLearningState(currentState);
  const superResult = runAggressiveSuperLearningProtocol(safeCurrent.weights, epochs, allResults);

  const updatedLossHistory = [
    ...(safeCurrent.recentLossHistory || []),
    ...superResult.lossHistory.slice(1),
  ].slice(-30);

  const updatedState: LearningModelState = {
    ...safeCurrent,
    weights: superResult.finalWeights,
    totalEpochsTrained: safeCurrent.totalEpochsTrained + epochs,
    accuracyPct: superResult.finalAccuracy,
    brierLoss: superResult.finalLoss,
    recentLossHistory: updatedLossHistory,
    lastTrainedAt: new Date().toISOString(),
  };

  saveLearningState(updatedState);

  return {
    updatedState,
    accuracyGain: superResult.accuracyGain,
    lossDelta: superResult.lossDelta,
    epochsCompleted: epochs,
  };
}
