import {
  MatchFixture,
  PredictionResult,
  RuleAppliedItem,
  ManualOverrideType,
  EngineWeights,
} from '../types/soccer';
import { isFavouriteTeam, isHighVolatilityLeague, getLeagueClusterProfile } from '../constants/favourites';
import { computeComparativeDominance } from '../utils/robustMetricsCalculator';
import { resolveTeamPerformanceProfile, formatSquadValue } from '../utils/teamPerformanceProfile';

export const DEFAULT_ENGINE_WEIGHTS: EngineWeights = {
  stakesMotivationBoost: 2.5,
  deadRubberPenalty: 0.20,
  rankPointsMultiplier: 0.40,
  formWinPoints: 1.20,
  formDrawPoints: 0.40,
  homeAdvantageBaseline: 9.4,
  awayAdvantageBaseline: 8.8,
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
  lastSeasonStandingWeight: 0.30,
  squadValueWeight: 0.40,
  matchRatingWeight: 4.50,
  lowTotalDrawBoost: 1.25,
  defensiveSynergyDrawWeight: 0.35,
  leagueClusterWeight: 0.40,
  xgWeight: 0.50,
  absencePenaltyRate: 0.12,
};

/**
 * Validates and sanitizes engine weights, strictly replacing null, undefined, NaN, or non-finite values
 * with their canonical default values.
 */
export function sanitizeEngineWeights(weights?: Partial<EngineWeights> | null): EngineWeights {
  const result: EngineWeights = { ...DEFAULT_ENGINE_WEIGHTS };
  if (!weights || typeof weights !== 'object') return result;

  for (const key of Object.keys(DEFAULT_ENGINE_WEIGHTS) as (keyof EngineWeights)[]) {
    const val = weights[key];
    if (typeof val === 'number' && Number.isFinite(val) && !isNaN(val)) {
      result[key] = val;
    }
  }
  return result;
}

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
  const w: EngineWeights = sanitizeEngineWeights(weights);
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

  // League-Specific Cluster Archetype Calibration (Defensive draw-heavy vs High-scoring vs Fortress)
  const leagueCluster = getLeagueClusterProfile(fixture.league);
  if (leagueCluster.archetype !== 'standard') {
    const clusterDrawAdj = (leagueCluster.drawBias || 0) * (w.leagueClusterWeight ?? 0.40);
    drawPoints += clusterDrawAdj;
    if (leagueCluster.homeMultiplierBonus !== 0) {
      homePoints *= (1 + leagueCluster.homeMultiplierBonus);
    }
    appliedRules.push({
      ruleNumber: 7,
      ruleName: 'League Cluster Archetype',
      tag: `Rule 7: ${leagueCluster.label}`,
      impact: `Draw base points ${clusterDrawAdj >= 0 ? '+' : ''}${clusterDrawAdj.toFixed(2)} pts; Home factor adjusted by ${(leagueCluster.homeMultiplierBonus * 100).toFixed(0)}%`,
      beneficiary: leagueCluster.drawBias > 0 ? 'draw' : leagueCluster.homeMultiplierBonus > 0 ? 'home' : 'neutral',
      description: `Tactical cluster classification: ${leagueCluster.label}. Adapting baseline to domestic competition characteristics.`,
    });
  }

  const rawInitialPoints = { home: homePoints, away: awayPoints, draw: drawPoints };

  // Resolve canonical profiles for previous season standing, squad value, and match rating
  const homeProfile = resolveTeamPerformanceProfile(fixture.homeTeam, fixture.league);
  const awayProfile = resolveTeamPerformanceProfile(fixture.awayTeam, fixture.league);

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
  // RULE 2: Table Position & Previous Season Competition Standing Gap
  // ==========================================
  // Part A: Current Table Position Differential (Rank Difference ≥ 3 Places)
  const rankDifference = fixture.awayTeam.leagueRank - fixture.homeTeam.leagueRank;
  const rankPts = Math.round(Math.abs(rankDifference) * w.rankPointsMultiplier * 10) / 10;
  if (rankDifference >= 3) {
    homePoints += rankPts;
    appliedRules.push({
      ruleNumber: 2,
      ruleName: 'Position Gap Edge',
      tag: `Rule 2: Position Gap (+${rankPts} pts Home)`,
      impact: `+${rankPts} baseline points to Home team`,
      beneficiary: 'home',
      description: `Home team rank (#${fixture.homeTeam.leagueRank}) is ${rankDifference} spots higher than Away (#${fixture.awayTeam.leagueRank}).`,
    });
  } else if (rankDifference <= -3) {
    awayPoints += rankPts;
    appliedRules.push({
      ruleNumber: 2,
      ruleName: 'Position Gap Edge',
      tag: `Rule 2: Position Gap (+${rankPts} pts Away)`,
      impact: `+${rankPts} baseline points to Away team`,
      beneficiary: 'away',
      description: `Away team rank (#${fixture.awayTeam.leagueRank}) is ${Math.abs(rankDifference)} spots higher than Home (#${fixture.homeTeam.leagueRank}).`,
    });
  }

  // Part B: Previous Season Final Standing in Same Competition
  const lastSeasonRankHome = Number.isFinite(fixture.homeTeam.lastSeasonRank)
    ? (fixture.homeTeam.lastSeasonRank as number)
    : (homeProfile.lastSeasonRank || 10);
  const lastSeasonRankAway = Number.isFinite(fixture.awayTeam.lastSeasonRank)
    ? (fixture.awayTeam.lastSeasonRank as number)
    : (awayProfile.lastSeasonRank || 10);
  const lastSeasonStandingHome = fixture.homeTeam.lastSeasonStanding ?? homeProfile.lastSeasonStanding;
  const lastSeasonStandingAway = fixture.awayTeam.lastSeasonStanding ?? awayProfile.lastSeasonStanding;

  const lastSeasonGap = lastSeasonRankAway - lastSeasonRankHome;
  const pedigreeWeight = Number.isFinite(w.lastSeasonStandingWeight) ? w.lastSeasonStandingWeight : 0.30;
  const pedigreeRaw = Math.abs(lastSeasonGap) * pedigreeWeight;
  const pedigreePts = Number.isFinite(pedigreeRaw)
    ? Math.min(3.5, Math.max(0, Math.round(pedigreeRaw * 10) / 10))
    : 0;

  if (lastSeasonGap >= 3 && pedigreePts > 0) {
    homePoints += pedigreePts;
    const isHomeChampion = lastSeasonRankHome === 1;
    const isAwayPromoted = lastSeasonRankAway >= 21;
    appliedRules.push({
      ruleNumber: 2,
      ruleName: 'Previous Season Standing Pedigree',
      tag: `Rule 2: Last Season Pedigree (+${pedigreePts.toFixed(1)} pts Home)`,
      impact: `+${pedigreePts.toFixed(1)} baseline points to Home for superior final standing in this competition last season`,
      beneficiary: 'home',
      description: `Home finished #${lastSeasonRankHome} (${lastSeasonStandingHome}) vs Away #${lastSeasonRankAway} (${lastSeasonStandingAway}) in this competition last season (${lastSeasonGap} spots higher).${isHomeChampion ? ' Includes reigning champion pedigree bonus.' : ''}${isAwayPromoted ? ' Away side was newly promoted.' : ''}`,
    });
  } else if (lastSeasonGap <= -3 && pedigreePts > 0) {
    awayPoints += pedigreePts;
    const isAwayChampion = lastSeasonRankAway === 1;
    const isHomePromoted = lastSeasonRankHome >= 21;
    appliedRules.push({
      ruleNumber: 2,
      ruleName: 'Previous Season Standing Pedigree',
      tag: `Rule 2: Last Season Pedigree (+${pedigreePts.toFixed(1)} pts Away)`,
      impact: `+${pedigreePts.toFixed(1)} baseline points to Away for superior final standing in this competition last season`,
      beneficiary: 'away',
      description: `Away finished #${lastSeasonRankAway} (${lastSeasonStandingAway}) vs Home #${lastSeasonRankHome} (${lastSeasonStandingHome}) in this competition last season (${Math.abs(lastSeasonGap)} spots higher).${isAwayChampion ? ' Includes reigning champion pedigree bonus.' : ''}${isHomePromoted ? ' Home side was newly promoted.' : ''}`,
    });
  }

  // ==========================================
  // RULE 3: Home Dominance Bias & Away Road Form
  // ==========================================
  if (fixture.awayTeam.hasTopTierAwayForm) {
    awayPoints += w.awayFormBonus;
    appliedRules.push({
      ruleNumber: 3,
      ruleName: 'Elite Road Form Bonus',
      tag: `Rule 3: Elite Road Form (+${w.awayFormBonus.toFixed(1)} pts Away)`,
      impact: `+${w.awayFormBonus.toFixed(1)} points bonus to Away team for top-tier away form`,
      beneficiary: 'away',
      description: 'Away team possesses verified top-tier away form record.',
    });
  }

  if (fixture.homeTeam.isHomeDominant) {
    if (fixture.awayTeam.hasTopTierAwayForm) {
      appliedRules.push({
        ruleNumber: 3,
        ruleName: 'Home Dominance Neutralized',
        tag: 'Rule 3: Fortress Neutralized',
        impact: 'Home fortress multiplier neutralized by Away top-tier road form',
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
  // RULE 5: Possession & Shot Dominance Ratio (Outlier-Filtered & Schedule-Adjusted)
  // ==========================================
  const comparativeDominance = computeComparativeDominance(fixture.homeTeam, fixture.awayTeam);
  const { homeMetrics, awayMetrics, effectiveSotDiff, rawSotDiff, misleadingWarning } = comparativeDominance;
  const shotBonus = Math.round((Math.abs(effectiveSotDiff) * w.tacticalShotsWeight + 1.5) * 10) / 10;

  // Evaluated on normalized metrics to prevent false signals from stat-padding against lower-table opposition
  if (homeMetrics.effectivePossession > 53 && effectiveSotDiff >= 2.5) {
    homePoints += shotBonus;
    const scheduleNormalized = homeMetrics.schedule.scheduleType === 'soft_schedule';
    appliedRules.push({
      ruleNumber: 5,
      ruleName: 'Possession & Shot Dominance',
      tag: `Rule 5: Shot/Possession Edge (+${shotBonus} pts Home)${scheduleNormalized ? ' [Schedule-Adjusted]' : ''}`,
      impact: `+${shotBonus} points score modifier to Home team (Effective +${effectiveSotDiff.toFixed(1)} SOT)`,
      beneficiary: 'home',
      description: misleadingWarning
        ? `${misleadingWarning} Normalized against lower-table bias; awarded calibrated +${shotBonus} pts.`
        : `Home holds effective ${homeMetrics.effectivePossession}% possession and +${effectiveSotDiff.toFixed(1)} SOT edge (opposition-strength adjusted).`,
    });
  } else if (awayMetrics.effectivePossession > 53 && effectiveSotDiff <= -2.5) {
    awayPoints += shotBonus;
    const scheduleNormalized = awayMetrics.schedule.scheduleType === 'soft_schedule';
    appliedRules.push({
      ruleNumber: 5,
      ruleName: 'Possession & Shot Dominance',
      tag: `Rule 5: Shot/Possession Edge (+${shotBonus} pts Away)${scheduleNormalized ? ' [Schedule-Adjusted]' : ''}`,
      impact: `+${shotBonus} points score modifier to Away team (Effective +${Math.abs(effectiveSotDiff).toFixed(1)} SOT)`,
      beneficiary: 'away',
      description: misleadingWarning
        ? `${misleadingWarning} Normalized against lower-table bias; awarded calibrated +${shotBonus} pts.`
        : `Away holds effective ${awayMetrics.effectivePossession}% possession and +${Math.abs(effectiveSotDiff).toFixed(1)} SOT edge (opposition-strength adjusted).`,
    });
  } else if (misleadingWarning) {
    // Audit log when raw stats suggested an edge that was neutralized after schedule evaluation
    appliedRules.push({
      ruleNumber: 5,
      ruleName: 'Schedule Normalization Audit',
      tag: 'Rule 5: Stat Inflation Neutralized (0 pts)',
      impact: 'Unearned dominance bonus withheld after schedule difficulty audit',
      beneficiary: 'neutral',
      description: misleadingWarning,
    });
  }

  // Part B: Total Squad Market Value Disparity (Roster Depth & Quality)
  const homeSquadVal = Number.isFinite(fixture.homeTeam.totalSquadValueEur)
    ? (fixture.homeTeam.totalSquadValueEur as number)
    : (homeProfile.totalSquadValueEur || 150);
  const awaySquadVal = Number.isFinite(fixture.awayTeam.totalSquadValueEur)
    ? (fixture.awayTeam.totalSquadValueEur as number)
    : (awayProfile.totalSquadValueEur || 150);
  const valRatio = (homeSquadVal > 0 && awaySquadVal > 0)
    ? (homeSquadVal / awaySquadVal)
    : 1;
  const squadValWeight = Number.isFinite(w.squadValueWeight) ? w.squadValueWeight : 0.40;

  if (valRatio >= 1.40) {
    const rawBonus = Math.log2(valRatio) * squadValWeight + 0.6;
    const valueBonus = Number.isFinite(rawBonus) ? Math.min(3.2, Math.max(0, Math.round(rawBonus * 10) / 10)) : 0;
    if (valueBonus > 0) {
      homePoints += valueBonus;
      appliedRules.push({
        ruleNumber: 5,
        ruleName: 'Total Squad Value Disparity',
        tag: `Rule 5: Squad Value Edge (+${valueBonus.toFixed(1)} pts Home)`,
        impact: `+${valueBonus.toFixed(1)} points bonus to Home based on ${valRatio.toFixed(1)}x squad valuation advantage (${formatSquadValue(homeSquadVal)} vs ${formatSquadValue(awaySquadVal)})`,
        beneficiary: 'home',
        description: `Home squad valuation (${formatSquadValue(homeSquadVal)}) exceeds Away (${formatSquadValue(awaySquadVal)}) by ${valRatio.toFixed(1)}x, reflecting elite roster depth and game-changing individual talent.`,
      });
    }
  } else if (valRatio <= 0.71) {
    const invRatio = 1 / Math.max(valRatio, 0.01);
    const rawBonus = Math.log2(invRatio) * squadValWeight + 0.6;
    const valueBonus = Number.isFinite(rawBonus) ? Math.min(3.2, Math.max(0, Math.round(rawBonus * 10) / 10)) : 0;
    if (valueBonus > 0) {
      awayPoints += valueBonus;
      appliedRules.push({
        ruleNumber: 5,
        ruleName: 'Total Squad Value Disparity',
        tag: `Rule 5: Squad Value Edge (+${valueBonus.toFixed(1)} pts Away)`,
        impact: `+${valueBonus.toFixed(1)} points bonus to Away based on ${invRatio.toFixed(1)}x squad valuation advantage (${formatSquadValue(awaySquadVal)} vs ${formatSquadValue(homeSquadVal)})`,
        beneficiary: 'away',
        description: `Away squad valuation (${formatSquadValue(awaySquadVal)}) exceeds Home (${formatSquadValue(homeSquadVal)}) by ${invRatio.toFixed(1)}x, reflecting elite roster depth and game-changing individual talent.`,
      });
    }
  }

  // Part C: Average Match Rating Superiority
  const homeRating = Number.isFinite(fixture.homeTeam.avgMatchRating)
    ? (fixture.homeTeam.avgMatchRating as number)
    : (homeProfile.avgMatchRating || 6.75);
  const awayRating = Number.isFinite(fixture.awayTeam.avgMatchRating)
    ? (fixture.awayTeam.avgMatchRating as number)
    : (awayProfile.avgMatchRating || 6.75);
  const ratingDiff = Math.round((homeRating - awayRating) * 100) / 100;
  const mRatingWeight = Number.isFinite(w.matchRatingWeight) ? w.matchRatingWeight : 4.50;

  if (Math.abs(ratingDiff) >= 0.12) {
    const rawRatingBonus = Math.abs(ratingDiff) * mRatingWeight;
    const ratingBonus = Number.isFinite(rawRatingBonus) ? Math.min(2.8, Math.max(0, Math.round(rawRatingBonus * 10) / 10)) : 0;
    if (ratingBonus > 0) {
      if (ratingDiff >= 0.12) {
        homePoints += ratingBonus;
        appliedRules.push({
          ruleNumber: 5,
          ruleName: 'Average Match Rating Superiority',
          tag: `Rule 5: Match Rating Edge (+${ratingBonus.toFixed(1)} pts Home)`,
          impact: `+${ratingBonus.toFixed(1)} points bonus to Home for higher match rating (${homeRating.toFixed(2)} vs ${awayRating.toFixed(2)})`,
          beneficiary: 'home',
          description: `Home holds a +${ratingDiff.toFixed(2)} average match rating superiority (${homeRating.toFixed(2)} vs ${awayRating.toFixed(2)}), reflecting higher individual duel success and all-phase execution.`,
        });
      } else {
        awayPoints += ratingBonus;
        appliedRules.push({
          ruleNumber: 5,
          ruleName: 'Average Match Rating Superiority',
          tag: `Rule 5: Match Rating Edge (+${ratingBonus.toFixed(1)} pts Away)`,
          impact: `+${ratingBonus.toFixed(1)} points bonus to Away for higher match rating (${awayRating.toFixed(2)} vs ${homeRating.toFixed(2)})`,
          beneficiary: 'away',
          description: `Away holds a +${Math.abs(ratingDiff).toFixed(2)} average match rating superiority (${awayRating.toFixed(2)} vs ${homeRating.toFixed(2)}), reflecting higher individual duel success and all-phase execution.`,
        });
      }
    }
  }

  // Part D: Expected Goals (xG) Differential & Critical Lineup Absences
  const homeXG = Number.isFinite(fixture.homeTeam.expectedGoalsAvg) ? (fixture.homeTeam.expectedGoalsAvg as number) : undefined;
  const awayXG = Number.isFinite(fixture.awayTeam.expectedGoalsAvg) ? (fixture.awayTeam.expectedGoalsAvg as number) : undefined;
  if (homeXG !== undefined && awayXG !== undefined) {
    const xgDiff = Math.round((homeXG - awayXG) * 100) / 100;
    const xgWeight = Number.isFinite(w.xgWeight) ? w.xgWeight : 0.50;
    if (Math.abs(xgDiff) >= 0.35) {
      const xgBonus = Math.min(3.0, Math.max(0, Math.round(Math.abs(xgDiff) * xgWeight * 10) / 10));
      if (xgDiff > 0) {
        homePoints += xgBonus;
        appliedRules.push({
          ruleNumber: 5,
          ruleName: 'Expected Goals (xG) Dominance',
          tag: `Rule 5: xG Edge (+${xgBonus.toFixed(1)} pts Home)`,
          impact: `+${xgBonus.toFixed(1)} points to Home based on +${xgDiff.toFixed(2)} rolling xG superiority (${homeXG.toFixed(2)} vs ${awayXG.toFixed(2)})`,
          beneficiary: 'home',
          description: `Home team creates consistently higher quality scoring chances (+${xgDiff.toFixed(2)} xG/match).`,
        });
      } else {
        awayPoints += xgBonus;
        appliedRules.push({
          ruleNumber: 5,
          ruleName: 'Expected Goals (xG) Dominance',
          tag: `Rule 5: xG Edge (+${xgBonus.toFixed(1)} pts Away)`,
          impact: `+${xgBonus.toFixed(1)} points to Away based on +${Math.abs(xgDiff).toFixed(2)} rolling xG superiority (${awayXG.toFixed(2)} vs ${homeXG.toFixed(2)})`,
          beneficiary: 'away',
          description: `Away team creates consistently higher quality scoring chances (+${Math.abs(xgDiff).toFixed(2)} xG/match).`,
        });
      }
    }
  }

  // Key Lineup Availability & Injury Absences
  const absenceRate = Number.isFinite(w.absencePenaltyRate) ? w.absencePenaltyRate : 0.12;
  if (fixture.homeTeam.keyPlayerAbsenceSeverity === 'critical') {
    homePoints *= (1 - absenceRate);
    appliedRules.push({
      ruleNumber: 5,
      ruleName: 'Key Lineup Absence Penalty',
      tag: `Rule 5: Critical Absences (-${Math.round(absenceRate * 100)}% Home)`,
      impact: `-${Math.round(absenceRate * 100)}% efficiency discount to Home squad due to confirmed missing star personnel`,
      beneficiary: 'away',
      description: 'Home team missing critical starting spine or primary goalscorer.',
    });
  }
  if (fixture.awayTeam.keyPlayerAbsenceSeverity === 'critical') {
    awayPoints *= (1 - absenceRate);
    appliedRules.push({
      ruleNumber: 5,
      ruleName: 'Key Lineup Absence Penalty',
      tag: `Rule 5: Critical Absences (-${Math.round(absenceRate * 100)}% Away)`,
      impact: `-${Math.round(absenceRate * 100)}% efficiency discount to Away squad due to confirmed missing star personnel`,
      beneficiary: 'home',
      description: 'Away team missing critical starting spine or primary goalscorer.',
    });
  }

  // ==========================================
  // RULE 6: Cup & Continental Fixture Fatigue
  // ==========================================
  const fatigueRate = Number.isFinite(w.fatiguePenaltyRate) ? w.fatiguePenaltyRate : 0.15;
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

  // Calculate standard intermediate probability distribution with complete finite safety
  if (!Number.isFinite(homePoints) || isNaN(homePoints)) homePoints = w.homeAdvantageBaseline || 9.4;
  if (!Number.isFinite(awayPoints) || isNaN(awayPoints)) awayPoints = w.awayAdvantageBaseline || 8.8;
  if (!Number.isFinite(drawPoints) || isNaN(drawPoints)) drawPoints = 6.8;

  const totalScore = (homePoints + awayPoints + drawPoints) || 1;
  let homeWinPct = (homePoints / totalScore) * 100;
  let awayWinPct = (awayPoints / totalScore) * 100;
  let drawPct = (drawPoints / totalScore) * 100;

  if (!Number.isFinite(homeWinPct) || !Number.isFinite(awayWinPct) || !Number.isFinite(drawPct)) {
    homeWinPct = 38.0;
    drawPct = 30.0;
    awayWinPct = 32.0;
  }

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
      if (homePoints > awayPoints && homeWinPct < 50.0) {
        homeWinPct = 52.0;
        awayWinPct = 32.0;
        drawPct = 16.0;
      } else if (awayPoints > homePoints && awayWinPct < 50.0) {
        awayWinPct = 52.0;
        homeWinPct = 32.0;
        drawPct = 16.0;
      } else if (homePoints === awayPoints) {
        homeWinPct = 36.0;
        awayWinPct = 36.0;
        drawPct = 28.0;
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
  let roundedHome = Number.isFinite(homeWinPct) ? Math.round(homeWinPct * 10) / 10 : 38.0;
  let roundedAway = Number.isFinite(awayWinPct) ? Math.round(awayWinPct * 10) / 10 : 32.0;
  let roundedDraw = Number.isFinite(drawPct) ? Math.round((100 - roundedHome - roundedAway) * 10) / 10 : 30.0;

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

  // Part B: Low-Total / Clean Sheet Defensive Draw Synergy
  // In low-scoring environments (combined shots on target <= 8.5 or defensive cluster),
  // boost draw probability because clean sheets and 0-0/1-1 outcomes cluster heavily.
  const combinedSot = (fixture.homeTeam.avgShotsOnTarget || 4.5) + (fixture.awayTeam.avgShotsOnTarget || 4.2);
  const isDefensiveSynergy = combinedSot <= 8.6 || leagueCluster.archetype === 'defensive_draw';

  if (manualOverride === 'none' && isDefensiveSynergy && Math.abs(roundedHome - roundedAway) <= (drawMarginThreshold + 2.5)) {
    const lowTotalMultiplier = Math.max(1.0, w.lowTotalDrawBoost ?? 1.25);
    const boostedDraw = Math.min(44.0, roundedDraw * lowTotalMultiplier);
    const drawDiff = boostedDraw - roundedDraw;

    if (drawDiff > 1.5) {
      const remainingProb = 100.0 - boostedDraw;
      const totalHomeAway = (roundedHome + roundedAway) || 1;
      roundedHome = Math.round(((roundedHome / totalHomeAway) * remainingProb) * 10) / 10;
      roundedAway = Math.round(((roundedAway / totalHomeAway) * remainingProb) * 10) / 10;
      roundedDraw = Math.round((100.0 - roundedHome - roundedAway) * 10) / 10;

      appliedRules.push({
        ruleNumber: 9,
        ruleName: 'Low-Total & Clean Sheet Synergy',
        tag: `Rule 9: Low-Total Draw Synergy (Combined SOT: ${combinedSot.toFixed(1)})`,
        impact: `Draw boosted to ${roundedDraw.toFixed(1)}% (+${drawDiff.toFixed(1)}% clean sheet synergy)`,
        beneficiary: 'draw',
        description: `Both sides average low cumulative shots on target (${combinedSot.toFixed(1)} SOT) or compete in a defensive archetype league. Elevated probability of low-scoring stalemate (0-0, 1-1).`,
      });
    }
  }

  // Safety fallback against any impossible NaN
  if (!Number.isFinite(roundedHome) || isNaN(roundedHome)) roundedHome = 38.0;
  if (!Number.isFinite(roundedAway) || isNaN(roundedAway)) roundedAway = 32.0;
  if (!Number.isFinite(roundedDraw) || isNaN(roundedDraw)) roundedDraw = Math.round((100.0 - roundedHome - roundedAway) * 10) / 10;

  // Determine predicted winner
  let predictedWinner: 'home' | 'draw' | 'away' = 'home';
  if (roundedDraw > roundedHome && roundedDraw > roundedAway) {
    predictedWinner = 'draw';
  } else if (roundedAway > roundedHome && roundedAway > roundedDraw) {
    predictedWinner = 'away';
  } else if (roundedHome > roundedAway && roundedHome > roundedDraw) {
    predictedWinner = 'home';
  } else if (roundedHome === roundedAway) {
    predictedWinner = 'draw';
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
    confidenceScore: Number.isFinite(confidenceScore) ? confidenceScore : 65,
    appliedRules,
    rawPoints: {
      home: Number.isFinite(rawInitialPoints.home) ? rawInitialPoints.home : 9.4,
      away: Number.isFinite(rawInitialPoints.away) ? rawInitialPoints.away : 8.8,
      draw: Number.isFinite(rawInitialPoints.draw) ? rawInitialPoints.draw : 6.8,
    },
    finalPoints: {
      home: Number.isFinite(homePoints) ? Math.round(homePoints * 10) / 10 : 9.4,
      away: Number.isFinite(awayPoints) ? Math.round(awayPoints * 10) / 10 : 8.8,
      draw: Number.isFinite(drawPoints) ? Math.round(drawPoints * 10) / 10 : 6.8,
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
  if (!Array.isArray(fixtures)) return results;
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    if (!fixture || !fixture.id || !fixture.homeTeam || !fixture.awayTeam) continue;
    const override = overridesMap[fixture.id] || 'none';
    results[fixture.id] = evaluateFixturePrediction(fixture, override, weights);
  }
  return results;
}
