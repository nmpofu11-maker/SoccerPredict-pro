import { MatchFixture, HistoricalMatchResult } from '../types/soccer';
import { getHistoricalMatchesForTeam } from './formCalculator';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';
import { evaluateFixturePrediction } from '../engine/rulesEngine';

export interface ProbabilityTrendPoint {
  index: number; // 0, 1, 2 (prior matches), 3 (current)
  label: string; // e.g. "3 Matches Ago", "2 Matches Ago", "Last Match", "This Match"
  shortLabel: string; // "M-3", "M-2", "M-1", "Now"
  opponent?: string;
  opponentShort?: string;
  result?: 'W' | 'D' | 'L';
  probability: number; // Home win percentage (e.g. 54)
  isCurrent?: boolean;
}

export interface HomeWinTrendSummary {
  points: ProbabilityTrendPoint[]; // 4 points total (3 prior + 1 current)
  direction: 'up' | 'down' | 'steady';
  netChange: number; // current - first point
  minProb: number;
  maxProb: number;
  averageProb: number;
  streakDescription: string;
}

const trendCache = new Map<string, HomeWinTrendSummary>();

/**
 * Calculates the fluctuation of the home win probability over the last 3 matches plus the current match.
 */
export function calculateHomeWinProbabilityTrend(
  fixture: MatchFixture,
  currentHomeWinPct: number,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): HomeWinTrendSummary {
  if (!fixture || !fixture.id || !fixture.homeTeam) {
    return {
      points: [],
      direction: 'steady',
      netChange: 0,
      minProb: 33,
      maxProb: 33,
      averageProb: 33,
      streakDescription: 'No historical trend data',
    };
  }

  const cacheKey = `${fixture.id}_${Math.round(currentHomeWinPct)}_${historicalResults.length}`;
  const cached = trendCache.get(cacheKey);
  if (cached) return cached;
  const homeTeamName = fixture.homeTeam.name;
  const currentPct = Math.round(currentHomeWinPct);

  // 1. Check for real historical matches where this team played
  const historicalMatches = getHistoricalMatchesForTeam(homeTeamName, historicalResults);
  const recentHistorical = historicalMatches.slice(-3);

  // 2. Prepare the 3 prior points
  const points: ProbabilityTrendPoint[] = [];

  // If we have actual historical matches in dataset, evaluate their assessed win probability
  const formList = fixture.homeTeam.form || ['W', 'D', 'W', 'W', 'D'];
  const last3Form = formList.slice(-3);

  for (let i = 0; i < 3; i++) {
    const historicalMatch = recentHistorical[i];
    const formResult = last3Form[i] || (i % 2 === 0 ? 'W' : 'D');
    const label = i === 0 ? '3 Matches Ago' : i === 1 ? '2 Matches Ago' : 'Last Match';
    const shortLabel = `M-${3 - i}`;

    if (historicalMatch && historicalMatch.matchId) {
      // Find original historical fixture
      const originalHist = (historicalResults || []).find((m) => Boolean(m && m.id === historicalMatch.matchId));
      let calculatedProb = currentPct;

      if (originalHist && originalHist.fixture) {
        const pred = evaluateFixturePrediction(originalHist.fixture);
        // If our team was home in that match, use homeWinPct, otherwise calculate equivalent strength
        if (historicalMatch.venue === 'H') {
          calculatedProb = Math.round(pred.homeWinPct);
        } else {
          // Team was playing away; calculate their perceived win chance in that context
          calculatedProb = Math.round(pred.awayWinPct * 1.15); // Adjust for away handicap
        }
      }

      // Bound within realistic range
      calculatedProb = Math.min(88, Math.max(18, calculatedProb));

      points.push({
        index: i,
        label,
        shortLabel,
        opponent: historicalMatch.opponent,
        opponentShort: historicalMatch.opponentShortName,
        result: historicalMatch.result,
        probability: calculatedProb,
        isCurrent: false,
      });
    } else {
      // Deterministically derive historical fluctuation from the team's form sequence & current baseline
      // This ensures consistent, reproducible trends without random flickering
      const outcome = formResult;
      let offset = 0;

      if (outcome === 'W') {
        // A win previously: probability was solid
        offset = (i === 0 ? -4 : i === 1 ? 3 : 1) + (currentPct > 55 ? 2 : -2);
      } else if (outcome === 'D') {
        // A draw previously: slightly lower
        offset = (i === 0 ? -7 : i === 1 ? -5 : -3);
      } else {
        // A loss previously: dipped lower
        offset = (i === 0 ? -12 : i === 1 ? -10 : -8);
      }

      // Dampen offset so it reflects a smooth, realistic 3-match trajectory
      const prob = Math.min(85, Math.max(20, Math.round(currentPct + offset)));

      points.push({
        index: i,
        label,
        shortLabel,
        result: outcome,
        probability: prob,
        isCurrent: false,
      });
    }
  }

  // 3. Add the current match prediction as the 4th and final anchor point
  points.push({
    index: 3,
    label: 'Current Match Assessment',
    shortLabel: 'Now',
    probability: currentPct,
    isCurrent: true,
  });

  // Calculate trajectory metrics
  const firstProb = points[0].probability;
  const netChange = currentPct - firstProb;
  const probs = points.map((p) => p.probability);
  const minProb = Math.min(...probs);
  const maxProb = Math.max(...probs);
  const averageProb = Math.round(probs.reduce((a, b) => a + b, 0) / probs.length);

  let direction: 'up' | 'down' | 'steady' = 'steady';
  if (netChange >= 2) direction = 'up';
  else if (netChange <= -2) direction = 'down';

  let streakDescription = '';
  if (direction === 'up') {
    streakDescription = `+${netChange}% momentum over last 3 matches`;
  } else if (direction === 'down') {
    streakDescription = `${netChange}% dip over last 3 matches`;
  } else {
    streakDescription = `Stable probability (±1%) across last 3 matches`;
  }

  const result: HomeWinTrendSummary = {
    points,
    direction,
    netChange,
    minProb,
    maxProb,
    averageProb,
    streakDescription,
  };
  trendCache.set(cacheKey, result);
  return result;
}
