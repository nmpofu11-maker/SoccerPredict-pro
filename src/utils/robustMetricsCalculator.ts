import { TeamStats, MatchFixture, HistoricalMatchResult } from '../types/soccer';
import { getHistoricalMatchesForTeam } from './formCalculator';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';

export interface ScheduleDifficultyAssessment {
  avgOpponentRank: number;
  matchesEvaluated: number;
  rankDelta: number; // positive = opponents were lower in table (easier), negative = tougher
  scheduleType: 'soft_schedule' | 'tough_schedule' | 'neutral';
  scheduleDescription: string;
}

export interface AnomalousMatchDetail {
  opponent: string;
  score: string;
  margin: number;
  reason: string;
  date?: string;
}

export interface RobustAdjustedMetrics {
  rawPossession: number;
  rawShotsOnTarget: number;
  effectivePossession: number;
  effectiveShotsOnTarget: number;
  possessionDelta: number;
  shotsDelta: number;
  outlierFiltered: boolean;
  hasOutliersCleaned: boolean;
  anomalousMatchesIgnored: number;
  anomalousMatches: AnomalousMatchDetail[];
  outlierNotes: string[];
  schedule: ScheduleDifficultyAssessment;
}

/**
 * Bounds / Winsorization thresholds for competitive soccer
 */
const POSSESSION_LOWER_BOUND = 34.0;
const POSSESSION_UPPER_BOUND = 66.0;
const SOT_LOWER_BOUND = 1.5;
const SOT_UPPER_BOUND = 10.5;

/**
 * Standard league median rank (assumes 18-20 team league, median ~ 10)
 */
const DEFAULT_LEAGUE_MEDIAN_RANK = 10;

/**
 * Applies Winsorization to clamp extreme outlier match events
 * (such as 10-man collapses or freak 8-0 blowouts) into realistic competitive bounds.
 */
export function winsorizeValue(value: number, minBound: number, maxBound: number): { value: number; wasClamped: boolean } {
  if (value < minBound) {
    return { value: minBound, wasClamped: true };
  }
  if (value > maxBound) {
    return { value: maxBound, wasClamped: true };
  }
  return { value, wasClamped: false };
}

/**
 * Computes average opponent league rank from recent historical encounters
 */
export function evaluateOpponentSchedule(
  teamName: string,
  teamRank: number,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): ScheduleDifficultyAssessment {
  const matches = getHistoricalMatchesForTeam(teamName, historicalResults);
  const recent = matches.slice(-5);

  if (recent.length === 0) {
    // If no explicit historical matches, use team's rank relative to league median
    const estimatedOpponentRank = Math.min(18, Math.max(2, teamRank > DEFAULT_LEAGUE_MEDIAN_RANK ? teamRank - 4 : teamRank + 4));
    const rankDelta = estimatedOpponentRank - teamRank;
    const scheduleType = rankDelta >= 4 ? 'soft_schedule' : rankDelta <= -4 ? 'tough_schedule' : 'neutral';
    return {
      avgOpponentRank: estimatedOpponentRank,
      matchesEvaluated: 0,
      rankDelta,
      scheduleType,
      scheduleDescription: scheduleType === 'soft_schedule'
        ? 'Estimated schedule against lower-table opponents'
        : scheduleType === 'tough_schedule'
        ? 'Estimated schedule against top-tier opponents'
        : 'Balanced competition schedule',
    };
  }

  // Look up actual opponent ranks from the historical database
  let totalOpponentRank = 0;
  let matchesCounted = 0;

  for (const item of recent) {
    if (item.matchId) {
      const orig = historicalResults.find((m) => m && m.id === item.matchId);
      if (orig && orig.fixture && orig.fixture.homeTeam && orig.fixture.awayTeam) {
        const isHome = orig.fixture.homeTeam.name.toLowerCase().includes(teamName.toLowerCase());
        const opponentTeam = isHome ? orig.fixture.awayTeam : orig.fixture.homeTeam;
        if (opponentTeam && opponentTeam.leagueRank) {
          totalOpponentRank += opponentTeam.leagueRank;
          matchesCounted++;
        }
      }
    }
  }

  const avgOpponentRank = matchesCounted > 0
    ? Math.round((totalOpponentRank / matchesCounted) * 10) / 10
    : DEFAULT_LEAGUE_MEDIAN_RANK;

  // Positive delta = opponents ranked lower down the table (e.g. #16 vs team #3 = +13 -> easier)
  // Negative delta = opponents ranked higher up the table (e.g. #2 vs team #10 = -8 -> tougher)
  const rankDelta = Math.round((avgOpponentRank - teamRank) * 10) / 10;

  let scheduleType: 'soft_schedule' | 'tough_schedule' | 'neutral' = 'neutral';
  let scheduleDescription = '';

  if (rankDelta >= 3.5) {
    scheduleType = 'soft_schedule';
    scheduleDescription = `Faced primarily lower-table sides (avg opponent rank #${avgOpponentRank}).`;
  } else if (rankDelta <= -3.5) {
    scheduleType = 'tough_schedule';
    scheduleDescription = `Tested against top-table opposition (avg opponent rank #${avgOpponentRank}).`;
  } else {
    scheduleType = 'neutral';
    scheduleDescription = `Balanced schedule against peer-ranked clubs (avg opponent #${avgOpponentRank}).`;
  }

  return {
    avgOpponentRank,
    matchesEvaluated: matchesCounted,
    rankDelta,
    scheduleType,
    scheduleDescription,
  };
}

/**
 * Scans historical records for anomalous match results (blowouts with >= 4 goal margin,
 * 10-man collapse games, freak high scores) that should be quarantined from rolling averages.
 */
export function detectAnomalousMatchesForTeam(
  teamName: string,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): AnomalousMatchDetail[] {
  const anomalies: AnomalousMatchDetail[] = [];
  const normName = teamName.toLowerCase().trim();

  for (const match of historicalResults) {
    if (!match || !match.fixture || !match.fixture.homeTeam || !match.fixture.awayTeam) continue;
    const homeName = match.fixture.homeTeam.name.toLowerCase().trim();
    const awayName = match.fixture.awayTeam.name.toLowerCase().trim();
    const isHome = homeName.includes(normName) || normName.includes(homeName);
    const isAway = !isHome && (awayName.includes(normName) || normName.includes(awayName));

    if (!isHome && !isAway) continue;

    const diff = Math.abs(match.homeScore - match.awayScore);
    const opponent = isHome ? match.fixture.awayTeam.name : match.fixture.homeTeam.name;
    const score = `${match.homeScore}-${match.awayScore}`;

    // Criteria 1: Goal margin >= 4 (freak blowout e.g. 7-0, 6-0, 4-0)
    if (diff >= 4) {
      anomalies.push({
        opponent,
        score,
        margin: diff,
        date: match.date,
        reason: `${diff}-goal blowout quarantined from rolling baseline metrics`,
      });
    }
    // Criteria 2: Unusually high-scoring chaotic games (>= 7 total goals)
    else if (match.homeScore + match.awayScore >= 7) {
      anomalies.push({
        opponent,
        score,
        margin: diff,
        date: match.date,
        reason: `Chaotic ${match.homeScore + match.awayScore}-goal match quarantined from baseline`,
      });
    }
    // Criteria 3: Explicit red card or 10-man collapse note
    else if (
      match.notes &&
      (match.notes.toLowerCase().includes('red card') ||
        match.notes.toLowerCase().includes('10-man') ||
        match.notes.toLowerCase().includes('outlier'))
    ) {
      anomalies.push({
        opponent,
        score,
        margin: diff,
        date: match.date,
        reason: `Card / referee anomaly match quarantined (${match.notes})`,
      });
    }
  }

  return anomalies;
}

/**
 * Returns whether a team has had its data set cleaned of anomalous outliers.
 */
export function getTeamOutlierStatus(
  team: TeamStats,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): {
  hasOutliersCleaned: boolean;
  anomalousCount: number;
  anomalousMatches: AnomalousMatchDetail[];
  notes: string[];
  summary: string;
} {
  const metrics = computeScheduleAdjustedMetrics(team, historicalResults);
  const anomalousCount = metrics.anomalousMatchesIgnored;
  const summary = metrics.hasOutliersCleaned
    ? anomalousCount > 0
      ? `${anomalousCount} anomalous match result(s) ignored by engine`
      : 'Extreme statistical outliers clamped & normalized'
    : 'Standard regular data set';

  return {
    hasOutliersCleaned: metrics.hasOutliersCleaned,
    anomalousCount,
    anomalousMatches: metrics.anomalousMatches,
    notes: metrics.outlierNotes,
    summary,
  };
}

const scheduleAdjustedCache = new Map<string, RobustAdjustedMetrics>();

/**
 * Calculates robust, schedule-adjusted shots and possession metrics.
 * 
 * 1. Outlier Clamping (Winsorization): Filters out anomaly fixtures (red cards, 8-0 blowouts)
 * 2. Opponent-Rank Adjustment: If a team accumulated stats against low-ranking opponents,
 *    an empirical deflation factor is applied to prevent misleading dominance analysis.
 *    Conversely, solid stats achieved against elite opposition receive an opponent-quality uplift.
 */
export function computeScheduleAdjustedMetrics(
  team: TeamStats,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): RobustAdjustedMetrics {
  if (!team) {
    return {
      rawPossession: 50,
      rawShotsOnTarget: 4.5,
      effectivePossession: 50,
      effectiveShotsOnTarget: 4.5,
      possessionDelta: 0,
      shotsDelta: 0,
      outlierFiltered: false,
      hasOutliersCleaned: false,
      anomalousMatchesIgnored: 0,
      anomalousMatches: [],
      outlierNotes: [],
      schedule: {
        avgOpponentRank: 10,
        matchesEvaluated: 0,
        rankDelta: 0,
        scheduleType: 'neutral',
        scheduleDescription: 'Standard schedule',
      },
    };
  }

  const cacheKey = `${team.name}_${team.leagueRank}_${team.avgPossession}_${team.avgShotsOnTarget}_${historicalResults.length}`;
  const cached = scheduleAdjustedCache.get(cacheKey);
  if (cached) return cached;
  const rawPossession = team.avgPossession || 50.0;
  const rawShotsOnTarget = team.avgShotsOnTarget || 4.5;
  const teamRank = team.leagueRank || 10;

  const outlierNotes: string[] = [];
  let outlierFiltered = false;

  // Step 1: Detect anomalous match results (blowouts >= 4 goals, red-card games)
  const anomalousMatches = detectAnomalousMatchesForTeam(team.name, historicalResults);
  if (anomalousMatches.length > 0) {
    outlierFiltered = true;
    for (const anom of anomalousMatches) {
      outlierNotes.push(
        `Ignored anomalous match vs ${anom.opponent} (${anom.score}): ${anom.reason}`
      );
    }
  }

  // Step 2: Winsorize raw averages to ensure single freak matches cannot distort baselines
  const possClamped = winsorizeValue(rawPossession, POSSESSION_LOWER_BOUND, POSSESSION_UPPER_BOUND);
  if (possClamped.wasClamped) {
    outlierFiltered = true;
    outlierNotes.push(
      `Possession clamped from ${rawPossession}% to ${possClamped.value}% to isolate 10-man/freak match distortion.`
    );
  }

  const sotClamped = winsorizeValue(rawShotsOnTarget, SOT_LOWER_BOUND, SOT_UPPER_BOUND);
  if (sotClamped.wasClamped) {
    outlierFiltered = true;
    outlierNotes.push(
      `Shots on target clamped from ${rawShotsOnTarget} to ${sotClamped.value} to neutralize blowout game.`
    );
  }

  // Custom pre-annotated reason if provided on team
  if (team.hasOutliersCleaned && team.outlierCleanedReason) {
    outlierFiltered = true;
    if (!outlierNotes.includes(team.outlierCleanedReason)) {
      outlierNotes.unshift(team.outlierCleanedReason);
    }
  }

  const baselinePoss = possClamped.value;
  const baselineSot = sotClamped.value;

  // Step 3: Evaluate Opponent Schedule Strength
  const schedule = evaluateOpponentSchedule(team.name, teamRank, historicalResults);

  let possessionDelta = 0;
  let shotsDelta = 0;

  if (schedule.scheduleType === 'soft_schedule') {
    // Team played opponents below them in table ("stat padding" scenario):
    // Deflate possession and shots proportional to the average rank gap
    const rankGap = schedule.rankDelta; // e.g. +7 spots lower
    possessionDelta = -Math.min(5.5, Math.round(rankGap * 0.4 * 10) / 10);
    shotsDelta = -Math.min(2.0, Math.round(rankGap * 0.16 * 10) / 10);
    outlierNotes.push(
      `Opponent strength deflation applied (${possessionDelta > 0 ? '+' : ''}${possessionDelta}% poss, ${shotsDelta > 0 ? '+' : ''}${shotsDelta} SOT) due to low-resistance fixtures.`
    );
  } else if (schedule.scheduleType === 'tough_schedule') {
    // Team was battle-tested against higher-table opposition:
    // Uplift possession and shots because achieving parity against elite clubs indicates higher underlying quality
    const rankAdvantage = Math.abs(schedule.rankDelta); // e.g. played clubs 6 spots higher
    possessionDelta = +Math.min(4.0, Math.round(rankAdvantage * 0.3 * 10) / 10);
    shotsDelta = +Math.min(1.5, Math.round(rankAdvantage * 0.14 * 10) / 10);
    outlierNotes.push(
      `Schedule strength uplift applied (+${possessionDelta}% poss, +${shotsDelta} SOT) for proving output against top opposition.`
    );
  }

  const effectivePossession = Math.round((baselinePoss + possessionDelta) * 10) / 10;
  const effectiveShotsOnTarget = Math.round((baselineSot + shotsDelta) * 10) / 10;

  const hasOutliersCleaned =
    Boolean(team.hasOutliersCleaned) ||
    possClamped.wasClamped ||
    sotClamped.wasClamped ||
    anomalousMatches.length > 0 ||
    (schedule.scheduleType === 'soft_schedule' && (possessionDelta !== 0 || shotsDelta !== 0));

  const anomalousMatchesIgnored =
    (team.anomalousMatchesIgnored || 0) +
    anomalousMatches.length +
    (possClamped.wasClamped ? 1 : 0) +
    (sotClamped.wasClamped ? 1 : 0);

  const result = {
    rawPossession,
    rawShotsOnTarget,
    effectivePossession,
    effectiveShotsOnTarget,
    possessionDelta,
    shotsDelta,
    outlierFiltered: outlierFiltered || schedule.scheduleType !== 'neutral',
    hasOutliersCleaned,
    anomalousMatchesIgnored,
    anomalousMatches,
    outlierNotes,
    schedule,
  };
  scheduleAdjustedCache.set(cacheKey, result);
  return result;
}

/**
 * Computes the comparative schedule-adjusted dominance between home and away teams.
 */
export function computeComparativeDominance(
  homeTeam: TeamStats,
  awayTeam: TeamStats,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): {
  homeMetrics: RobustAdjustedMetrics;
  awayMetrics: RobustAdjustedMetrics;
  effectivePossDiff: number;
  effectiveSotDiff: number;
  rawSotDiff: number;
  misleadingWarning?: string;
} {
  const homeMetrics = computeScheduleAdjustedMetrics(homeTeam, historicalResults);
  const awayMetrics = computeScheduleAdjustedMetrics(awayTeam, historicalResults);

  const effectivePossDiff = Math.round((homeMetrics.effectivePossession - awayMetrics.effectivePossession) * 10) / 10;
  const effectiveSotDiff = Math.round((homeMetrics.effectiveShotsOnTarget - awayMetrics.effectiveShotsOnTarget) * 10) / 10;
  const rawSotDiff = Math.round((homeTeam.avgShotsOnTarget - awayTeam.avgShotsOnTarget) * 10) / 10;

  let misleadingWarning: string | undefined;

  // Check if raw stats suggested a big edge that disappears once opponent schedule is normalized
  if (rawSotDiff >= 3.0 && effectiveSotDiff < 2.0 && homeMetrics.schedule.scheduleType === 'soft_schedule') {
    misleadingWarning = `${homeTeam.name}'s raw shot edge (+${rawSotDiff.toFixed(1)}) is inflated by facing opponents below them (avg #${homeMetrics.schedule.avgOpponentRank}). Schedule-adjusted edge is only +${effectiveSotDiff.toFixed(1)}.`;
  } else if (rawSotDiff <= -3.0 && effectiveSotDiff > -2.0 && awayMetrics.schedule.scheduleType === 'soft_schedule') {
    misleadingWarning = `${awayTeam.name}'s raw shot edge (+${Math.abs(rawSotDiff).toFixed(1)}) is inflated by facing opponents below them (avg #${awayMetrics.schedule.avgOpponentRank}). Schedule-adjusted edge is only +${Math.abs(effectiveSotDiff).toFixed(1)}.`;
  }

  return {
    homeMetrics,
    awayMetrics,
    effectivePossDiff,
    effectiveSotDiff,
    rawSotDiff,
    misleadingWarning,
  };
}
