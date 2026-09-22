import { HistoricalMatchResult, EngineWeights, PredictionResult } from '../types/soccer';
import { evaluateFixturePrediction, DEFAULT_ENGINE_WEIGHTS, sanitizeEngineWeights } from '../engine/rulesEngine';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';

export interface ClassPerformance {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface CalibrationBin {
  range: string;
  min: number;
  max: number;
  count: number;
  avgPredictedProb: number;
  observedAccuracy: number;
  calibrationGap: number;
}

export interface RuleAblationItem {
  ruleId: number;
  ruleName: string;
  parametersAblated: string;
  description: string;
  ablatedAccuracy: number;
  deltaAccuracy: number;
  ablatedRPS: number;
  deltaRPS: number;
  ablatedBrier: number;
  deltaBrier: number;
  statisticalRole: 'Essential Stabilizer' | 'High Alpha Driver' | 'Probabilistic Calibrator' | 'Disparity Grounding';
  significanceRank: number;
}

export interface BaselineBenchmark {
  name: string;
  accuracy: number;
  meanRPS: number;
  meanBrierScore: number;
  meanLogLoss: number;
  description: string;
}

export interface StatisticalEvaluationResult {
  evaluatedAt: string;
  sampleSize: number;
  accuracy: number;
  meanRPS: number;
  meanBrierScore: number;
  meanLogLoss: number;
  macroF1: number;
  weightedF1: number;

  baselines: {
    uniformRandom: BaselineBenchmark;
    empiricalDistribution: BaselineBenchmark & {
      distribution: { homePct: number; drawPct: number; awayPct: number };
    };
    naiveStandings: BaselineBenchmark;
  };

  skillScores: {
    brierSkillScoreVsRandom: number;
    brierSkillScoreVsEmpirical: number;
    rpsSkillScoreVsRandom: number;
    rpsSkillScoreVsEmpirical: number;
    informationGainBits: number;
  };

  confusionMatrix: {
    home: { home: number; draw: number; away: number; total: number };
    draw: { home: number; draw: number; away: number; total: number };
    away: { home: number; draw: number; away: number; total: number };
  };

  classMetrics: {
    home: ClassPerformance;
    draw: ClassPerformance;
    away: ClassPerformance;
  };

  calibration: {
    expectedCalibrationError: number;
    maxCalibrationError: number;
    bins: CalibrationBin[];
  };

  ruleAblations: RuleAblationItem[];
}

/**
 * Calculates the Ranked Probability Score (RPS) for a single 3-outcome football match.
 * Standard football formulation by Constantinou & Fenton (2012) and Epstein (1969).
 * Outcomes are naturally ordered: 1 = Home Win, 2 = Draw, 3 = Away Win.
 */
export function calculateMatchRPS(
  probHome: number, // 0 to 1
  probDraw: number, // 0 to 1
  probAway: number, // 0 to 1
  actualOutcome: 'home' | 'draw' | 'away'
): number {
  const eHome = actualOutcome === 'home' ? 1 : 0;
  const eDraw = actualOutcome === 'draw' ? 1 : 0;

  // Outcome vector has K=3 categories, so K-1 = 2 cutoffs:
  // r = 1: (probHome - eHome)^2
  // r = 2: ((probHome + probDraw) - (eHome + eDraw))^2
  const term1 = Math.pow(probHome - eHome, 2);
  const term2 = Math.pow((probHome + probDraw) - (eHome + eDraw), 2);

  // RPS = (1 / (K - 1)) * sum = 0.5 * (term1 + term2)
  return 0.5 * (term1 + term2);
}

/**
 * Calculates Multi-Class Brier Score for a single match
 */
export function calculateMatchBrier(
  probHome: number,
  probDraw: number,
  probAway: number,
  actualOutcome: 'home' | 'draw' | 'away'
): number {
  const eHome = actualOutcome === 'home' ? 1 : 0;
  const eDraw = actualOutcome === 'draw' ? 1 : 0;
  const eAway = actualOutcome === 'away' ? 1 : 0;

  return Math.pow(probHome - eHome, 2) + Math.pow(probDraw - eDraw, 2) + Math.pow(probAway - eAway, 2);
}

/**
 * Executes a comprehensive statistical evaluation of the rules engine against historical matches.
 */
export function runStatisticalEvaluation(
  weightsInput?: EngineWeights,
  dataset: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): StatisticalEvaluationResult {
  const weights = sanitizeEngineWeights(weightsInput || DEFAULT_ENGINE_WEIGHTS);
  const validDataset = (dataset || []).filter(
    (m): m is HistoricalMatchResult => Boolean(m && m.fixture && m.actualOutcome)
  );
  const total = validDataset.length;

  if (total === 0) {
    throw new Error('Dataset cannot be empty for statistical evaluation');
  }

  let totalCorrect = 0;
  let sumBrier = 0;
  let sumRPS = 0;
  let sumLogLoss = 0;

  // Confusion matrix counters
  const confusion = {
    home: { home: 0, draw: 0, away: 0, total: 0 },
    draw: { home: 0, draw: 0, away: 0, total: 0 },
    away: { home: 0, draw: 0, away: 0, total: 0 },
  };

  // Empirical counts
  let countHome = 0;
  let countDraw = 0;
  let countAway = 0;

  // Calibration Bins: 5 standard decile/quintile ranges
  const rawBins: Array<{ min: number; max: number; range: string; count: number; correct: number; sumProb: number }> = [
    { range: '25% - 40%', min: 0.25, max: 0.40, count: 0, correct: 0, sumProb: 0 },
    { range: '40% - 50%', min: 0.40, max: 0.50, count: 0, correct: 0, sumProb: 0 },
    { range: '50% - 60%', min: 0.50, max: 0.60, count: 0, correct: 0, sumProb: 0 },
    { range: '60% - 70%', min: 0.60, max: 0.70, count: 0, correct: 0, sumProb: 0 },
    { range: '70% - 100%', min: 0.70, max: 1.01, count: 0, correct: 0, sumProb: 0 },
  ];

  for (const m of validDataset) {
    const actual = m.actualOutcome || 'draw';
    if (actual === 'home') countHome++;
    else if (actual === 'draw') countDraw++;
    else countAway++;

    const pred: PredictionResult = evaluateFixturePrediction(m.fixture, 'none', weights);
    const ph = Math.max(0.01, Math.min(0.98, pred.homeWinPct / 100));
    const pd = Math.max(0.01, Math.min(0.98, pred.drawPct / 100));
    const pa = Math.max(0.01, Math.min(0.98, pred.awayWinPct / 100));

    // Normalize probabilities to sum strictly to 1.0
    const sumP = ph + pd + pa;
    const normH = ph / sumP;
    const normD = pd / sumP;
    const normA = pa / sumP;

    const brier = calculateMatchBrier(normH, normD, normA, actual);
    const rps = calculateMatchRPS(normH, normD, normA, actual);
    const pActual = actual === 'home' ? normH : actual === 'draw' ? normD : normA;
    const logLoss = -Math.log(Math.max(1e-6, pActual));

    sumBrier += brier;
    sumRPS += rps;
    sumLogLoss += logLoss;

    const isMatchCorrect = pred.predictedWinner === actual;
    if (isMatchCorrect) {
      totalCorrect++;
    }

    confusion[actual][pred.predictedWinner]++;
    confusion[actual].total++;

    // Binning for calibration
    const winningPickProb = pred.predictedWinner === 'home' ? normH : pred.predictedWinner === 'draw' ? normD : normA;
    for (const b of rawBins) {
      if (winningPickProb >= b.min && winningPickProb < b.max) {
        b.count++;
        if (isMatchCorrect) b.correct++;
        b.sumProb += winningPickProb;
        break;
      }
    }
  }

  const accuracy = (totalCorrect / total) * 100;
  const meanBrierScore = sumBrier / total;
  const meanRPS = sumRPS / total;
  const meanLogLoss = sumLogLoss / total;

  // Precision, Recall, F1
  const calcF1 = (tp: number, fp: number, fn: number) => {
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { precision: precision * 100, recall: recall * 100, f1: f1 * 100 };
  };

  const predHomeTotal = confusion.home.home + confusion.draw.home + confusion.away.home;
  const predDrawTotal = confusion.home.draw + confusion.draw.draw + confusion.away.draw;
  const predAwayTotal = confusion.home.away + confusion.draw.away + confusion.away.away;

  const homeMetrics = {
    ...calcF1(confusion.home.home, predHomeTotal - confusion.home.home, confusion.home.total - confusion.home.home),
    support: confusion.home.total,
  };
  const drawMetrics = {
    ...calcF1(confusion.draw.draw, predDrawTotal - confusion.draw.draw, confusion.draw.total - confusion.draw.draw),
    support: confusion.draw.total,
  };
  const awayMetrics = {
    ...calcF1(confusion.away.away, predAwayTotal - confusion.away.away, confusion.away.total - confusion.away.away),
    support: confusion.away.total,
  };

  const macroF1 = (homeMetrics.f1 + drawMetrics.f1 + awayMetrics.f1) / 3;
  const weightedF1 =
    (homeMetrics.f1 * homeMetrics.support +
      drawMetrics.f1 * drawMetrics.support +
      awayMetrics.f1 * awayMetrics.support) /
    total;

  // Calibration ECE
  let weightedECE = 0;
  let maxCalibrationError = 0;
  const calibrationBins: CalibrationBin[] = [];

  for (const b of rawBins) {
    if (b.count === 0) continue;
    const avgPred = (b.sumProb / b.count) * 100;
    const obsAcc = (b.correct / b.count) * 100;
    const gap = Math.abs(obsAcc - avgPred);
    weightedECE += (b.count / total) * gap;
    if (gap > maxCalibrationError) {
      maxCalibrationError = gap;
    }
    calibrationBins.push({
      range: b.range,
      min: b.min,
      max: b.max,
      count: b.count,
      avgPredictedProb: Number(avgPred.toFixed(1)),
      observedAccuracy: Number(obsAcc.toFixed(1)),
      calibrationGap: Number(gap.toFixed(1)),
    });
  }

  // Benchmark Baselines
  const empH = countHome / total;
  const empD = countDraw / total;
  const empA = countAway / total;

  let rpsRandom = 0;
  let brierRandom = 0;
  let logLossRandom = 0;
  let rpsEmp = 0;
  let brierEmp = 0;
  let logLossEmp = 0;
  let correctStandings = 0;
  let rpsStandings = 0;
  let brierStandings = 0;
  let logLossStandings = 0;

  for (const m of validDataset) {
    const actual = m.actualOutcome || 'draw';
    const eh = actual === 'home' ? 1 : 0;
    const ed = actual === 'draw' ? 1 : 0;
    const ea = actual === 'away' ? 1 : 0;

    // Random
    const pr = 1 / 3;
    brierRandom += calculateMatchBrier(pr, pr, pr, actual);
    rpsRandom += calculateMatchRPS(pr, pr, pr, actual);
    logLossRandom += -Math.log(pr);

    // Empirical distribution
    brierEmp += calculateMatchBrier(empH, empD, empA, actual);
    rpsEmp += calculateMatchRPS(empH, empD, empA, actual);
    const pEmpActual = actual === 'home' ? empH : actual === 'draw' ? empD : empA;
    logLossEmp += -Math.log(Math.max(1e-6, pEmpActual));

    // Naive Standings Baseline (Picks better rank team, or home if tied)
    const homeRank = m.fixture?.homeTeam?.leagueRank ?? 10;
    const awayRank = m.fixture?.awayTeam?.leagueRank ?? 10;
    const standingPick = homeRank < awayRank ? 'home' : awayRank < homeRank ? 'away' : 'home';
    if (standingPick === actual) correctStandings++;
    // Standing naive probability distribution: 55% favourite, 25% draw, 20% underdog
    const isHomeFav = homeRank <= awayRank;
    const psH = isHomeFav ? 0.55 : 0.20;
    const psD = 0.25;
    const psA = isHomeFav ? 0.20 : 0.55;
    brierStandings += calculateMatchBrier(psH, psD, psA, actual);
    rpsStandings += calculateMatchRPS(psH, psD, psA, actual);
    const pStandActual = actual === 'home' ? psH : actual === 'draw' ? psD : psA;
    logLossStandings += -Math.log(Math.max(1e-6, pStandActual));
  }

  const meanBrierRandom = brierRandom / total;
  const meanRPSRandom = rpsRandom / total;
  const meanLogLossRandom = logLossRandom / total;

  const meanBrierEmp = brierEmp / total;
  const meanRPSEmp = rpsEmp / total;
  const meanLogLossEmp = logLossEmp / total;

  const meanBrierStandings = brierStandings / total;
  const meanRPSStandings = rpsStandings / total;
  const meanLogLossStandings = logLossStandings / total;

  // Skill scores (percentage improvement over reference benchmark)
  const brierSkillScoreVsRandom = ((meanBrierRandom - meanBrierScore) / meanBrierRandom) * 100;
  const brierSkillScoreVsEmpirical = ((meanBrierEmp - meanBrierScore) / meanBrierEmp) * 100;
  const rpsSkillScoreVsRandom = ((meanRPSRandom - meanRPS) / meanRPSRandom) * 100;
  const rpsSkillScoreVsEmpirical = ((meanRPSEmp - meanRPS) / meanRPSEmp) * 100;
  const informationGainBits = (meanLogLossEmp - meanLogLoss) / Math.LN2;

  // 9-Rule Ablation Study
  const ablationConfigs: Array<{
    ruleId: number;
    ruleName: string;
    parametersAblated: string;
    description: string;
    overrides: Partial<EngineWeights>;
    statisticalRole: 'Essential Stabilizer' | 'High Alpha Driver' | 'Probabilistic Calibrator' | 'Disparity Grounding';
  }> = [
    {
      ruleId: 1,
      ruleName: 'Rule 1: Motivation & Dead Rubber',
      parametersAblated: 'stakesMotivationBoost, deadRubberPenalty',
      description: 'Awards urgency bonus to title/relegation battles and dampens end-of-season dead-rubbers.',
      overrides: { stakesMotivationBoost: 0, deadRubberPenalty: 0 },
      statisticalRole: 'Disparity Grounding',
    },
    {
      ruleId: 2,
      ruleName: 'Rule 2: Standings & Season Pedigree',
      parametersAblated: 'rankPointsMultiplier, lastSeasonStandingWeight',
      description: 'Accounts for current table positions reinforced by previous season pedigree.',
      overrides: { rankPointsMultiplier: 0, lastSeasonStandingWeight: 0 },
      statisticalRole: 'Probabilistic Calibrator',
    },
    {
      ruleId: 3,
      ruleName: 'Rule 3: Form Momentum & Road Resilience',
      parametersAblated: 'formWinPoints, formDrawPoints, awayFormBonus',
      description: 'Quantifies recent 5-game trajectory and rewards verified road warriors.',
      overrides: { formWinPoints: 0, formDrawPoints: 0, awayFormBonus: 0 },
      statisticalRole: 'Probabilistic Calibrator',
    },
    {
      ruleId: 4,
      ruleName: 'Rule 4: Venue Fortress & Dominance',
      parametersAblated: 'homeDominanceBonus',
      description: 'Awards home fortress venue multiplier and converts tactical home dominance.',
      overrides: { homeDominanceBonus: 0 },
      statisticalRole: 'High Alpha Driver',
    },
    {
      ruleId: 5,
      ruleName: 'Rule 5: Tactical Dominance, Squad Value & Rating',
      parametersAblated: 'tacticalPossessionWeight, tacticalShotsWeight, squadValueWeight, matchRatingWeight, h2hMultiplier',
      description: 'Integrates shot creation, roster market capitalisation, and season-long match ratings.',
      overrides: { tacticalPossessionWeight: 0, tacticalShotsWeight: 0, squadValueWeight: 0, matchRatingWeight: 0, h2hMultiplier: 0 },
      statisticalRole: 'High Alpha Driver',
    },
    {
      ruleId: 6,
      ruleName: 'Rule 6: Midweek Cup & Continental Fatigue',
      parametersAblated: 'fatiguePenaltyRate',
      description: 'Applies -15% physical recovery deduction for squads with 3-day turnaround times.',
      overrides: { fatiguePenaltyRate: 0 },
      statisticalRole: 'Disparity Grounding',
    },
    {
      ruleId: 7,
      ruleName: 'Rule 7: Volatility Draw Buffer',
      parametersAblated: 'volatilityDrawBoost',
      description: 'Expands draw probability envelope in historically high-parity competitions.',
      overrides: { volatilityDrawBoost: 0 },
      statisticalRole: 'Probabilistic Calibrator',
    },
    {
      ruleId: 8,
      ruleName: 'Rule 8: 80 Priority Favourite Win Floor',
      parametersAblated: 'favouriteWinFloor',
      description: 'Enforces a 55% win probability floor when elite tier favourites meet distinct underdogs.',
      overrides: { favouriteWinFloor: 0 },
      statisticalRole: 'High Alpha Driver',
    },
    {
      ruleId: 9,
      ruleName: 'Rule 9: Close-Contest Draw Equilibrium',
      parametersAblated: 'drawEquilibriumMargin, drawEquilibriumBoost',
      description: 'Pumps draw probability to 38% when opposing teams are separated by under 4 performance points.',
      overrides: { drawEquilibriumBoost: 0 },
      statisticalRole: 'Essential Stabilizer',
    },
  ];

  const ruleAblations: RuleAblationItem[] = ablationConfigs.map((cfg) => {
    const ablatedWeights = { ...weights, ...cfg.overrides };
    let ablatedCorrect = 0;
    let ablatedBrier = 0;
    let ablatedRPS = 0;

    for (const m of validDataset) {
      const pred = evaluateFixturePrediction(m.fixture, 'none', ablatedWeights);
      const actual = m.actualOutcome || 'draw';
      const ph = Math.max(0.01, Math.min(0.98, pred.homeWinPct / 100));
      const pd = Math.max(0.01, Math.min(0.98, pred.drawPct / 100));
      const pa = Math.max(0.01, Math.min(0.98, pred.awayWinPct / 100));
      const sumP = ph + pd + pa;

      ablatedBrier += calculateMatchBrier(ph / sumP, pd / sumP, pa / sumP, actual);
      ablatedRPS += calculateMatchRPS(ph / sumP, pd / sumP, pa / sumP, actual);
      if (pred.predictedWinner === actual) ablatedCorrect++;
    }

    const ablatedAccuracy = (ablatedCorrect / total) * 100;
    const meanAblatedBrier = ablatedBrier / total;
    const meanAblatedRPS = ablatedRPS / total;

    return {
      ruleId: cfg.ruleId,
      ruleName: cfg.ruleName,
      parametersAblated: cfg.parametersAblated,
      description: cfg.description,
      ablatedAccuracy: Number(ablatedAccuracy.toFixed(1)),
      deltaAccuracy: Number((ablatedAccuracy - accuracy).toFixed(1)),
      ablatedRPS: Number(meanAblatedRPS.toFixed(4)),
      deltaRPS: Number((meanAblatedRPS - meanRPS).toFixed(4)),
      ablatedBrier: Number(meanAblatedBrier.toFixed(4)),
      deltaBrier: Number((meanAblatedBrier - meanBrierScore).toFixed(4)),
      statisticalRole: cfg.statisticalRole,
      significanceRank: 0,
    };
  });

  // Sort by statistical damage caused when ablated (higher deltaBrier + deltaRPS = more significant)
  ruleAblations.sort((a, b) => (b.deltaBrier + b.deltaRPS * 2) - (a.deltaBrier + a.deltaRPS * 2));
  ruleAblations.forEach((item, idx) => {
    item.significanceRank = idx + 1;
  });

  return {
    evaluatedAt: new Date().toISOString(),
    sampleSize: total,
    accuracy: Number(accuracy.toFixed(1)),
    meanRPS: Number(meanRPS.toFixed(4)),
    meanBrierScore: Number(meanBrierScore.toFixed(4)),
    meanLogLoss: Number(meanLogLoss.toFixed(4)),
    macroF1: Number(macroF1.toFixed(1)),
    weightedF1: Number(weightedF1.toFixed(1)),

    baselines: {
      uniformRandom: {
        name: 'Uniform Random Chance',
        accuracy: 33.3,
        meanRPS: Number(meanRPSRandom.toFixed(4)),
        meanBrierScore: Number(meanBrierRandom.toFixed(4)),
        meanLogLoss: Number(meanLogLossRandom.toFixed(4)),
        description: 'Assumes equal 33.3% probability for 1, X, and 2 with zero domain knowledge.',
      },
      empiricalDistribution: {
        name: 'Empirical League Prior Baseline',
        accuracy: Number((empH * 100).toFixed(1)),
        meanRPS: Number(meanRPSEmp.toFixed(4)),
        meanBrierScore: Number(meanBrierEmp.toFixed(4)),
        meanLogLoss: Number(meanLogLossEmp.toFixed(4)),
        description: 'Fixed long-term observed distribution: assigns constant home advantage prior to every match.',
        distribution: {
          homePct: Number((empH * 100).toFixed(1)),
          drawPct: Number((empD * 100).toFixed(1)),
          awayPct: Number((empA * 100).toFixed(1)),
        },
      },
      naiveStandings: {
        name: 'League Table Rank Heuristic',
        accuracy: Number(((correctStandings / total) * 100).toFixed(1)),
        meanRPS: Number(meanRPSStandings.toFixed(4)),
        meanBrierScore: Number(meanBrierStandings.toFixed(4)),
        meanLogLoss: Number(meanLogLossStandings.toFixed(4)),
        description: 'Selects whichever club ranks higher in the league table without contextual factors.',
      },
    },

    skillScores: {
      brierSkillScoreVsRandom: Number(brierSkillScoreVsRandom.toFixed(1)),
      brierSkillScoreVsEmpirical: Number(brierSkillScoreVsEmpirical.toFixed(1)),
      rpsSkillScoreVsRandom: Number(rpsSkillScoreVsRandom.toFixed(1)),
      rpsSkillScoreVsEmpirical: Number(rpsSkillScoreVsEmpirical.toFixed(1)),
      informationGainBits: Number(informationGainBits.toFixed(2)),
    },

    confusionMatrix: confusion,
    classMetrics: {
      home: homeMetrics,
      draw: drawMetrics,
      away: awayMetrics,
    },

    calibration: {
      expectedCalibrationError: Number(weightedECE.toFixed(1)),
      maxCalibrationError: Number(maxCalibrationError.toFixed(1)),
      bins: calibrationBins,
    },

    ruleAblations,
  };
}
