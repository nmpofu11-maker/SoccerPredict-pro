import {
  MatchFixture,
  PredictionResult,
  RuleAppliedItem,
  ManualOverrideType,
  EngineWeights,
} from '../types/soccer';
import { isFavouriteTeam, isHighVolatilityLeague } from '../constants/favourites';

export const DEFAULT_ENGINE_WEIGHTS: EngineWeights = {
  stakesMotivationBoost: 2.5,
  deadRubberPenalty: 0.20,
  rankPointsMultiplier: 0.40,
  formWinPoints: 1.20,
  formDrawPoints: 0.40,
  homeAdvantageBaseline: 10.0,
  awayAdvantageBaseline: 8.5,
  homeDominanceBonus: 0.15,
  awayFormBonus: 1.5,
  tacticalPossessionWeight: 0.15,
  tacticalShotsWeight: 0.45,
  h2hMultiplier: 6.0,
  fatiguePenaltyRate: 0.15,
  volatilityDrawBoost: 0.68,
  favouriteWinFloor: 55,
  drawEquilibriumMargin: 4.0,
  drawEquilibriumBoost: 38.0,
};

/**
 * Pure JavaScript 9-Rule Sequential Soccer Prediction Engine
 * Evaluates fixtures line-by-line using strictly ordered mathematical rules.
 * Accepts dynamic calibrated weights from the Self-Learning Optimization Engine.
 */
export function evaluateFixturePrediction(
  fixture: MatchFixture,
  manualOverride: ManualOverrideType = 'none',
  weights?: Partial<EngineWeights>
): PredictionResult {
  const w: EngineWeights = { ...DEFAULT_ENGINE_WEIGHTS, ...weights };
  const appliedRules: RuleAppliedItem[] = [];

  // Check 80 Priority Favourite status upfront for tagging & Rule 8
  const homeIsFav = isFavouriteTeam(fixture.homeTeam.name);
  const awayIsFav = isFavouriteTeam(fixture.awayTeam.name);
  const isFavouriteMatch = homeIsFav || awayIsFav;
  const favouriteTeams: string[] = [];
  if (homeIsFav) favouriteTeams.push(fixture.homeTeam.name);
  if (awayIsFav) favouriteTeams.push(fixture.awayTeam.name);

  // Initial baseline scores (Calibrated home advantage baseline vs away baseline)
  let homePoints = w.homeAdvantageBaseline;
  let awayPoints = w.awayAdvantageBaseline;
  let drawPoints = 6.8;

  const rawInitialPoints = { home: homePoints, away: awayPoints, draw: drawPoints };

  // ==========================================
  // RULE 1: League Title / Relegation Motivation
  // ==========================================
  if (fixture.motivation === 'title_race' || fixture.motivation === 'relegation_battle' || fixture.isHighStakes) {
    const motivationBoost = w.stakesMotivationBoost;
    homePoints += motivationBoost;
    awayPoints += motivationBoost;
    appliedRules.push({
      ruleNumber: 1,
      ruleName: 'Stakes Motivation Surge',
      tag: `Rule 1: High Stakes (+${motivationBoost.toFixed(1)} pts)`,
      impact: `+${motivationBoost.toFixed(1)} baseline points shifted up for high-stakes competition`,
      beneficiary: 'both',
      description: `Fixture flagged for ${fixture.motivation.replace('_', ' ')}. Elevated tactical urgency.`,
    });
  } else if (fixture.motivation === 'dead_rubber') {
    const penaltyRate = w.deadRubberPenalty;
    homePoints *= (1 - penaltyRate);
    awayPoints *= (1 - penaltyRate);
    drawPoints *= 1.15; // Draws increase in dead rubbers
    appliedRules.push({
      ruleNumber: 1,
      ruleName: 'Dead-Rubber Penalty',
      tag: `Rule 1: ${Math.round(penaltyRate * 100)}% Variance Penalty`,
      impact: `-${Math.round(penaltyRate * 100)}% baseline conviction penalty due to dead-rubber state`,
      beneficiary: 'draw',
      description: 'End-of-season / dead rubber fixture with no promotion or relegation stakes.',
    });
  }

  // ==========================================
  // RULE 2: The 8-Place Position Gap Rule
  // ==========================================
  const rankDifference = fixture.awayTeam.leagueRank - fixture.homeTeam.leagueRank;
  const rankPts = Math.round(Math.abs(rankDifference) * w.rankPointsMultiplier * 10) / 10;
  if (rankDifference >= 8) {
    homePoints += rankPts;
    appliedRules.push({
      ruleNumber: 2,
      ruleName: '8-Place Position Gap',
      tag: `Rule 2: Position Gap (+${rankPts} pts Home)`,
      impact: `+${rankPts} baseline points to Home team`,
      beneficiary: 'home',
      description: `Home team rank (#${fixture.homeTeam.leagueRank}) is ${rankDifference} spots higher than Away (#${fixture.awayTeam.leagueRank}).`,
    });
  } else if (rankDifference <= -8) {
    awayPoints += rankPts;
    appliedRules.push({
      ruleNumber: 2,
      ruleName: '8-Place Position Gap',
      tag: `Rule 2: Position Gap (+${rankPts} pts Away)`,
      impact: `+${rankPts} baseline points to Away team`,
      beneficiary: 'away',
      description: `Away team rank (#${fixture.awayTeam.leagueRank}) is ${Math.abs(rankDifference)} spots higher than Home (#${fixture.homeTeam.leagueRank}).`,
    });
  }

  // ==========================================
  // RULE 3: Home Dominance Bias
  // ==========================================
  if (fixture.homeTeam.isHomeDominant) {
    if (fixture.awayTeam.hasTopTierAwayForm) {
      appliedRules.push({
        ruleNumber: 3,
        ruleName: 'Home Dominance Neutralized',
        tag: 'Rule 3: Dominance Neutralized',
        impact: 'Home bias neutralized by elite away form',
        beneficiary: 'neutral',
        description: 'Home team has dominant home record, but neutralized by Away team top-tier road record.',
      });
    } else {
      const originalHome = homePoints;
      homePoints *= (1 + w.homeDominanceBonus);
      const boost = (homePoints - originalHome).toFixed(1);
      appliedRules.push({
        ruleNumber: 3,
        ruleName: 'Home Dominance Bias',
        tag: `Rule 3: Home Dominance (+${Math.round(w.homeDominanceBonus * 100)}%)`,
        impact: `+${Math.round(w.homeDominanceBonus * 100)}% multiplier applied (+${boost} pts)`,
        beneficiary: 'home',
        description: 'Home team fortress record validated; away side lacks top-tier neutralizing form.',
      });
    }
  }

  // ==========================================
  // RULE 4: Historical Head-to-Head (H2H) Weighting
  // ==========================================
  const h2hBonus = w.h2hMultiplier;
  if (fixture.h2h.homeWins >= 4) {
    homePoints += h2hBonus;
    appliedRules.push({
      ruleNumber: 4,
      ruleName: 'H2H Dominance Bonus',
      tag: `Rule 4: H2H Dominance (+${h2hBonus.toFixed(1)} pts Home)`,
      impact: `+${h2hBonus.toFixed(1)} points override bonus to Home team`,
      beneficiary: 'home',
      description: `Home team won ${fixture.h2h.homeWins} of the last ${fixture.h2h.totalLast5 || 5} head-to-head encounters.`,
    });
  } else if (fixture.h2h.awayWins >= 4) {
    awayPoints += h2hBonus;
    appliedRules.push({
      ruleNumber: 4,
      ruleName: 'H2H Dominance Bonus',
      tag: `Rule 4: H2H Dominance (+${h2hBonus.toFixed(1)} pts Away)`,
      impact: `+${h2hBonus.toFixed(1)} points override bonus to Away team`,
      beneficiary: 'away',
      description: `Away team won ${fixture.h2h.awayWins} of the last ${fixture.h2h.totalLast5 || 5} head-to-head encounters.`,
    });
  }

  // ==========================================
  // RULE 5: Possession & Shot Dominance Ratio
  // ==========================================
  const sotDiff = fixture.homeTeam.avgShotsOnTarget - fixture.awayTeam.avgShotsOnTarget;
  const shotBonus = Math.round((Math.abs(sotDiff) * w.tacticalShotsWeight + 1.5) * 10) / 10;
  if (fixture.homeTeam.avgPossession > 55 && sotDiff >= 3) {
    homePoints += shotBonus;
    appliedRules.push({
      ruleNumber: 5,
      ruleName: 'Possession & Shot Dominance',
      tag: `Rule 5: Shot/Possession Edge (+${shotBonus} pts Home)`,
      impact: `+${shotBonus} points score modifier to Home team`,
      beneficiary: 'home',
      description: `Home averages ${fixture.homeTeam.avgPossession}% possession and +${sotDiff.toFixed(1)} shots on target.`,
    });
  } else if (fixture.awayTeam.avgPossession > 55 && sotDiff <= -3) {
    awayPoints += shotBonus;
    appliedRules.push({
      ruleNumber: 5,
      ruleName: 'Possession & Shot Dominance',
      tag: `Rule 5: Shot/Possession Edge (+${shotBonus} pts Away)`,
      impact: `+${shotBonus} points score modifier to Away team`,
      beneficiary: 'away',
      description: `Away averages ${fixture.awayTeam.avgPossession}% possession and +${Math.abs(sotDiff).toFixed(1)} shots on target.`,
    });
  }

  // ==========================================
  // RULE 6: Cup & Continental Fixture Fatigue
  // ==========================================
  const fatigueRate = w.fatiguePenaltyRate;
  if (fixture.homeTeam.hasMidweekFatigue72h) {
    homePoints *= (1 - fatigueRate);
    appliedRules.push({
      ruleNumber: 6,
      ruleName: 'Cup/Continental Fatigue',
      tag: `Rule 6: 72h Fatigue (-${Math.round(fatigueRate * 100)}% Home)`,
      impact: `-${Math.round(fatigueRate * 100)}% physical performance reduction to Home team`,
      beneficiary: 'away',
      description: 'Home team scheduled mid-week cup/continental travel within 72 hours of kickoff.',
    });
  }
  if (fixture.awayTeam.hasMidweekFatigue72h) {
    awayPoints *= (1 - fatigueRate);
    appliedRules.push({
      ruleNumber: 6,
      ruleName: 'Cup/Continental Fatigue',
      tag: `Rule 6: 72h Fatigue (-${Math.round(fatigueRate * 100)}% Away)`,
      impact: `-${Math.round(fatigueRate * 100)}% physical performance reduction to Away team`,
      beneficiary: 'home',
      description: 'Away team scheduled mid-week cup/continental travel within 72 hours of kickoff.',
    });
  }

  // Calculate standard intermediate probability distribution
  const totalScore = homePoints + awayPoints + drawPoints;
  let homeWinPct = (homePoints / totalScore) * 100;
  let awayWinPct = (awayPoints / totalScore) * 100;
  let drawPct = (drawPoints / totalScore) * 100;

  // ==========================================
  // RULE 7: High-Volatility League Cap
  // ==========================================
  let isVolatilityCompressed = false;
  if (isHighVolatilityLeague(fixture.league)) {
    isVolatilityCompressed = true;
    const center = 33.33;
    const compressionFactor = w.volatilityDrawBoost;

    homeWinPct = center + (homeWinPct - center) * compressionFactor;
    awayWinPct = center + (awayWinPct - center) * compressionFactor;
    drawPct = center + (drawPct - center) * compressionFactor;

    // Renormalize to 100%
    const currentSum = homeWinPct + awayWinPct + drawPct;
    homeWinPct = (homeWinPct / currentSum) * 100;
    awayWinPct = (awayWinPct / currentSum) * 100;
    drawPct = (drawPct / currentSum) * 100;

    appliedRules.push({
      ruleNumber: 7,
      ruleName: 'High-Volatility League Cap',
      tag: 'Rule 7: Volatility Flattening',
      impact: `Extreme probability spikes safely compressed (damping factor: ${compressionFactor.toFixed(2)})`,
      beneficiary: 'neutral',
      description: `${fixture.league} is indexed in the high-volatility master configuration.`,
    });
  }

  // ==========================================
  // RULE 8: Manual Overwrite & Forced Selection Override
  // ==========================================
  let finalOverrideApplied = false;
  const floorThreshold = w.favouriteWinFloor;

  if (manualOverride === 'force_home') {
    homeWinPct = 75.0;
    drawPct = 15.0;
    awayWinPct = 10.0;
    finalOverrideApplied = true;
    appliedRules.push({
      ruleNumber: 8,
      ruleName: 'Manual Selection Override',
      tag: 'Rule 8: Force Home (75%)',
      impact: 'Manual user override enforced: Home 75% | Draw 15% | Away 10%',
      beneficiary: 'home',
      description: 'User initiated manual override via device localStorage.',
    });
  } else if (manualOverride === 'force_away') {
    homeWinPct = 10.0;
    drawPct = 15.0;
    awayWinPct = 75.0;
    finalOverrideApplied = true;
    appliedRules.push({
      ruleNumber: 8,
      ruleName: 'Manual Selection Override',
      tag: 'Rule 8: Force Away (75%)',
      impact: 'Manual user override enforced: Home 10% | Draw 15% | Away 75%',
      beneficiary: 'away',
      description: 'User initiated manual override via device localStorage.',
    });
  } else if (isFavouriteMatch) {
    if (homeIsFav && !awayIsFav) {
      if (homeWinPct < floorThreshold) {
        const remaining = 100.0 - floorThreshold;
        const currentOtherTotal = (awayWinPct + drawPct) || 1;
        awayWinPct = (awayWinPct / currentOtherTotal) * remaining;
        drawPct = (drawPct / currentOtherTotal) * remaining;
        homeWinPct = floorThreshold;

        appliedRules.push({
          ruleNumber: 8,
          ruleName: 'Priority Favourite Win Floor',
          tag: `Rule 8: Favourite Floor (≥${floorThreshold}%)`,
          impact: `Home win probability elevated to ${floorThreshold}% calibrated floor`,
          beneficiary: 'home',
          description: `${fixture.homeTeam.name} is one of the 80 Priority Favourite teams. Floor enforced.`,
        });
      } else {
        appliedRules.push({
          ruleNumber: 8,
          ruleName: 'Priority Favourite Validated',
          tag: `Rule 8: Favourite Confirmed (>${floorThreshold}%)`,
          impact: `Natural win probability (${homeWinPct.toFixed(1)}%) exceeds ${floorThreshold}% floor`,
          beneficiary: 'home',
          description: `${fixture.homeTeam.name} priority favourite status verified.`,
        });
      }
    } else if (awayIsFav && !homeIsFav) {
      if (awayWinPct < floorThreshold) {
        const remaining = 100.0 - floorThreshold;
        const currentOtherTotal = (homeWinPct + drawPct) || 1;
        homeWinPct = (homeWinPct / currentOtherTotal) * remaining;
        drawPct = (drawPct / currentOtherTotal) * remaining;
        awayWinPct = floorThreshold;

        appliedRules.push({
          ruleNumber: 8,
          ruleName: 'Priority Favourite Win Floor',
          tag: `Rule 8: Favourite Floor (≥${floorThreshold}%)`,
          impact: `Away win probability elevated to ${floorThreshold}% calibrated floor`,
          beneficiary: 'away',
          description: `${fixture.awayTeam.name} is one of the 80 Priority Favourite teams. Floor enforced.`,
        });
      } else {
        appliedRules.push({
          ruleNumber: 8,
          ruleName: 'Priority Favourite Validated',
          tag: `Rule 8: Favourite Confirmed (>${floorThreshold}%)`,
          impact: `Natural win probability (${awayWinPct.toFixed(1)}%) exceeds ${floorThreshold}% floor`,
          beneficiary: 'away',
          description: `${fixture.awayTeam.name} priority favourite status verified.`,
        });
      }
    } else if (homeIsFav && awayIsFav) {
      // Both are in the 80 favourites list (Clash of Titans)
      // Whichever has higher mathematical points gets the floor advantage
      if (homePoints >= awayPoints && homeWinPct < 50.0) {
        homeWinPct = 52.0;
        awayWinPct = 32.0;
        drawPct = 16.0;
      } else if (awayPoints > homePoints && awayWinPct < 50.0) {
        awayWinPct = 52.0;
        homeWinPct = 32.0;
        drawPct = 16.0;
      }
      appliedRules.push({
        ruleNumber: 8,
        ruleName: 'Dual Favourite Clash',
        tag: 'Rule 8: Dual Favourite Clash',
        impact: 'Both competitors belong to Priority Favourite matrix',
        beneficiary: 'both',
        description: `Direct clash between priority favourites: ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}.`,
      });
    }
  }

  // Ensure exact rounding to 1 decimal place summing to 100%
  let roundedHome = Math.round(homeWinPct * 10) / 10;
  let roundedAway = Math.round(awayWinPct * 10) / 10;
  let roundedDraw = Math.round((100 - roundedHome - roundedAway) * 10) / 10;

  // ==========================================
  // RULE 9: Close-Contest Draw Equilibrium (Stalemate Parity)
  // ==========================================
  // When neither competitor has established a decisive statistical advantage (within margin threshold),
  // and no manual override is active, deadlock parity elevates draw probability to reflect real-world stalemate likelihood.
  const drawMarginThreshold = w.drawEquilibriumMargin ?? 4.0;
  const drawTargetBoost = w.drawEquilibriumBoost ?? 38.0;

  if (manualOverride === 'none' && Math.abs(roundedHome - roundedAway) <= drawMarginThreshold) {
    const remainingProb = 100.0 - drawTargetBoost;
    const totalHomeAway = (roundedHome + roundedAway) || 1;

    roundedHome = Math.round(((roundedHome / totalHomeAway) * remainingProb) * 10) / 10;
    roundedAway = Math.round(((roundedAway / totalHomeAway) * remainingProb) * 10) / 10;
    roundedDraw = Math.round((100.0 - roundedHome - roundedAway) * 10) / 10;

    appliedRules.push({
      ruleNumber: 9,
      ruleName: 'Close-Contest Draw Equilibrium',
      tag: `Rule 9: Contest Equilibrium (Margin ≤ ${drawMarginThreshold.toFixed(1)}%)`,
      impact: `Draw calibrated to ${roundedDraw.toFixed(1)}% (Stalemate Parity)`,
      beneficiary: 'draw',
      description: `Home and away win probabilities separated by only ${Math.abs(homeWinPct - awayWinPct).toFixed(1)}% (≤ ${drawMarginThreshold}%). Statistical deadlock elevates draw likelihood.`,
    });
  }

  // Determine predicted winner
  let predictedWinner: 'home' | 'draw' | 'away' = 'home';
  if (roundedDraw > roundedHome && roundedDraw > roundedAway) {
    predictedWinner = 'draw';
  } else if (roundedAway > roundedHome && roundedAway > roundedDraw) {
    predictedWinner = 'away';
  }

  // Calculate confidence score (based on margin between leader and second)
  const maxPct = Math.max(roundedHome, roundedAway, roundedDraw);
  const confidenceScore = Math.min(96, Math.max(48, Math.round(maxPct * 1.15)));

  return {
    matchId: fixture.id,
    homeWinPct: roundedHome,
    drawPct: Math.max(0, roundedDraw),
    awayWinPct: roundedAway,
    predictedWinner,
    confidenceScore,
    appliedRules,
    rawPoints: rawInitialPoints,
    finalPoints: {
      home: Math.round(homePoints * 10) / 10,
      away: Math.round(awayPoints * 10) / 10,
      draw: Math.round(drawPoints * 10) / 10,
    },
    isFavouriteMatch,
    favouriteTeams,
    manualOverride,
    isVolatilityCompressed,
  };
}

/**
 * Sequential batch evaluator for incoming fixture collections.
 */
export function evaluateAllFixtures(
  fixtures: MatchFixture[],
  overridesMap: Record<string, ManualOverrideType> = {},
  weights?: Partial<EngineWeights>
): Record<string, PredictionResult> {
  const results: Record<string, PredictionResult> = {};
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const override = overridesMap[fixture.id] || 'none';
    results[fixture.id] = evaluateFixturePrediction(fixture, override, weights);
  }
  return results;
}
