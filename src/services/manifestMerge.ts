import fs from 'fs';
import { fixtureHasEvidence } from '../engine/rulesEngine';

export interface MergeManifestResult {
  merged: any[];
  addedCount: number;
}

export interface SettlementCandidateSelection {
  pastFixtures: any[];
  eligiblePastFixtures: any[];
  dateGroups: Map<string, any[]>;
  allowedDates: Set<string>;
}

/**
 * 48-hour display cutoff (`YYYY-MM-DD` UTC) used strictly by UI endpoints so
 * yesterday's and upcoming fixtures are displayed without cluttering the slate
 * with older historical matches. Never apply this filter to disk writes or to
 * the 30-day settlement reader.
 */
export function getDisplayCutoffIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function filterManifestForDisplay(fixtures: any[], nowMs: number = Date.now()): any[] {
  const minCutoff = getDisplayCutoffIso(nowMs);
  return fixtures.filter(
    (f: any) =>
      f &&
      f.id &&
      f.homeTeam &&
      f.awayTeam &&
      (!f.kickoffTime || String(f.kickoffTime).slice(0, 10) >= minCutoff)
  );
}

/**
 * Unfiltered manifest reader used by the 30-day settlement job, manifest
 * merges, prediction logging, and runtime sanitization.
 */
export function readRawManifestFile(manifestPath: string, fallbackSrcPath?: string): any[] {
  let list: any[] = [];

  if (fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(data)) list = data;
    } catch (e) {
      console.warn('Error reading raw fixtures-manifest.json:', e);
    }
  }

  if (list.length === 0 && fallbackSrcPath && fs.existsSync(fallbackSrcPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(fallbackSrcPath, 'utf-8'));
      if (Array.isArray(data)) list = data;
    } catch (e) {
      console.warn('Error reading source fixture manifest:', e);
    }
  }

  return list;
}

/**
 * 48-hour display-filtered manifest reader used by UI-facing endpoints.
 * Syncs `fallbackSrcPath` unfiltered if `manifestPath` is empty, then returns
 * only fixtures within the 48-hour display window.
 */
export function readDisplayManifestFile(
  manifestPath: string,
  fallbackSrcPath?: string,
  nowMs: number = Date.now()
): any[] {
  let list: any[] = [];

  if (fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(data)) {
        list = data;
      }
    } catch (e) {
      console.warn('Error reading fixtures-manifest.json:', e);
    }
  }

  if (list.length === 0 && fallbackSrcPath && fs.existsSync(fallbackSrcPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(fallbackSrcPath, 'utf-8'));
      if (Array.isArray(data)) {
        list = data;
        try {
          fs.writeFileSync(manifestPath, JSON.stringify(list, null, 2), 'utf-8');
        } catch {}
      }
    } catch (e) {
      console.warn('Error reading upcoming_fixtures.json:', e);
    }
  }

  return filterManifestForDisplay(list, nowMs);
}

/**
 * Selects unsettled past fixtures within the 30-day settlement lookback window
 * directly from the UNFILTERED raw disk manifest (`readRawManifestFile`),
 * never from the 48-hour-filtered UI display reader.
 */
export function selectSettlementCandidatesFromManifest(options: {
  manifestPath: string;
  fallbackSrcPath?: string;
  settledIds: ReadonlySet<string>;
  nowMs?: number;
  lookbackDays?: number;
}): SettlementCandidateSelection {
  const now = options.nowMs ?? Date.now();
  const manifest = readRawManifestFile(options.manifestPath, options.fallbackSrcPath);

  const pastFixtures = manifest.filter((f: any) => {
    if (!f || !f.id || !f.kickoffTime) return false;
    if (options.settledIds.has(f.id)) return false;
    const kickoffMs = new Date(f.kickoffTime).getTime();
    return Number.isFinite(kickoffMs) && kickoffMs < now;
  });

  const settlementLookbackDays = Math.max(7, Number(options.lookbackDays ?? 30));
  const cutoffMs = now - settlementLookbackDays * 24 * 60 * 60 * 1000;
  const eligiblePastFixtures = pastFixtures.filter((f: any) => {
    const kickoffMs = new Date(f.kickoffTime).getTime();
    return Number.isFinite(kickoffMs) && kickoffMs >= cutoffMs;
  });

  const dateGroups = new Map<string, any[]>();
  for (const f of eligiblePastFixtures) {
    const kickoffMs = new Date(f.kickoffTime).getTime();
    const d = Number.isFinite(kickoffMs)
      ? new Date(kickoffMs).toISOString().slice(0, 10)
      : String(f.kickoffTime || '').slice(0, 10);
    if (!d) continue;
    if (!dateGroups.has(d)) dateGroups.set(d, []);
    dateGroups.get(d)!.push(f);
  }

  const allowedDates = new Set(
    Array.from({ length: settlementLookbackDays + 1 }, (_, i) =>
      new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    )
  );

  return {
    pastFixtures,
    eligiblePastFixtures,
    dateGroups,
    allowedDates,
  };
}

const UNKNOWN_COMPETITION_TOKENS = new Set([
  '',
  'unknown',
  'unknownleague',
  'unknowncompetition',
  'unverified',
  'na',
  'none',
  'null',
  'undefined',
  'tbd',
]);

const PROVIDER_FIXTURE_ID_FIELDS = [
  'sportApiAiFixtureId',
  'sportmonksFixtureId',
  'apiFootballFixtureId',
  'theRundownEventId',
  'pitchApiMatchId',
  'bsdFixtureId',
  'sportDbMatchId',
] as const;

function normalizeTeamKey(name: unknown): string {
  return typeof name === 'string' ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function normalizeCompetitionText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const norm = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return UNKNOWN_COMPETITION_TOKENS.has(norm) ? '' : norm;
}

/**
 * Extracts canonical UTC kickoff identity to minute precision (`YYYY-MM-DDTHH:MMZ`).
 * Requires an explicit `HH:MM` time component; never fabricates a kickoff time
 * from a date-only or missing string.
 */
function extractKickoffMinuteKey(kickoffTime: unknown): string {
  if (typeof kickoffTime !== 'string') return '';
  const trimmed = kickoffTime.trim();
  if (!/[T ]\d{2}:\d{2}/.test(trimmed)) return '';

  const normalizedWithT = trimmed.replace(' ', 'T');
  let ms = NaN;
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(normalizedWithT)) {
    ms = Date.parse(normalizedWithT);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalizedWithT)) {
    const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalizedWithT)
      ? `${normalizedWithT}:00`
      : normalizedWithT;
    ms = Date.parse(`${withSeconds}Z`);
  } else {
    ms = Date.parse(trimmed);
  }

  if (!Number.isFinite(ms)) return '';
  return `${new Date(ms).toISOString().slice(0, 16)}Z`;
}

/**
 * Extracts canonical competition/league identity without fabricating defaults.
 * Returns `''` when competition information is missing or placeholder-only.
 */
function extractCompetitionIdentityKey(fixture: any): string {
  if (!fixture || typeof fixture !== 'object') return '';

  const textKey =
    normalizeCompetitionText(fixture.competition) ||
    normalizeCompetitionText(fixture.league);
  if (textKey) return textKey;

  if (fixture.sportApiAiLeagueId !== undefined && fixture.sportApiAiLeagueId !== null && String(fixture.sportApiAiLeagueId).trim() !== '') {
    return `sportapiaileague:${String(fixture.sportApiAiLeagueId).trim()}`;
  }
  if (fixture.sportmonksLeagueId !== undefined && fixture.sportmonksLeagueId !== null && String(fixture.sportmonksLeagueId).trim() !== '') {
    return `sportmonksleague:${String(fixture.sportmonksLeagueId).trim()}`;
  }
  if (fixture.apiFootballLeagueId !== undefined && fixture.apiFootballLeagueId !== null && String(fixture.apiFootballLeagueId).trim() !== '') {
    return `apifootballleague:${String(fixture.apiFootballLeagueId).trim()}`;
  }
  if (fixture.bsdLeagueId !== undefined && fixture.bsdLeagueId !== null && String(fixture.bsdLeagueId).trim() !== '') {
    return `bsdleague:${String(fixture.bsdLeagueId).trim()}`;
  }
  if (fixture.competitionId !== undefined && fixture.competitionId !== null && String(fixture.competitionId).trim() !== '') {
    return `competitionid:${String(fixture.competitionId).trim()}`;
  }
  if (fixture.leagueId !== undefined && fixture.leagueId !== null && String(fixture.leagueId).trim() !== '') {
    return `leagueid:${String(fixture.leagueId).trim()}`;
  }

  return '';
}

function hasConflictingCompetitionMetadata(a: any, b: any): boolean {
  const idFields = [
    'sportApiAiLeagueId',
    'sportmonksLeagueId',
    'apiFootballLeagueId',
    'bsdLeagueId',
    'competitionId',
    'leagueId',
  ] as const;

  for (const field of idFields) {
    const valA = a?.[field];
    const valB = b?.[field];
    if (
      valA !== undefined && valA !== null && String(valA).trim() !== '' &&
      valB !== undefined && valB !== null && String(valB).trim() !== '' &&
      String(valA).trim() !== String(valB).trim()
    ) {
      return true;
    }
  }

  const compA = normalizeCompetitionText(a?.competition);
  const compB = normalizeCompetitionText(b?.competition);
  if (compA && compB && compA !== compB) return true;

  const leagueA = normalizeCompetitionText(a?.league);
  const leagueB = normalizeCompetitionText(b?.league);
  if (leagueA && leagueB && leagueA !== leagueB) return true;

  return false;
}

function hasConflictingFixtureProviderIds(a: any, b: any): boolean {
  for (const field of PROVIDER_FIXTURE_ID_FIELDS) {
    const valA = a?.[field];
    const valB = b?.[field];
    if (
      valA !== undefined && valA !== null && String(valA).trim() !== '' &&
      valB !== undefined && valB !== null && String(valB).trim() !== '' &&
      String(valA).trim() !== String(valB).trim()
    ) {
      return true;
    }
  }
  return false;
}

function sharesTrustedProviderFixtureId(a: any, b: any): boolean {
  const trustedFields = [
    'sportApiAiFixtureId',
    'sportmonksFixtureId',
    'apiFootballFixtureId',
  ] as const;
  for (const field of trustedFields) {
    const valA = a?.[field];
    const valB = b?.[field];
    if (
      valA !== undefined && valA !== null && String(valA).trim() !== '' &&
      valB !== undefined && valB !== null && String(valB).trim() !== '' &&
      String(valA).trim() === String(valB).trim()
    ) {
      return true;
    }
  }
  return false;
}

export function hasSafeFixtureIdentity(fixture: any): boolean {
  const home = normalizeTeamKey(fixture?.homeTeam?.name);
  const away = normalizeTeamKey(fixture?.awayTeam?.name);
  const kickoffKey = extractKickoffMinuteKey(fixture?.kickoffTime);
  const competitionKey = extractCompetitionIdentityKey(fixture);
  return Boolean(home && away && home !== away && kickoffKey && competitionKey);
}

function isBookmakerProtectedFixture(fixture: any): boolean {
  return Boolean(
    fixture?.isBookmakerProtected ||
    (typeof fixture?.id === 'string' && fixture.id.startsWith('hollywoodbets_'))
  );
}

/**
 * Builds the composite identity key (`competition|home_vs_away|YYYY-MM-DDTHH:MMZ`)
 * when competition, distinct teams, and explicit kickoff time are all known.
 * Returns `''` rather than fabricating defaults when any identity dimension is missing.
 */
export function buildManifestFixtureKey(fixture: any): string {
  const home = normalizeTeamKey(fixture?.homeTeam?.name);
  const away = normalizeTeamKey(fixture?.awayTeam?.name);
  const kickoffKey = extractKickoffMinuteKey(fixture?.kickoffTime);
  const competitionKey = extractCompetitionIdentityKey(fixture);
  if (!home || !away || home === away || !kickoffKey || !competitionKey) {
    return '';
  }
  return `${competitionKey}|${home}_vs_${away}|${kickoffKey}`;
}

function isStructurallyValidFixture(fixture: any): boolean {
  return Boolean(
    fixture &&
    fixture.id &&
    fixture.homeTeam?.name &&
    fixture.awayTeam?.name
  );
}

function backfillBookmakerProviderIds(target: any, source: any): void {
  if (!target.sportApiAiFixtureId && source.sportApiAiFixtureId) {
    target.sportApiAiFixtureId = source.sportApiAiFixtureId;
  }
  if (!target.theRundownEventId && source.theRundownEventId) {
    target.theRundownEventId = source.theRundownEventId;
  }
  if (!target.apiFootballFixtureId && source.apiFootballFixtureId) {
    target.apiFootballFixtureId = source.apiFootballFixtureId;
  }
  if (!target.sportmonksFixtureId && source.sportmonksFixtureId) {
    target.sportmonksFixtureId = source.sportmonksFixtureId;
  }
  if (!target.pitchApiMatchId && source.pitchApiMatchId) {
    target.pitchApiMatchId = source.pitchApiMatchId;
  }
  if (!target.bsdFixtureId && source.bsdFixtureId) {
    target.bsdFixtureId = source.bsdFixtureId;
  }
}

function reconcileSafelyMatchedFixtures(
  existing: any,
  incoming: any,
  incomingAreBookmakerProtected: boolean
): any {
  if (!incomingAreBookmakerProtected) {
    if (isBookmakerProtectedFixture(existing)) {
      const preserved = { ...existing };
      backfillBookmakerProviderIds(preserved, incoming);
      if (!fixtureHasEvidence(preserved) && fixtureHasEvidence(incoming)) {
        preserved.homeTeam = incoming.homeTeam;
        preserved.awayTeam = incoming.awayTeam;
        if (incoming.h2h !== undefined) preserved.h2h = incoming.h2h;
        if (incoming.isStandingsVerified !== undefined) {
          preserved.isStandingsVerified = incoming.isStandingsVerified;
        }
        if (incoming.authenticity !== undefined) {
          preserved.authenticity = incoming.authenticity;
        }
      }
      return preserved;
    }

    if (fixtureHasEvidence(existing) && !fixtureHasEvidence(incoming)) {
      const preserved = { ...existing };
      backfillBookmakerProviderIds(preserved, incoming);
      return preserved;
    }

    const updated = { ...incoming };
    backfillBookmakerProviderIds(updated, existing);
    if (updated.odds === undefined && existing.odds !== undefined) {
      updated.odds = existing.odds;
    }
    if (updated.impliedProbabilities === undefined && existing.impliedProbabilities !== undefined) {
      updated.impliedProbabilities = existing.impliedProbabilities;
    }
    return updated;
  }

  const bookmakerUpdated = { ...incoming, isBookmakerProtected: true };
  backfillBookmakerProviderIds(bookmakerUpdated, existing);
  if (bookmakerUpdated.odds === undefined && existing.odds !== undefined) {
    bookmakerUpdated.odds = existing.odds;
  }
  if (bookmakerUpdated.impliedProbabilities === undefined && existing.impliedProbabilities !== undefined) {
    bookmakerUpdated.impliedProbabilities = existing.impliedProbabilities;
  }
  if (fixtureHasEvidence(existing) && !fixtureHasEvidence(incoming)) {
    bookmakerUpdated.homeTeam = existing.homeTeam;
    bookmakerUpdated.awayTeam = existing.awayTeam;
    if (existing.h2h !== undefined) bookmakerUpdated.h2h = existing.h2h;
    if (existing.isStandingsVerified !== undefined) {
      bookmakerUpdated.isStandingsVerified = existing.isStandingsVerified;
    }
    if (existing.authenticity !== undefined) {
      bookmakerUpdated.authenticity = existing.authenticity;
    }
  }
  return bookmakerUpdated;
}

/**
 * Non-destructively merges incoming fixtures into the full raw disk manifest.
 *
 * Critical guarantees:
 * 1. NEVER filters or drops existing manifest fixtures based on a 48-hour display
 *    cutoff. Past fixtures within the 30-day settlement lookback window remain
 *    intact on disk until settled or explicitly purged.
 * 2. Distinguishes fixtures by normalized home/away teams, explicit UTC kickoff
 *    time, and known competition identity. Separate kickoff times, different
 *    competitions, or missing/ambiguous competition or kickoff metadata remain
 *    separate and are never destructively merged.
 * 3. Preserves colliding existing-manifest records unless their identity as a
 *    single provider-verified record is safely established.
 * 4. Never deletes or replaces an existing fixture on a provider-ID match alone,
 *    and preserves bookmaker-protected fields and stronger verified evidence on
 *    genuinely safe merges.
 */
export function mergeIncomingFixturesIntoManifest(
  existingManifest: any[],
  incomingFixtures: any[],
  options: { incomingAreBookmakerProtected?: boolean } = {}
): MergeManifestResult {
  const mergedMap = new Map<string, any>();
  const ambiguousKeys = new Set<string>();
  let isolatedSlotCounter = 0;

  for (const df of existingManifest) {
    if (!isStructurallyValidFixture(df)) continue;
    const cloned = { ...df };

    if (!hasSafeFixtureIdentity(cloned)) {
      mergedMap.set(`unverified_existing_${String(cloned.id)}_${isolatedSlotCounter++}`, cloned);
      continue;
    }

    const key = buildManifestFixtureKey(cloned);
    if (ambiguousKeys.has(key)) {
      mergedMap.set(`${key}__existing_collision_${isolatedSlotCounter++}`, cloned);
      continue;
    }

    const priorExisting = mergedMap.get(key);
    if (!priorExisting) {
      mergedMap.set(key, cloned);
      continue;
    }

    const sameVerifiedExistingRecord =
      String(priorExisting.id) === String(cloned.id) &&
      sharesTrustedProviderFixtureId(priorExisting, cloned) &&
      !hasConflictingCompetitionMetadata(priorExisting, cloned) &&
      !hasConflictingFixtureProviderIds(priorExisting, cloned);

    if (sameVerifiedExistingRecord) {
      mergedMap.set(
        key,
        reconcileSafelyMatchedFixtures(priorExisting, cloned, Boolean(cloned.isBookmakerProtected))
      );
    } else {
      // Two existing manifest records resolved to the same composite key without
      // provable single-record identity: preserve both rather than discarding one.
      ambiguousKeys.add(key);
      mergedMap.delete(key);
      mergedMap.set(`${key}__existing_collision_${isolatedSlotCounter++}`, priorExisting);
      mergedMap.set(`${key}__existing_collision_${isolatedSlotCounter++}`, cloned);
    }
  }

  let addedCount = 0;

  for (const rawIncoming of incomingFixtures) {
    if (!isStructurallyValidFixture(rawIncoming)) continue;
    const incoming = options.incomingAreBookmakerProtected
      ? { ...rawIncoming, isBookmakerProtected: true }
      : { ...rawIncoming };

    if (!hasSafeFixtureIdentity(incoming)) {
      // Missing kickoff time or missing competition metadata means fixture identity
      // cannot be safely established. Conservatively preserve both records rather
      // than treating missing metadata or a shared ID as proof of identity.
      mergedMap.set(`unverified_incoming_${String(incoming.id)}_${isolatedSlotCounter++}`, incoming);
      addedCount++;
      continue;
    }

    const key = buildManifestFixtureKey(incoming);
    if (ambiguousKeys.has(key)) {
      mergedMap.set(`${key}__incoming_ambiguous_${isolatedSlotCounter++}`, incoming);
      addedCount++;
      continue;
    }

    const existing = mergedMap.get(key);
    if (!existing) {
      mergedMap.set(key, incoming);
      addedCount++;
      continue;
    }

    if (
      hasConflictingCompetitionMetadata(existing, incoming) ||
      hasConflictingFixtureProviderIds(existing, incoming)
    ) {
      ambiguousKeys.add(key);
      mergedMap.delete(key);
      mergedMap.set(`${key}__existing_separate_${isolatedSlotCounter++}`, existing);
      mergedMap.set(`${key}__incoming_separate_${isolatedSlotCounter++}`, incoming);
      addedCount++;
      continue;
    }

    mergedMap.set(
      key,
      reconcileSafelyMatchedFixtures(existing, incoming, Boolean(options.incomingAreBookmakerProtected))
    );
  }

  const merged = Array.from(mergedMap.values());
  merged.sort((a, b) => new Date(a.kickoffTime || 0).getTime() - new Date(b.kickoffTime || 0).getTime());

  return { merged, addedCount };
}

/**
 * Builds the active display slate (>= minCutoffDate, typically 48h ago) by
 * combining active manifest entries with live ESPN scoreboard fixtures in memory,
 * WITHOUT mutating or truncating the persisted disk manifest.
 */
export function buildLiveScoreboardDisplaySlate(
  existingManifest: any[],
  liveScoreboardFixtures: any[],
  minCutoffDate: string
): any[] {
  const { merged } = mergeIncomingFixturesIntoManifest(existingManifest, liveScoreboardFixtures);
  return merged.filter(
    (f) => !f.kickoffTime || String(f.kickoffTime).slice(0, 10) >= minCutoffDate
  );
}
