/**
 * Safe fallback for settlement when provider IDs are unavailable.
 * Team names alone are not enough: rematches/cup fixtures can share the same
 * pair. Require an explicit provider kickoff within 3 hours and exactly one
 * candidate; ambiguous or undated records are deliberately not settled.
 */
export function providerSettlementKickoffMs(match: any): number {
  const raw = match?.datetime ?? match?.kickoff_time ?? match?.utc_date ??
    match?.starting_at ?? match?.date ?? match?.commence_time ??
    match?.start_time ?? match?.startTime ?? match?.fixture?.date ??
    match?.fixture?.kickoff_time ?? match?.fixture?.starting_at;
  if (typeof raw !== 'string' || !/[T ]\d{2}:\d{2}/.test(raw)) return NaN;
  return Date.parse(raw);
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
    return Number.isFinite(candidateKickoff) &&
      Math.abs(candidateKickoff - targetKickoff) <= 3 * 60 * 60 * 1000;
  });
  return eligible.length === 1 ? eligible[0] : undefined;
}
