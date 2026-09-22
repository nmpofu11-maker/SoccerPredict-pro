/**
 * Team Volatility Heatmap Calculator
 * Evaluates recent performance variance, goal swings, and upset history
 * to calculate a volatility index (0% to 100%) mapped from Green (Consistent) to Red (Volatile).
 */

import { TeamStats, HistoricalMatchResult } from '../types/soccer';
import { getHistoricalMatchesForTeam } from './formCalculator';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';

export interface TeamVolatilityAssessment {
  teamName: string;
  volatilityIndex: number; // 0 (rock solid consistent) to 100 (extremely volatile/unpredictable)
  statusLabel: 'Consistent' | 'Stable' | 'Moderate' | 'Unpredictable' | 'Volatile';
  colorClass: string; // Tailwind text/bg/border color
  badgeColor: string; // Hex or tailwind bg class
  heatColor: 'green' | 'yellow' | 'orange' | 'red';
  reasons: string[];
}

const volatilityCache = new Map<string, TeamVolatilityAssessment>();

export function calculateTeamVolatility(
  team?: TeamStats,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): TeamVolatilityAssessment {
  if (!team || !team.name) {
    return {
      teamName: 'Unknown',
      volatilityIndex: 30,
      statusLabel: 'Stable',
      colorClass: 'text-emerald-400',
      badgeColor: 'green',
      heatColor: 'green',
      reasons: [],
    };
  }

  const cacheKey = `${team.name}_${historicalResults.length}`;
  const cached = volatilityCache.get(cacheKey);
  if (cached) return cached;

  const teamName = team.name;
  const matches = getHistoricalMatchesForTeam(teamName, historicalResults);
  const recent = matches.slice(-5);

  let varianceScore = 30; // base moderate
  const reasons: string[] = [];

  if (recent.length >= 3) {
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalGoalsConceded = 0;

    recent.forEach((item) => {
      if (item.matchId) {
        const hMatch = (historicalResults || []).find((hm) => Boolean(hm && hm.id === item.matchId));
        if (hMatch) {
          const isHome = hMatch.fixture.homeTeam.name.toLowerCase().includes(team.name.toLowerCase());
          const teamScore = isHome ? hMatch.homeScore : hMatch.awayScore;
          const oppScore = isHome ? hMatch.awayScore : hMatch.homeScore;
          totalGoalsConceded += oppScore;

          if (teamScore > oppScore) wins++;
          else if (teamScore < oppScore) losses++;
          else draws++;
        }
      }
    });

    if (wins > 0 && losses > 0 && draws === 0) {
      varianceScore += 25;
      reasons.push('Erratic win/loss oscillation without drawing');
    }

    const avgConceded = recent.length > 0 ? totalGoalsConceded / recent.length : 1.2;
    if (avgConceded > 1.8) {
      varianceScore += 20;
      reasons.push(`High defensive vulnerability (${avgConceded.toFixed(1)} goals conceded/match)`);
    } else if (avgConceded < 0.9) {
      varianceScore -= 15;
      reasons.push('Solid defensive containment');
    }
  } else if (Array.isArray(team.form) && team.form.length > 0) {
    // Utilize team form array when historical full-match database lacks explicit telemetry
    const f = team.form;
    const wins = f.filter(r => r === 'W').length;
    const losses = f.filter(r => r === 'L').length;
    const draws = f.filter(r => r === 'D').length;

    if (wins >= 4) {
      varianceScore -= 15;
      reasons.push('Dominant winning streak reinforces consistency');
    } else if (losses >= 4) {
      varianceScore += 16;
      reasons.push('Chronic defeat streak indicates tactical instability');
    } else if (wins >= 2 && losses >= 2 && draws === 0) {
      varianceScore += 20;
      reasons.push('Alternating win/loss swing volatility');
    } else if (draws >= 3) {
      varianceScore -= 8;
      reasons.push('High draw frequency denotes controlled tempo');
    }

    if (team.avgPossession) {
      if (team.avgPossession >= 58) {
        varianceScore -= 6;
      } else if (team.avgPossession <= 42) {
        varianceScore += 8;
      }
    }

    if (team.avgShotsOnTarget) {
      if (team.avgShotsOnTarget >= 6.5) {
        varianceScore -= 5;
      } else if (team.avgShotsOnTarget <= 3.2) {
        varianceScore += 6;
      }
    }
  }

  if (team.leagueRank) {
    if (team.leagueRank <= 2) {
      varianceScore -= 14;
      reasons.push('Top-2 elite consistency ranking');
    } else if (team.leagueRank <= 4) {
      varianceScore -= 8;
      reasons.push('Top-tier consistency ranking');
    } else if (team.leagueRank > 12) {
      varianceScore += 16;
      reasons.push('Lower table standing correlates with result swings');
    } else if (team.leagueRank >= 8) {
      varianceScore += 6;
      reasons.push('Mid-table oscillation');
    }
  }

  const volatilityIndex = Math.min(98, Math.max(12, varianceScore));

  let heatColor: 'green' | 'yellow' | 'orange' | 'red' = 'green';
  let statusLabel: TeamVolatilityAssessment['statusLabel'] = 'Consistent';
  let colorClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  let badgeColor = 'bg-emerald-500';

  if (volatilityIndex >= 75) {
    heatColor = 'red';
    statusLabel = 'Volatile';
    colorClass = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    badgeColor = 'bg-rose-500';
    if (reasons.length === 0) reasons.push('High scoreline variance & unpredictable defensive records');
  } else if (volatilityIndex >= 55) {
    heatColor = 'orange';
    statusLabel = 'Unpredictable';
    colorClass = 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    badgeColor = 'bg-orange-500';
    if (reasons.length === 0) reasons.push('Mixed recent results and moderate goal fluctuations');
  } else if (volatilityIndex >= 35) {
    heatColor = 'yellow';
    statusLabel = 'Moderate';
    colorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    badgeColor = 'bg-amber-500';
    if (reasons.length === 0) reasons.push('Stable performance baseline with occasional variance');
  } else {
    heatColor = 'green';
    statusLabel = 'Consistent';
    colorClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    badgeColor = 'bg-emerald-500';
    if (reasons.length === 0) reasons.push('Highly reliable form profile and strong defensive shape');
  }

  const result: TeamVolatilityAssessment = {
    teamName: team.name,
    volatilityIndex,
    statusLabel,
    colorClass,
    badgeColor,
    heatColor,
    reasons,
  };
  volatilityCache.set(cacheKey, result);
  return result;
}
