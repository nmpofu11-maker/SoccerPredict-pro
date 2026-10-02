import type { MatchFixture, MatchAuthenticityStamp } from '../types/soccer';

export const ALLOWED_LIVE_VERIFIED_SOURCES = new Set([
  'FOOTBALL_DATA_ORG',
  'THE_RUNDOWN',
  'THE_RUNDOWN_API',
  'SPORTRADAR',
]);

/**
 * Idempotent migration to sanitize existing runtime fixture data on server boot.
 * Any fixture whose authenticity status is VERIFIED_AUTHENTIC but whose source
 * is not a verified live provider fetch gets its stats nulled and its status set to UNVERIFIED_STATS.
 */
export function sanitizeRuntimeManifest(fixtures: any[]): {
  fixtures: any[];
  changedCount: number;
} {
  if (!Array.isArray(fixtures)) {
    return { fixtures: [], changedCount: 0 };
  }

  let changedCount = 0;

  const sanitized = fixtures.map((fixture) => {
    if (!fixture || typeof fixture !== 'object') return fixture;

    const auth = fixture.authenticity;
    const isMarkedVerified = auth?.status === 'VERIFIED_AUTHENTIC' || fixture.isStandingsVerified === true;
    const source = typeof auth?.source === 'string' ? auth.source.trim() : '';

    const isLiveProvider = ALLOWED_LIVE_VERIFIED_SOURCES.has(source) && Boolean(auth?.verifiedAt);

    // If marked verified but not from a real verified live provider fetch in this run
    if (isMarkedVerified && !isLiveProvider) {
      changedCount++;
      const oldSource = source || 'UNKNOWN';

      const cleanHome = fixture.homeTeam
        ? {
            ...fixture.homeTeam,
            leagueRank: null,
            points: null,
            avgPossession: null,
            avgShotsOnTarget: null,
            expectedGoalsAvg: null,
            totalSquadValueEur: null,
            lastSeasonRank: null,
            form: [],
            formScores: [],
            formDetails: [],
            isHomeDominant: false,
            hasTopTierAwayForm: false,
          }
        : fixture.homeTeam;

      const cleanAway = fixture.awayTeam
        ? {
            ...fixture.awayTeam,
            leagueRank: null,
            points: null,
            avgPossession: null,
            avgShotsOnTarget: null,
            expectedGoalsAvg: null,
            totalSquadValueEur: null,
            lastSeasonRank: null,
            form: [],
            formScores: [],
            formDetails: [],
            isHomeDominant: false,
            hasTopTierAwayForm: false,
          }
        : fixture.awayTeam;

      const newAuth: MatchAuthenticityStamp = {
        status: 'UNVERIFIED_STATS',
        authenticityScore: 0,
        isAuthentic: false,
        verifiedAt: null,
        source: `${oldSource}_STATS_REMOVED`,
        checks: [],
      };

      return {
        ...fixture,
        homeTeam: cleanHome,
        awayTeam: cleanAway,
        h2h: null,
        isStandingsVerified: false,
        authenticity: newAuth,
      };
    }

    return fixture;
  });

  return { fixtures: sanitized, changedCount };
}
