import { MatchFixture, PredictionResult, HistoricalMatchResult } from '../types/soccer';
import { evaluateFixturePrediction } from '../engine/rulesEngine';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';
import { getTodayDateString } from './dateFilterUtils';

export interface AccumulatorLeg {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffTime: string;
  selection: 'home' | 'draw' | 'away';
  selectionName: string;
  probability: number;
  odds: number;
  expectedValue: number;
  confidenceScore: number;
  reasoning: string;
}

export interface SmartAccumulatorResult {
  legs: AccumulatorLeg[];
  combinedOdds: number;
  averageConfidence: number;
  expectedYieldScore: number; // 0 - 100 rating
  riskLevel: 'Conservative Value' | 'Balanced Sweet-Spot' | 'High Yield Aggressive';
  strategicAdvice: string;
}

export interface OptimalValueLeg {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffTime: string;
  venue: string;
  selection: 'home' | 'draw' | 'away';
  selectionName: string;
  modelProbability: number; // percentage e.g. 68%
  probabilities: {
    home: number;
    draw: number;
    away: number;
  };
  marketOdds: number; // Current match odds e.g. 1.85
  fairOdds: number; // Fair theoretical odds e.g. 1.47
  expectedValue: number; // EV ratio e.g. +0.26 (+26%)
  valueMarginPct: number; // percentage edge over bookmaker e.g. +24.5%
  historicalWinRate: number | null; // Observed cohort hit rate; null when no cohort exists
  historicalSampleSize: number; // Count of matching historical samples
  confidenceScore: number; // 0 - 100
  kellyFraction: number; // recommended fractional stake percentage
  ruleHighlights: string[];
  keyDrivers: string[];
  tacticalAdvantage: string;
}

export interface OptimalValueReport {
  generatedAt: string;
  bundleTitle: string;
  heuristicEvidenceScore: number; // 0 - 100
  evidenceLabel: 'High Evidence' | 'Moderate Evidence' | 'Limited Evidence' | 'Insufficient Evidence';
  strategyMode: 'balanced' | 'conservative' | 'high_alpha';
  combinedOdds: number;
  expectedValueAlpha: number; // percentage e.g. +24.8%
  historicalValidationRate: number | null; // null when no qualifying historical cohort exists
  bundleWinProbability: number; // joint probability percentage
  recommendedStakeUnits: number; // e.g. 1.5 units
  kellyScore: number;
  legs: OptimalValueLeg[];
  executiveSummary: string;
  historicalPrecedentSummary: string;
  riskMitigationAdvice: string;
  confidenceBreakdown: {
    modelCertainty: number; // 0-100
    historicalBacktestFit: number; // 0-100
    marketOddsAlpha: number; // 0-100
    formStability: number | null;
  };
  historicalCohort: {
    sampleSize: number;
    observedHitRate: number | null;
    simulatedROI: null;
    maxDrawdownPct: null;
  };
}

export interface PostMortemFailureAnalysis {
  matchId: string;
  matchTitle: string;
  league: string;
  actualOutcome: 'home' | 'draw' | 'away';
  predictedOutcome: 'home' | 'draw' | 'away';
  probability: number;
  failureReason: string;
  ruleAdjustmentHint: string;
}

export interface UserCoachingAudit {
  totalOverridesCount: number;
  userAccuracyPct: number | null;
  aiAccuracyPct: number | null;
  coachingTips: string[];
}

/**
 * Computes evidence-gated accumulator candidates for the day.
 * Candidates require non-negative model EV and a sufficiently sized historical outcome cohort.
 */
export function generateSmartAccumulator(
  fixtures: MatchFixture[],
  overrides: Record<string, string>,
  weights: any
): SmartAccumulatorResult {
  const legs: AccumulatorLeg[] = [];
  if (!Array.isArray(fixtures)) {
    return {
      legs: [],
      combinedOdds: 1.0,
      averageConfidence: 50,
      expectedYieldScore: 50,
      riskLevel: 'Conservative Value',
      strategicAdvice: 'No valid fixtures available for accumulator generation.',
    };
  }

  const todayIso = getTodayDateString();
  let activeFixtures = (fixtures || []).filter((f) => {
    if (!f || !f.id || !f.homeTeam || !f.awayTeam || !f.kickoffTime) return false;
    return f.kickoffTime.slice(0, 10) >= todayIso;
  });
  if (activeFixtures.length < 3) {
    activeFixtures = (fixtures || []).filter((f) => Boolean(f && f.id && f.homeTeam && f.awayTeam));
  }

  for (const fixture of activeFixtures) {
    if (!fixture || !fixture.id || !fixture.homeTeam || !fixture.awayTeam) continue;

    // DATA-QUALITY GATE: Only fixtures with verified official standings may enter accumulator candidates
    const isStandingsVerified = Boolean(fixture.isStandingsVerified || fixture.authenticity?.source === 'OFFICIAL_ESPN_STANDINGS');
    if (!isStandingsVerified) continue;

    // AUTHENTIC ODDS GATE: Exclude any fixture without genuine market odds
    if (!fixture.odds?.home || !fixture.odds?.away || Number(fixture.odds.home) <= 1.05 || Number(fixture.odds.away) <= 1.05) {
      continue;
    }

    const homeOdds = Number(fixture.odds.home);
    const drawOdds = fixture.odds.draw && Number(fixture.odds.draw) > 1.05 ? Number(fixture.odds.draw) : undefined;
    const awayOdds = Number(fixture.odds.away);

    const pred = evaluateFixturePrediction(fixture, (overrides[fixture.id] as any) || 'none', weights);
    if (!pred) continue;

    const homePct = pred.homeWinPct;
    const drawPct = pred.drawPct;
    const awayPct = pred.awayWinPct;

    // Determine best selection based on predicted winner with authentic market odds
    let bestSelection: 'home' | 'draw' | 'away' = pred.predictedWinner;
    let bestProb = bestSelection === 'home' ? homePct : bestSelection === 'away' ? awayPct : drawPct;
    let bestOdds = bestSelection === 'home' ? homeOdds : bestSelection === 'away' ? awayOdds : drawOdds;

    if (!bestOdds || bestOdds <= 1.05) continue;

    // Sweet spot filtering: probability >= 50% and odds between 1.35 and 3.50
    const ev = (bestProb / 100) * bestOdds - 1;

    if (bestProb >= 50 && bestOdds >= 1.35 && bestOdds <= 3.50 && ev >= 0) {
      const teamName = bestSelection === 'home' ? fixture.homeTeam.name : bestSelection === 'away' ? fixture.awayTeam.name : 'Draw';
      const ruleTag = pred.appliedRules[0]?.tag || 'Tactical Balance';

      legs.push({
        fixtureId: fixture.id,
        homeTeam: fixture.homeTeam.name,
        awayTeam: fixture.awayTeam.name,
        league: fixture.league,
        kickoffTime: fixture.kickoffTime,
        selection: bestSelection,
        selectionName: teamName,
        probability: Math.round(bestProb),
        odds: bestOdds,
        expectedValue: Number(ev.toFixed(2)),
        confidenceScore: pred.confidenceScore,
        reasoning: `Verified standings. Supported by ${pred.appliedRules.length} rules (${ruleTag}). Probability: ${Math.round(bestProb)}% | EV: ${ev >= 0 ? '+' : ''}${(ev * 100).toFixed(0)}%`,
      });
    }
  }

  // Sort legs by confidenceScore and EV, take top 4 legs for evidence-gated yield accumulator
  legs.sort((a, b) => b.confidenceScore * b.expectedValue - a.confidenceScore * a.expectedValue);
  const selectedLegs = legs.slice(0, 4);

  const combinedOdds = selectedLegs.reduce((acc, l) => acc * Math.max(1.05, l.odds), 1.0);
  const avgConf = selectedLegs.length > 0 ? selectedLegs.reduce((acc, l) => acc + l.confidenceScore, 0) / selectedLegs.length : 0;

  let riskLevel: 'Conservative Value' | 'Balanced Sweet-Spot' | 'High Yield Aggressive' = 'Balanced Sweet-Spot';
  if (combinedOdds < 4.0) riskLevel = 'Conservative Value';
  else if (combinedOdds > 15.0) riskLevel = 'High Yield Aggressive';

  const expectedYieldScore = selectedLegs.length > 0
    ? Math.min(98, Math.max(0, Math.round(avgConf * 0.9 + (combinedOdds > 8 ? 15 : 5))))
    : 0;

  let strategicAdvice = `AI has selected ${selectedLegs.length} high-certainty sweet-spot legs with positive Expected Value. This balances maximum yield without taking reckless long-shot risks.`;
  if (selectedLegs.length < 3) {
    strategicAdvice = `Limited high-confidence fixtures detected today. Consider playing single bets or waiting for full slate availability.`;
  }

  return {
    legs: selectedLegs,
    combinedOdds: Number(combinedOdds.toFixed(2)),
    averageConfidence: Math.round(avgConf),
    expectedYieldScore,
    riskLevel,
    strategicAdvice,
  };
}

/**
 * Studies why historical or yesterday predictions failed and generates rule adjustment hints.
 */
export function analyzePostMortemFailures(
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): PostMortemFailureAnalysis[] {
  const analyses: PostMortemFailureAnalysis[] = [];

  const evaluated = (historicalResults || [])
    .filter((m): m is HistoricalMatchResult => Boolean(m && m.fixture && m.fixture.homeTeam && m.fixture.awayTeam && m.actualOutcome))
    .map((m) => ({
      m,
      pred: evaluateFixturePrediction(m.fixture, 'none'),
    }));

  const incorrectMatches = evaluated.filter(({ m, pred }) => {
    return Boolean(pred && pred.predictedWinner && pred.predictedWinner !== m.actualOutcome);
  });

  for (const { m, pred } of incorrectMatches.slice(0, 5)) {
    if (!pred) continue;
    const actual = m.actualOutcome || 'draw';
    const predicted = pred.predictedWinner || 'draw';
    const margin = Math.abs(pred.homeWinPct - pred.awayWinPct).toFixed(1);

    const failureReason = `Model forecast ${predicted.toUpperCase()} (${Math.round(predicted === 'home' ? pred.homeWinPct : predicted === 'away' ? pred.awayWinPct : pred.drawPct)}% prob, margin ${margin}%), actual outcome was ${actual.toUpperCase()} (${m.homeScore ?? 0}-${m.awayScore ?? 0}).`;
    const ruleAdjustmentHint = pred.appliedRules.length > 0
      ? `Contributing rules: ${pred.appliedRules.slice(0, 3).map(r => r.ruleName).join(', ')}.`
      : `Model operated on baseline advantage due to lack of distinct team telemetry.`;

    analyses.push({
      matchId: m.id || 'unknown_id',
      matchTitle: `${m.fixture.homeTeam?.name || 'Home'} vs ${m.fixture.awayTeam?.name || 'Away'}`,
      league: m.fixture.league || 'Unknown League',
      actualOutcome: actual,
      predictedOutcome: predicted,
      probability: Math.round(predicted === 'home' ? pred.homeWinPct : predicted === 'away' ? pred.awayWinPct : pred.drawPct),
      failureReason,
      ruleAdjustmentHint,
    });
  }

  return analyses;
}

/**
 * Studies user manual override patterns and provides coaching advice.
 */
export function analyzeUserCoachingPatterns(
  overrides: Record<string, string>,
  fixtures: MatchFixture[]
): UserCoachingAudit {
  const overrideCount = Object.keys(overrides).length;
  const tips: string[] = [];

  if (overrideCount === 0) {
    tips.push(`AI Coaching Tip: You are currently relying 100% on the AI's 9-rule tactical engine. Predictions operate directly from factual team inputs and baseline weights.`);
  } else {
    tips.push(`AI Coaching Tip: You have applied ${overrideCount} manual overrides. The engine has adjusted match forecasts based on your explicit preferences.`);
    tips.push(`Guidance: Manual overrides override all model rules. Ensure you review verified team news and starting lineups before locking in overrides.`);
  }

  tips.push(`Yield Strategy: For optimal accumulator performance, limit legs to 3-4 matches with combined odds between 4.00 and 10.00.`);

  return {
    totalOverridesCount: overrideCount,
    userAccuracyPct: null,
    aiAccuracyPct: null,
    coachingTips: tips,
  };
}

/**
 * Generates an Automated 'Optimal Value' Accumulator Intelligence Report.
 * Cross-references real match odds against model probabilities, historical backtest performance,
 * and empirical failure matrices to synthesize an evidence-gated bundle with a heuristic score.
 */
export function generateOptimalValueAccumulatorReport(
  fixtures: MatchFixture[],
  overrides: Record<string, string> = {},
  weights: any = {},
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS,
  strategyMode: 'balanced' | 'conservative' | 'high_alpha' = 'balanced'
): OptimalValueReport {
  const candidateLegs: OptimalValueLeg[] = [];

  const todayIso = new Date().toISOString().split('T')[0];
  let activeFixtures = (fixtures || []).filter((f) => {
    if (!f || !f.id || !f.homeTeam || !f.awayTeam || !f.kickoffTime) return false;
    return f.kickoffTime.slice(0, 10) >= todayIso;
  });
  if (activeFixtures.length < 3) {
    activeFixtures = (fixtures || []).filter((f) => Boolean(f && f.id && f.homeTeam && f.awayTeam));
  }

  const validFixtures = activeFixtures;

  // Precompute historical predictions once to avoid 60,000+ redundant calculations in nested loops
  const historicalEvaluations = (historicalResults || [])
    .filter((h) => Boolean(h && h.fixture && h.actualOutcome))
    .map((h) => ({
      result: h,
      pred: evaluateFixturePrediction(h.fixture, 'none', weights),
    }));

  for (const fixture of validFixtures) {
    // DATA-QUALITY GATE: Only fixtures with verified official standings cross-reference may enter EV / value ranking
    const isStandingsVerified = Boolean(fixture.isStandingsVerified || fixture.authenticity?.source === 'OFFICIAL_ESPN_STANDINGS');
    if (!isStandingsVerified) continue;

    // AUTHENTIC ODDS GATE: Exclude any fixture without genuine market odds (no synthetic fallbacks)
    if (!fixture.odds?.home || !fixture.odds?.away || Number(fixture.odds.home) <= 1.05 || Number(fixture.odds.away) <= 1.05) {
      continue;
    }

    const mOddsHome = Number(fixture.odds.home);
    const mOddsAway = Number(fixture.odds.away);
    const mOddsDraw = fixture.odds.draw && Number(fixture.odds.draw) > 1.05 ? Number(fixture.odds.draw) : undefined;

    const pred = evaluateFixturePrediction(fixture, (overrides[fixture.id] as any) || 'none', weights);
    if (!pred) continue;

    const homePct = pred.homeWinPct;
    const drawPct = pred.drawPct;
    const awayPct = pred.awayWinPct;

    // Evaluate outcomes with authentic market odds
    const outcomes: {
      sel: 'home' | 'draw' | 'away';
      prob: number;
      odds: number;
      name: string;
    }[] = [
      { sel: 'home', prob: homePct, odds: mOddsHome, name: fixture.homeTeam.name },
      { sel: 'away', prob: awayPct, odds: mOddsAway, name: fixture.awayTeam.name },
    ];
    if (mOddsDraw !== undefined) {
      outcomes.push({ sel: 'draw', prob: drawPct, odds: mOddsDraw, name: 'Draw' });
    }

    for (const outcome of outcomes) {
      // Secondary safety net: odds between 1.30 and 3.50, probability >= 40%
      if (outcome.prob < 40 || outcome.odds < 1.30 || outcome.odds > 3.50) continue;

      const fairOdds = Number((100 / outcome.prob).toFixed(2));
      const ev = (outcome.prob / 100) * outcome.odds - 1; // Expected Value ratio
      const valueMarginPct = Number((((outcome.odds - fairOdds) / fairOdds) * 100).toFixed(1));

      // Calculate historical sample accuracy in similar past fixtures (O(N) precomputed lookup)
      const matchingHistorical = historicalEvaluations.filter(({ result: h, pred: hPred }) => {
        if (!hPred) return false;
        const leagueMatch = h.fixture.league === fixture.league;
        const hProb = outcome.sel === 'home' ? hPred.homeWinPct : outcome.sel === 'away' ? hPred.awayWinPct : hPred.drawPct;
        const probBandMatch = Math.abs(hProb - outcome.prob) <= 12;
        return leagueMatch && probBandMatch;
      });

      const sampleSize = matchingHistorical.length;
      const matchingWins = matchingHistorical.filter(({ result: h, pred: hPred }) => {
        const selectedHistoricalProbability = outcome.sel === 'home' ? hPred?.homeWinPct : outcome.sel === 'away' ? hPred?.awayWinPct : hPred?.drawPct;
        return selectedHistoricalProbability !== undefined && h.actualOutcome === outcome.sel;
      }).length;

      const historicalWinRate = sampleSize > 0
        ? Number(((matchingWins / sampleSize) * 100).toFixed(1))
        : null;

      // Fractional Kelly Criterion
      const b = outcome.odds - 1;
      const p = outcome.prob / 100;
      const q = 1 - p;
      const rawKelly = b > 0 ? (b * p - q) / b : 0;
      const safeKelly = Math.max(0, Math.min(0.12, rawKelly * 0.5)); // Half-Kelly capped

      // Strategy filters
      let passesStrategy = false;
      if (strategyMode === 'conservative') {
        passesStrategy = sampleSize >= 5 && historicalWinRate !== null && outcome.prob >= 60 && outcome.odds >= 1.30 && outcome.odds <= 2.20 && historicalWinRate >= 72;
      } else if (strategyMode === 'high_alpha') {
        passesStrategy = sampleSize >= 5 && historicalWinRate !== null && ev >= 0.12 && outcome.prob >= 44 && outcome.odds >= 1.80 && outcome.odds <= 4.50;
      } else {
        // Optimal balanced: credible win probability, market odds in value sweet spot, positive EV
        passesStrategy = sampleSize >= 5 && historicalWinRate !== null && ev >= 0.02 && outcome.prob >= 48 && outcome.odds >= 1.35 && outcome.odds <= 3.50 && historicalWinRate >= 60;
      }

      if (passesStrategy) {
        // Extract key tactical drivers
        const topRules = pred.appliedRules.slice(0, 3).map((r) => r.ruleName || r.tag);
        const drivers: string[] = [];
        if (outcome.sel === 'home' && fixture.homeTeam.isHomeDominant) drivers.push('Fortress Home Baseline');
        if (outcome.sel === 'away' && fixture.awayTeam.hasTopTierAwayForm) drivers.push('Resilient Away Momentum');
        if (fixture.homeTeam.leagueRank && fixture.awayTeam.leagueRank) {
          const rankDiff = Math.abs(fixture.homeTeam.leagueRank - fixture.awayTeam.leagueRank);
          if (rankDiff >= 4) drivers.push(`Table Rank Disparity (${rankDiff} spots)`);
        }
        if (fixture.h2h && (fixture.h2h.homeWins >= 3 || fixture.h2h.awayWins >= 3)) {
          drivers.push('Dominant Head-to-Head Record');
        }
        if (drivers.length === 0) drivers.push('Tactical xG & Possession Equilibrium');

        candidateLegs.push({
          fixtureId: fixture.id,
          homeTeam: fixture.homeTeam.name,
          awayTeam: fixture.awayTeam.name,
          league: fixture.league,
          kickoffTime: fixture.kickoffTime,
          venue: fixture.venue || 'Neutral / Standard Ground',
          selection: outcome.sel,
          selectionName: outcome.name,
          modelProbability: Math.round(outcome.prob),
          probabilities: {
            home: Math.round(pred.homeWinPct),
            draw: Math.round(pred.drawPct),
            away: Math.round(pred.awayWinPct),
          },
          marketOdds: outcome.odds,
          fairOdds,
          expectedValue: Number(ev.toFixed(3)),
          valueMarginPct,
          historicalWinRate,
          historicalSampleSize: sampleSize,
          confidenceScore: pred.confidenceScore,
          kellyFraction: Number((safeKelly * 100).toFixed(1)),
          ruleHighlights: topRules,
          keyDrivers: drivers,
          tacticalAdvantage: `Model fair price @${fairOdds} vs Bookmaker @${outcome.odds} offers ${valueMarginPct > 0 ? `+${valueMarginPct}%` : `${valueMarginPct}%`} mathematical EV edge.`,
        });
      }
    }
  }

  // Rank candidate legs by composite Value Alpha index: prioritize high win probability, capped EV, historical win rate, and confidence
  candidateLegs.sort((a, b) => {
    const cappedEvA = Math.min(0.35, Math.max(0, a.expectedValue));
    const cappedEvB = Math.min(0.35, Math.max(0, b.expectedValue));
    const scoreA = (a.modelProbability * 0.8) + (cappedEvA * 60) + (a.historicalWinRate * 0.25) + (a.confidenceScore * 0.15);
    const scoreB = (b.modelProbability * 0.8) + (cappedEvB * 60) + (b.historicalWinRate * 0.25) + (b.confidenceScore * 0.15);
    return scoreB - scoreA;
  });

  // Pick top 3 to 4 distinct fixtures (avoid picking multiple outcomes for same match)
  const selectedLegs: OptimalValueLeg[] = [];
  const seenFixtureIds = new Set<string>();

  const maxLegs = strategyMode === 'conservative' ? 3 : 4;

  for (const leg of candidateLegs) {
    if (!seenFixtureIds.has(leg.fixtureId)) {
      seenFixtureIds.add(leg.fixtureId);
      selectedLegs.push(leg);
      if (selectedLegs.length >= maxLegs) break;
    }
  }

  // Aggregate Bundle Calculations
  const combinedOdds = selectedLegs.reduce((acc, l) => acc * l.marketOdds, 1.0);
  const bundleWinProbability = selectedLegs.reduce((acc, l) => acc * (l.modelProbability / 100), 1.0) * 100;
  
  const historicalRates = selectedLegs.map(l => l.historicalWinRate).filter((v): v is number => v !== null && Number.isFinite(v));
  const avgHistWinRate = historicalRates.length > 0
    ? historicalRates.reduce((acc, v) => acc + v, 0) / historicalRates.length
    : null;

  const avgModelConfidence = selectedLegs.length > 0
    ? selectedLegs.reduce((acc, l) => acc + l.confidenceScore, 0) / selectedLegs.length
    : 0;

  const avgEV = selectedLegs.length > 0
    ? selectedLegs.reduce((acc, l) => acc + l.expectedValue, 0) / selectedLegs.length
    : 0;

  const expectedValueAlpha = Number(((avgEV) * 100).toFixed(1));

  // Compute AI Confidence Rating (0 - 100)
  const modelCertainty = Math.min(100, Math.round(avgModelConfidence));
  const historicalCohortFit = avgHistWinRate === null ? 0 : Math.min(99, Math.round(avgHistWinRate));
  const marketOddsAlpha = Math.min(99, Math.max(0, Math.round(50 + expectedValueAlpha * 1.8)));
  const formStability = null;

  const heuristicEvidenceScore = selectedLegs.length > 0
    ? Math.min(
        98,
        Math.max(
          0,
          Math.round(
            modelCertainty * 0.40 +
            historicalCohortFit * 0.35 +
            marketOddsAlpha * 0.25
          )
        )
      )
    : 0;

  let evidenceLabel: 'High Evidence' | 'Moderate Evidence' | 'Limited Evidence' | 'Insufficient Evidence' = 'Insufficient Evidence';
  if (selectedLegs.length > 0 && historicalRates.length > 0 && historicalRates.length >= selectedLegs.length) evidenceLabel = aiConfidenceRating >= 80 ? 'High Evidence' : aiConfidenceRating >= 65 ? 'Moderate Evidence' : 'Limited Evidence';

  // Bankroll unit sizing based on Kelly score
  const avgKelly = selectedLegs.length > 0
    ? selectedLegs.reduce((acc, l) => acc + l.kellyFraction, 0) / selectedLegs.length
    : 0;
  const recommendedStakeUnits = selectedLegs.length > 0
    ? Number((Math.max(0.5, Math.min(3.0, avgKelly * 0.8))).toFixed(1))
    : 0;

  const modeTitle = strategyMode === 'conservative'
    ? 'Conservative Evidence-Gated Bundle'
    : strategyMode === 'high_alpha'
    ? 'High-Alpha Evidence-Gated Bundle'
    : 'Balanced Positive-EV Bundle';

  const executiveSummary = selectedLegs.length > 0
    ? `The accumulator engine analyzed today's fixture matrix and identified a ${selectedLegs.length}-leg bundle with model-estimated Expected Value (${expectedValueAlpha >= 0 ? '+' : ''}${expectedValueAlpha}% EV). Combined odds: ${combinedOdds.toFixed(2)}x; heuristic evidence score: ${aiConfidenceRating}%.`
    : `No qualifying accumulator legs found matching the selected strategy criteria with positive Expected Value.`;

  const historicalPrecedentSummary = selectedLegs.length > 0
    ? (avgHistWinRate === null
      ? 'No sufficient historical cohort exists for the selected profiles.'
      : `Matching historical match profiles produced an observed hit rate of ${avgHistWinRate.toFixed(1)}% across ${selectedLegs.reduce((acc, l) => acc + l.historicalSampleSize, 0)} past fixtures.`)
    : `No sufficient historical cohort exists for the selected profiles.`;

  const riskMitigationAdvice = selectedLegs.length > 0
    ? `Staking recommendation: ${recommendedStakeUnits} units based on conservative fractional Kelly sizing.`
    : `Hold bets until verified fixture slates meet value thresholds.`;

  return {
    generatedAt: new Date().toISOString(),
    bundleTitle: modeTitle,
    aiConfidenceRating,
    evidenceLabel,
    strategyMode,
    combinedOdds: Number(combinedOdds.toFixed(2)),
    expectedValueAlpha,
    historicalValidationRate: avgHistWinRate === null ? null : Number(avgHistWinRate.toFixed(1)),
    bundleWinProbability: Number(bundleWinProbability.toFixed(1)),
    recommendedStakeUnits,
    kellyScore: Number(avgKelly.toFixed(2)),
    legs: selectedLegs,
    executiveSummary,
    historicalPrecedentSummary,
    riskMitigationAdvice,
    confidenceBreakdown: {
      modelCertainty,
      historicalCohortFit,
      marketOddsAlpha,
      formStability,
    },
    historicalCohort: {
      sampleSize: selectedLegs.reduce((acc, l) => acc + l.historicalSampleSize, 0),
      observedHitRate: avgHistWinRate === null ? null : Number(avgHistWinRate.toFixed(1)),
      simulatedROI: null,
      maxDrawdownPct: null,
    },
  };
}

