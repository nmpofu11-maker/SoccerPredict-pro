/**
 * Safe identity and kickoff matching helpers for automated match settlement.
 *
 * Team names or provider IDs alone are not enough: rematches, double-headers,
 * or cup ties can share the same clubs, and fallback composite or recycled IDs
 * can collide across dates. Every settlement candidate — including direct
 * provider-ID lookups — must therefore pass:
 *   1. Strict normalized home + away team identity verification,
 *   2. Optional expected calendar-date alignment with the target fixture,
 *   3. Explicit provider kickoff timestamp within 3 hours of target kickoff,
 *   4. Ambiguity rejection when more than one fallback candidate matches within 3 hours.
 */

import { parseSportApiAiKickoff } from './sportApiAiKickoff';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export function normalizeSettlementTeamName(name: unknown): string {
  return typeof name === 'string' ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function toStringCandidates(value: unknown): string[] {
  if (typeof value === 'string') {
    const norm = normalizeSettlementTeamName(value);
    return norm ? [norm] : [];
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      const norm = normalizeSettlementTeamName(item);
      if (norm && !out.includes(norm)) out.push(norm);
    }
    return out;
  }
  return [];
}

/**
 * Verifies that candidate home and away team names strictly match expected
 * fixture home and away team names after alphanumeric normalization.
 * Supports primary + shortName arrays (e.g. Football-Data.org `name` / `shortName`).
 */
export function isSettlementTeamIdentityMatch(
  candidateHome: unknown,
  candidateAway: unknown,
  expectedHome: unknown,
  expectedAway: unknown
): boolean {
  const candHomeNorms = toStringCandidates(candidateHome);
  const candAwayNorms = toStringCandidates(candidateAway);
  const expHomeNorms = toStringCandidates(expectedHome);
  const expAwayNorms = toStringCandidates(expectedAway);

  if (
    candHomeNorms.length === 0 ||
    candAwayNorms.length === 0 ||
    expHomeNorms.length === 0 ||
    expAwayNorms.length === 0
  ) {
    return false;
  }

  const homeMatches = candHomeNorms.some((ch) => expHomeNorms.includes(ch));
  const awayMatches = candAwayNorms.some((ca) => expAwayNorms.includes(ca));
  return homeMatches && awayMatches;
}

export function providerSettlementKickoffMs(match: any): number {
  const raw =
    match?.kickoff_utc ??
    match?.utc_date ??
    match?.utcDate ??
    match?.time_utc ??
    match?.event_date ??
    match?.kickoff_time ??
    match?.commence_time ??
    match?.starting_at ??
    match?.start_time ??
    match?.startTime ??
    match?.fixture?.date ??
    match?.fixture?.kickoff_time ??
    match?.fixture?.starting_at ??
    match?.date;

  if (typeof raw !== 'string') {
    if (match && typeof match === 'object' && typeof match.datetime === 'string') {
      const sportApiIso = parseSportApiAiKickoff(match);
      return sportApiIso ? Date.parse(sportApiIso) : NaN;
    }
    return NaN;
  }

  const trimmed = raw.trim();
  if (!/[T ]\d{2}:\d{2}/.test(trimmed)) return NaN;

  const normalizedWithT = trimmed.replace(' ', 'T');
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(normalizedWithT)) {
    return Date.parse(normalizedWithT);
  }

  // Providers like Sportmonks and SportAPI.ai (`kickoff_utc`, `starting_at`)
  // emit UTC timestamps without a trailing Z ('YYYY-MM-DD HH:MM:SS').
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalizedWithT)) {
    const withSeconds = normalizedWithT.length === 16 ? `${normalizedWithT}:00` : normalizedWithT;
    return Date.parse(`${withSeconds}Z`);
  }

  return Date.parse(trimmed);
}

export function findSafeSettlementNameMatch<T extends Record<string, any>>(
  candidates: T[] | undefined,
  fixture: { kickoffTime?: string | null }
): T | undefined {
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;
  const targetKickoff = Date.parse(fixture?.kickoffTime || '');
  if (!Number.isFinite(targetKickoff)) return undefined;
  const eligible = candidates.filter((candidate) => {
    const candidateKickoff = providerSettlementKickoffMs(candidate);
    return (
      Number.isFinite(candidateKickoff) &&
      Math.abs(candidateKickoff - targetKickoff) <= THREE_HOURS_MS
    );
  });
  return eligible.length === 1 ? eligible[0] : undefined;
}

export interface ResolveSettlementMatchOptions<T extends Record<string, any>> {
  idMatch?: T;
  nameCandidates?: T[];
  fixture: {
    kickoffTime?: string | null;
    homeTeam?: { name?: string | null; shortName?: string | null } | null;
    awayTeam?: { name?: string | null; shortName?: string | null } | null;
  };
  extractTeams: (candidate: T) => { home: unknown; away: unknown };
  expectedDate?: string;
}

function matchesCandidateIdentityAndDate<T extends Record<string, any>>(
  candidate: T,
  options: ResolveSettlementMatchOptions<T>
): boolean {
  const expectedHome = options.fixture?.homeTeam?.name;
  const expectedAway = options.fixture?.awayTeam?.name;
  const { home, away } = options.extractTeams(candidate);
  if (!isSettlementTeamIdentityMatch(home, away, expectedHome, expectedAway)) {
    return false;
  }

  const kickoffMs = providerSettlementKickoffMs(candidate);
  if (!Number.isFinite(kickoffMs)) {
    return false;
  }

  if (options.expectedDate) {
    const candidateDate = new Date(kickoffMs).toISOString().slice(0, 10);
    if (candidateDate !== options.expectedDate) {
      const targetKickoffMs = Date.parse(options.fixture?.kickoffTime || '');
      const targetUtcDate = Number.isFinite(targetKickoffMs)
        ? new Date(targetKickoffMs).toISOString().slice(0, 10)
        : '';
      const localFixtureDate = (options.fixture?.kickoffTime || '').slice(0, 10);
      if (candidateDate !== targetUtcDate && candidateDate !== localFixtureDate) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Unified settlement candidate resolver across all providers:
 * - Validates team identity, optional calendar-date alignment, and 3-hour
 *   kickoff tolerance on direct provider-ID matches (preventing composite or
 *   reused IDs from settling a rematch on another date or a drifted fixture).
 * - Applies the same team identity, date alignment, 3-hour kickoff tolerance,
 *   and ambiguity rejection on name-based fallback candidates.
 */
export function resolveVerifiedSettlementMatch<T extends Record<string, any>>(
  options: ResolveSettlementMatchOptions<T>
): T | undefined {
  if (options.idMatch && matchesCandidateIdentityAndDate(options.idMatch, options)) {
    const verifiedIdMatch = findSafeSettlementNameMatch([options.idMatch], options.fixture);
    if (verifiedIdMatch) {
      return verifiedIdMatch;
    }
  }

  if (!Array.isArray(options.nameCandidates) || options.nameCandidates.length === 0) {
    return undefined;
  }

  const identityFiltered = options.nameCandidates.filter((candidate) =>
    matchesCandidateIdentityAndDate(candidate, options)
  );

  return findSafeSettlementNameMatch(identityFiltered, options.fixture);
}
