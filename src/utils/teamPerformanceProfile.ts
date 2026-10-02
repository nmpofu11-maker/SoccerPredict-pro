import type { TeamStats } from '../types/soccer';

export interface TeamPerformanceProfile {
  lastSeasonRank: number | null;
  lastSeasonStanding: string;
  lastSeasonPoints?: number;
  totalSquadValueEur: number | null;
  avgMatchRating: number | null;
}

/**
 * Legacy lookup exports are intentionally empty. Previously embedded 2023-24
 * profiles were being displayed as if they were current team data. Profile
 * values must now arrive on the fixture from a timestamped, identified source.
 */
export const CANONICAL_TEAM_PROFILES: Record<string, TeamPerformanceProfile> = {};
export const WOMEN_TEAM_PROFILES: Record<string, TeamPerformanceProfile> = {};

export function resolveTeamPerformanceProfile(
  team?: Partial<TeamStats> & { name?: string },
  _league?: string
): TeamPerformanceProfile {
  if (!team) {
    return {
      lastSeasonRank: null,
      lastSeasonStanding: 'Unknown',
      totalSquadValueEur: null,
      avgMatchRating: null,
    };
  }

  const rank = Number.isFinite(team.lastSeasonRank) ? Number(team.lastSeasonRank) : null;
  return {
    lastSeasonRank: rank,
    lastSeasonStanding: team.lastSeasonStanding || (rank !== null ? formatOrdinalStanding(rank) : 'Unknown'),
    ...(Number.isFinite(team.lastSeasonPoints) ? { lastSeasonPoints: Number(team.lastSeasonPoints) } : {}),
    totalSquadValueEur: Number.isFinite(team.totalSquadValueEur) ? Number(team.totalSquadValueEur) : null,
    avgMatchRating: Number.isFinite(team.avgMatchRating) ? Number(team.avgMatchRating) : null,
  };
}

/** Formats a squad market value in millions of EUR. */
export function formatSquadValue(millions: number): string {
  if (!Number.isFinite(millions) || millions < 0) return 'N/A';
  if (millions >= 1000) return `€${(millions / 1000).toFixed(2)}B`;
  if (millions < 1) return `€${Math.round(millions * 1000)}K`;
  if (millions < 10) return `€${millions.toFixed(1)}M`;
  return `€${Math.round(millions)}M`;
}

export function formatOrdinalStanding(rank: number): string {
  if (!Number.isInteger(rank) || rank < 1) return 'Unknown';
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}
