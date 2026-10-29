/**
 * Server-only clients for API-Football (direct API-SPORTS or RapidAPI) and Sportmonks.
 *
 * Credentials are read only from process.env and must be injected by Cloud Run
 * Secret Manager or AI Studio Secrets. Never import this module from browser/client code.
 */

const API_FOOTBALL_DIRECT_BASE_URL = 'https://v3.football.api-sports.io';
const API_FOOTBALL_RAPIDAPI_BASE_URL = 'https://api-football-v1.p.rapidapi.com/v3';
const SPORTMONKS_DEFAULT_BASE_URL = 'https://api.sportmonks.com/v3/football';

const PLACEHOLDER_OR_FLAG_VALUES = new Set([
  '',
  'undefined',
  'null',
  'your_key_here',
  'placeholder',
  'true',
  'false',
  '0',
  '1',
]);

function sanitizeCredential(raw: string | undefined): string {
  const trimmed = raw?.trim() || '';
  if (!trimmed || PLACEHOLDER_OR_FLAG_VALUES.has(trimmed.toLowerCase())) return '';
  return trimmed;
}

function getDirectApiFootballKey(): string {
  return (
    sanitizeCredential(process.env.API_FOOTBALL_KEY) ||
    sanitizeCredential(process.env.API_FOOTBALL) ||
    sanitizeCredential(process.env.API_FOOTBALL_API_KEY) ||
    sanitizeCredential(process.env.APISPORTS_KEY)
  );
}

function getLegacyRapidApiFootballKey(): string {
  return sanitizeCredential(process.env.API_FOOTBALL_USE_RAPIDAPI);
}

function getApiFootballKey(): string {
  // Prefer direct API-SPORTS credential variables (API_FOOTBALL_KEY, API_FOOTBALL, etc.).
  // Keep legacy API_FOOTBALL_USE_RAPIDAPI as a backward-compatible fallback.
  return getDirectApiFootballKey() || getLegacyRapidApiFootballKey();
}

let apiFootballDirectVerifiedKey = '';

function isRapidApiMode(key = getApiFootballKey()): boolean {
  // A direct API-SPORTS key always wins if any direct credential variable exists,
  // or if this exact credential already authenticated directly with API-SPORTS.
  if (getDirectApiFootballKey()) return false;
  if (key && key === apiFootballDirectVerifiedKey) return false;
  return Boolean(getLegacyRapidApiFootballKey()) || Boolean(process.env.API_FOOTBALL_RAPIDAPI_HOST?.trim());
}

function getSportmonksKey(): string {
  return (
    sanitizeCredential(process.env.SPORTMONKS_API_KEY) ||
    sanitizeCredential(process.env.SPORTMONKS_API_TOKEN)
  );
}

function getBaseUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

let sportmonksRateLimitedUntil = 0;
let apiFootballRateLimitedUntil = 0;
// Pause a rejected credential without misclassifying 401/403 as rate limits.
// Rotating the key automatically clears this block.
let sportmonksAuthFailedKey = '';
let apiFootballAuthFailedKey = '';

// Plan window & response caches, scoped to current UTC day, credential, and fetch implementation
// so mocked unit tests never leak state across test cases.
interface ApiFootballDateWindowState {
  minDate: string;
  maxDate: string;
  utcDay: string;
  key: string;
  fetchRef: typeof fetch;
}

let apiFootballDateWindow: ApiFootballDateWindowState | null = null;
const apiFootballRestrictedSeasons = new Map<string, Set<number>>();
const apiFootballFixturesDateCache = new Map<string, { expiresAt: number; fetchRef: typeof fetch; value: any[] }>();
const apiFootballH2HCache = new Map<string, { expiresAt: number; fetchRef: typeof fetch; value: any[] }>();

const FIXTURES_DATE_CACHE_TTL_MS = 15 * 60 * 1000;
const H2H_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function currentUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export class ApiFootballPlanRestrictionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiFootballPlanRestrictionError';
  }
}

export function resetApiFootballRuntimeStateForTests(): void {
  apiFootballRateLimitedUntil = 0;
  apiFootballAuthFailedKey = '';
  apiFootballDirectVerifiedKey = '';
  apiFootballDateWindow = null;
  apiFootballRestrictedSeasons.clear();
  apiFootballFixturesDateCache.clear();
  apiFootballH2HCache.clear();
}

export function isSportmonksRateLimited(): boolean {
  return Date.now() < sportmonksRateLimitedUntil;
}

export function setSportmonksRateLimited(resetInSeconds = 3600): void {
  sportmonksRateLimitedUntil = Date.now() + Math.max(60, resetInSeconds) * 1000;
}

export function isApiFootballRateLimited(): boolean {
  return Date.now() < apiFootballRateLimitedUntil;
}

export function setApiFootballRateLimited(resetInSeconds = 3600): void {
  apiFootballRateLimitedUntil = Date.now() + Math.max(60, resetInSeconds) * 1000;
}

export function hasApiFootballKey(): boolean {
  return getApiFootballKey().length > 0;
}

export function hasSportmonksKey(): boolean {
  return getSportmonksKey().length > 0;
}

export function apiFootballConfigured(): boolean {
  return hasApiFootballKey() && !isApiFootballRateLimited() && getApiFootballKey() !== apiFootballAuthFailedKey;
}

export function sportmonksConfigured(): boolean {
  return hasSportmonksKey() && !isSportmonksRateLimited() && getSportmonksKey() !== sportmonksAuthFailedKey;
}

export function isDateWithinApiFootballWindow(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  if (!apiFootballDateWindow) return true;
  if (
    apiFootballDateWindow.utcDay !== currentUtcDay() ||
    apiFootballDateWindow.key !== getApiFootballKey() ||
    apiFootballDateWindow.fetchRef !== globalThis.fetch
  ) {
    apiFootballDateWindow = null;
    return true;
  }
  return dateStr >= apiFootballDateWindow.minDate && dateStr <= apiFootballDateWindow.maxDate;
}

export function isApiFootballSeasonAccessible(season: number): boolean {
  if (!Number.isInteger(season)) return false;
  const scopeKey = `${currentUtcDay()}|${getApiFootballKey()}`;
  const set = apiFootballRestrictedSeasons.get(scopeKey);
  return !set || !set.has(season);
}

function markApiFootballSeasonRestricted(season: number): void {
  if (!Number.isInteger(season)) return;
  const scopeKey = `${currentUtcDay()}|${getApiFootballKey()}`;
  let set = apiFootballRestrictedSeasons.get(scopeKey);
  if (!set) {
    set = new Set<number>();
    apiFootballRestrictedSeasons.set(scopeKey, set);
  }
  set.add(season);
}

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be YYYY-MM-DD');
  }
}

async function requestJson(
  url: URL,
  headers: Record<string, string>,
  provider: string,
  options: { pauseOnAuthFailure?: boolean } = {}
): Promise<any> {
  const pauseOnAuthFailure = options.pauseOnAuthFailure ?? true;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => null) as any;
  if (!response.ok) {
    const message = typeof body?.message === 'string'
      ? body.message
      : typeof body?.errors === 'object'
        ? JSON.stringify(body.errors).slice(0, 240)
        : `HTTP ${response.status}`;
    if (
      response.status === 401 ||
      response.status === 403 ||
      message.toLowerCase().includes('not subscribed') ||
      message.toLowerCase().includes('invalid token') ||
      message.toLowerCase().includes('unauthenticated') ||
      message.toLowerCase().includes('unauthorized')
    ) {
      if (pauseOnAuthFailure) {
        if (provider === 'Sportmonks') sportmonksAuthFailedKey = getSportmonksKey();
        if (provider === 'API-Football') apiFootballAuthFailedKey = getApiFootballKey();
        console.warn(`[${provider}] Authentication or subscription failure (HTTP ${response.status}); provider paused until its credential changes.`);
      }
    } else if (response.status === 429 || message.toLowerCase().includes('rate limit')) {
      if (provider === 'Sportmonks') setSportmonksRateLimited(3600);
      if (provider === 'API-Football') setApiFootballRateLimited(3600);
    }
    throw new Error(`${provider} HTTP ${response.status}: ${message}`);
  }
  if (!body || typeof body !== 'object') {
    throw new Error(`${provider} returned an invalid JSON response`);
  }
  return body;
}

function hasApiFootballObjectErrors(body: any): body is { errors: Record<string, unknown> } {
  return Boolean(
    body?.errors &&
    !Array.isArray(body.errors) &&
    typeof body.errors === 'object' &&
    Object.keys(body.errors).length > 0
  );
}

function hasApiFootballAuthError(body: any): boolean {
  if (!hasApiFootballObjectErrors(body)) return false;
  const tokenError = body.errors.token ?? body.errors.access;
  if (typeof tokenError === 'string' && tokenError.trim().length > 0) return true;
  const serialized = JSON.stringify(body.errors).toLowerCase();
  return serialized.includes('application key') || serialized.includes('invalid token') || serialized.includes('unauthenticated');
}

function hasApiFootballRateLimitError(body: any): boolean {
  if (!hasApiFootballObjectErrors(body)) return false;
  if (typeof body.errors.requests === 'string' && body.errors.requests.trim().length > 0) return true;
  if (typeof body.errors.rateLimit === 'string' && body.errors.rateLimit.trim().length > 0) return true;
  const serialized = JSON.stringify(body.errors).toLowerCase();
  return serialized.includes('request limit') || serialized.includes('too many requests') || serialized.includes('rate limit');
}

function inspectApiFootballEnvelopeErrors(
  body: any,
  key: string,
  params: Record<string, string | number | undefined>
): void {
  if (!hasApiFootballObjectErrors(body)) return;

  if (hasApiFootballAuthError(body)) {
    apiFootballAuthFailedKey = key;
    const msg = JSON.stringify(body.errors).slice(0, 240);
    console.warn('[API-Football] Credential rejected by API-SPORTS; provider paused until its credential changes.');
    throw new Error(`API-Football HTTP 401: ${msg}`);
  }

  if (hasApiFootballRateLimitError(body)) {
    const msg = JSON.stringify(body.errors).slice(0, 240);
    const isPerMinuteLimit = /per\s+minute/i.test(msg) && !/for\s+the\s+day/i.test(msg);
    const cooldownSeconds = isPerMinuteLimit ? 65 : 3600;
    setApiFootballRateLimited(cooldownSeconds);
    console.warn(`[API-Football] Quota or rate limit reached (${msg}); pausing requests for ${isPerMinuteLimit ? '65s' : '60m'}.`);
    throw new Error(`API-Football rate limited: ${msg}`);
  }

  const planMsg = typeof body.errors.plan === 'string' ? body.errors.plan : '';
  if (planMsg) {
    const dateRangeMatch = planMsg.match(/try from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i);
    if (dateRangeMatch) {
      apiFootballDateWindow = {
        minDate: dateRangeMatch[1],
        maxDate: dateRangeMatch[2],
        utcDay: currentUtcDay(),
        key,
        fetchRef: globalThis.fetch,
      };
    }
    if (/season/i.test(planMsg) && params.season !== undefined) {
      markApiFootballSeasonRestricted(Number(params.season));
    }
    throw new ApiFootballPlanRestrictionError(`API-Football plan restriction: ${planMsg}`);
  }
}

/** Call an API-Football v3 endpoint using direct API-SPORTS or RapidAPI credentials. */
export async function apiFootballGet(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  if (isApiFootballRateLimited()) throw new Error('API-Football is rate-limited');
  const key = getApiFootballKey();
  if (!key) throw new Error('API_FOOTBALL_KEY, API_FOOTBALL, or API_FOOTBALL_USE_RAPIDAPI is not configured');
  if (key === apiFootballAuthFailedKey) throw new Error('API-Football credential was rejected; rotate the configured key before retrying');

  const rapidMode = isRapidApiMode(key);
  const defaultBase = rapidMode ? API_FOOTBALL_RAPIDAPI_BASE_URL : API_FOOTBALL_DIRECT_BASE_URL;
  const base = getBaseUrl(process.env.API_FOOTBALL_BASE_URL, defaultBase);
  const normalizedPath = path.split('/').filter(Boolean).join('/');
  const buildUrl = (baseUrl: string) => {
    const target = new URL(`${baseUrl}/${normalizedPath}`);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') target.searchParams.set(name, String(value));
    }
    return target;
  };

  const url = buildUrl(base);
  const host = new URL(base).host;
  const canTryDirectFallback =
    rapidMode &&
    !process.env.API_FOOTBALL_BASE_URL?.trim() &&
    !process.env.API_FOOTBALL_RAPIDAPI_HOST?.trim();

  const headers = rapidMode
    ? {
        'x-rapidapi-key': key,
        'x-rapidapi-host': process.env.API_FOOTBALL_RAPIDAPI_HOST?.trim() || host,
      }
    : { 'x-apisports-key': key };

  let body: any;
  try {
    body = await requestJson(url, headers, 'API-Football', { pauseOnAuthFailure: !canTryDirectFallback });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const isAuthOrSubError =
      msg.includes('HTTP 401') ||
      msg.includes('HTTP 403') ||
      msg.toLowerCase().includes('not subscribed') ||
      msg.toLowerCase().includes('unauthorized');

    if (canTryDirectFallback && isAuthOrSubError) {
      let directBody: any = null;
      try {
        const directUrl = buildUrl(API_FOOTBALL_DIRECT_BASE_URL);
        directBody = await requestJson(directUrl, { 'x-apisports-key': key }, 'API-Football', { pauseOnAuthFailure: false });
      } catch {
        // Direct fallback network/HTTP failure; handled below.
      }
      if (directBody && !hasApiFootballAuthError(directBody)) {
        apiFootballDirectVerifiedKey = key;
        apiFootballAuthFailedKey = '';
        console.log('[API-Football] Authenticated directly with v3.football.api-sports.io using configured credential.');
        inspectApiFootballEnvelopeErrors(directBody, key, params);
        return directBody;
      }
      if (apiFootballDirectVerifiedKey !== key) {
        apiFootballAuthFailedKey = key;
        console.warn('[API-Football] Authentication or subscription failure; provider paused until its credential changes.');
      }
    }
    throw err;
  }

  inspectApiFootballEnvelopeErrors(body, key, params);
  return body;
}

export async function fetchApiFootballFixturesByDate(date: string): Promise<any[]> {
  assertDate(date);
  if (!apiFootballConfigured()) return [];
  if (!isDateWithinApiFootballWindow(date)) return [];

  const key = getApiFootballKey();
  const base = getBaseUrl(
    process.env.API_FOOTBALL_BASE_URL,
    isRapidApiMode(key) ? API_FOOTBALL_RAPIDAPI_BASE_URL : API_FOOTBALL_DIRECT_BASE_URL,
  );
  const cacheKey = `${key}|${base}|${date}`;
  const cached = apiFootballFixturesDateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.fetchRef === globalThis.fetch) {
    return cached.value;
  }

  try {
    const body = await apiFootballGet('fixtures', { date });
    if (!Array.isArray(body.response)) throw new Error('API-Football fixtures response.response is not an array');
    apiFootballFixturesDateCache.set(cacheKey, {
      expiresAt: Date.now() + FIXTURES_DATE_CACHE_TTL_MS,
      fetchRef: globalThis.fetch,
      value: body.response,
    });
    return body.response;
  } catch (err) {
    if (err instanceof ApiFootballPlanRestrictionError) return [];
    if (isApiFootballRateLimited()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchApiFootballHeadToHead(homeTeamId: number | string, awayTeamId: number | string): Promise<any[]> {
  if (!apiFootballConfigured()) return [];
  const key = getApiFootballKey();
  const pairKey = [String(homeTeamId), String(awayTeamId)].sort().join('-');
  const cacheKey = `${key}|${pairKey}`;
  const cached = apiFootballH2HCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.fetchRef === globalThis.fetch) {
    return cached.value;
  }

  try {
    // Omit `last` parameter: API-SPORTS Free plan rejects `last` with an empty response,
    // whereas `{ h2h }` without `last` returns full historical meetings on all plans.
    const body = await apiFootballGet('fixtures/headtohead', { h2h: `${homeTeamId}-${awayTeamId}` });
    const rawList = Array.isArray(body.response) ? body.response : [];
    const filtered = rawList.filter((item: any) => {
      const shortStatus = String(item?.fixture?.status?.short || '').toUpperCase();
      return !['NS', 'TBD', 'PST', 'CANC', 'ABD', 'WO'].includes(shortStatus);
    });
    const indexed = filtered.map((item: any, idx: number) => ({
      item,
      idx,
      ts: Date.parse(String(item?.fixture?.date || item?.date || '')),
    }));
    indexed.sort((a, b) => {
      if (Number.isFinite(a.ts) && Number.isFinite(b.ts) && a.ts !== b.ts) {
        return b.ts - a.ts;
      }
      return a.idx - b.idx;
    });
    const recentFive = indexed.slice(0, 5).map((entry) => entry.item);
    apiFootballH2HCache.set(cacheKey, {
      expiresAt: Date.now() + H2H_CACHE_TTL_MS,
      fetchRef: globalThis.fetch,
      value: recentFive,
    });
    return recentFive;
  } catch (err) {
    if (err instanceof ApiFootballPlanRestrictionError) return [];
    if (isApiFootballRateLimited()) return [];
    throw err;
  }
}

export async function fetchApiFootballTeamStatistics(
  teamId: number | string,
  leagueId: number | string,
  season: number | string
): Promise<any> {
  const seasonNum = Number(season);
  if (Number.isInteger(seasonNum) && !isApiFootballSeasonAccessible(seasonNum)) return null;
  try {
    const body = await apiFootballGet('teams/statistics', { team: teamId, league: leagueId, season });
    return body.response ?? null;
  } catch (err) {
    if (err instanceof ApiFootballPlanRestrictionError || isApiFootballRateLimited()) return null;
    throw err;
  }
}

export async function fetchApiFootballFixtureStatistics(fixtureId: number | string): Promise<any[]> {
  try {
    const body = await apiFootballGet('fixtures/statistics', { fixture: fixtureId });
    return Array.isArray(body.response) ? body.response : [];
  } catch (err) {
    if (err instanceof ApiFootballPlanRestrictionError || isApiFootballRateLimited()) return [];
    throw err;
  }
}

export function isApiFootballFixtureFinished(raw: any): boolean {
  const shortStatus = String(raw?.fixture?.status?.short || '').toUpperCase();
  return ['FT', 'AET', 'PEN'].includes(shortStatus);
}

export function getApiFootballScores(raw: any): {
  home: number | null;
  away: number | null;
  outcome: 'home' | 'draw' | 'away' | null;
} {
  if (!isApiFootballFixtureFinished(raw)) {
    return { home: null, away: null, outcome: null };
  }
  const ftHome = raw?.score?.fulltime?.home ?? raw?.goals?.home;
  const ftAway = raw?.score?.fulltime?.away ?? raw?.goals?.away;
  const home = typeof ftHome === 'number' && Number.isInteger(ftHome) && ftHome >= 0 ? ftHome : null;
  const away = typeof ftAway === 'number' && Number.isInteger(ftAway) && ftAway >= 0 ? ftAway : null;
  if (home === null || away === null) {
    return { home: null, away: null, outcome: null };
  }
  const outcome: 'home' | 'draw' | 'away' = home > away ? 'home' : away > home ? 'away' : 'draw';
  return { home, away, outcome };
}

/** Call a Sportmonks v3 Football endpoint using the raw-token Authorization header.
 * Keep the credential out of query strings, which can leak into URL/access logs.
 */
export async function sportmonksGet(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  if (isSportmonksRateLimited()) throw new Error('Sportmonks is rate-limited');
  const key = getSportmonksKey();
  if (!key) throw new Error('SPORTMONKS_API_KEY is not configured');
  if (key === sportmonksAuthFailedKey) throw new Error('Sportmonks credential was rejected; rotate the configured key before retrying');

  const base = getBaseUrl(process.env.SPORTMONKS_BASE_URL, SPORTMONKS_DEFAULT_BASE_URL);
  const normalizedPath = path.split('/').filter(Boolean).join('/');
  const url = new URL(`${base}/${normalizedPath}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
  }
  return requestJson(url, { Authorization: key }, 'Sportmonks');
}

export async function fetchSportmonksTeamsBySearch(name: string): Promise<any[]> {
  const query = String(name || '').trim();
  if (!query || !sportmonksConfigured()) return [];
  try {
    const body = await sportmonksGet(`teams/search/${encodeURIComponent(query)}`, { per_page: 10 });
    return Array.isArray(body.data) ? body.data : [];
  } catch (err) {
    if (!sportmonksConfigured()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('404') || msg.includes('not exist')) {
      return [];
    }
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchSportmonksFixturesByDate(date: string, includes = 'participants;scores;league;state'): Promise<any[]> {
  assertDate(date);
  if (!sportmonksConfigured()) return [];
  try {
    const body = await sportmonksGet(`fixtures/date/${date}`, { include: includes });
    if (!Array.isArray(body.data)) throw new Error('Sportmonks fixtures response.data is not an array');
    return body.data;
  } catch (err) {
    if (!sportmonksConfigured()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchSportmonksFixtureStatistics(fixtureId: number | string): Promise<any[]> {
  if (!sportmonksConfigured()) return [];
  try {
    const body = await sportmonksGet(`fixtures/${fixtureId}`, { include: 'statistics.type;participants' });
    const stats = body.data?.statistics?.data ?? body.data?.statistics;
    return Array.isArray(stats) ? stats : [];
  } catch (err) {
    if (!sportmonksConfigured()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchSportmonksFixturesBetween(
  startDate: string,
  endDate: string,
  includes = 'participants;scores;league;state;venue;round;season'
): Promise<any[]> {
  assertDate(startDate);
  assertDate(endDate);
  if (startDate > endDate) throw new Error('Start date must be on or before end date');
  if (!sportmonksConfigured()) return [];
  try {
    const body = await sportmonksGet(`fixtures/between/${startDate}/${endDate}`, {
      include: includes,
      per_page: 100,
    });
    if (!Array.isArray(body.data)) throw new Error('Sportmonks fixture range response.data is not an array');
    return body.data;
  } catch (err) {
    if (!sportmonksConfigured()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchSportmonksFixturesBetweenForTeam(
  startDate: string,
  endDate: string,
  teamId: number | string,
  includes = 'participants;scores;league;state;venue;round;season'
): Promise<any[]> {
  assertDate(startDate);
  assertDate(endDate);
  if (startDate > endDate) throw new Error('Start date must be on or before end date');
  if (!String(teamId).trim()) throw new Error('Sportmonks team id is required');
  if (!sportmonksConfigured()) return [];
  try {
    const body = await sportmonksGet(`fixtures/between/${startDate}/${endDate}/${encodeURIComponent(String(teamId))}`, {
      include: includes,
      per_page: 25,
    });
    if (!Array.isArray(body.data)) throw new Error('Sportmonks team fixture response.data is not an array');
    return body.data;
  } catch (err) {
    if (!sportmonksConfigured()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchSportmonksStandingsBySeason(seasonId: number | string): Promise<any[]> {
  if (!String(seasonId).trim()) throw new Error('Sportmonks season id is required');
  if (!sportmonksConfigured()) return [];
  try {
    const body = await sportmonksGet(`standings/seasons/${encodeURIComponent(String(seasonId))}`, {});
    return Array.isArray(body.data) ? body.data : [];
  } catch (err) {
    if (!sportmonksConfigured()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchSportmonksHeadToHead(
  team1Id: number | string,
  team2Id: number | string
): Promise<any[]> {
  if (!String(team1Id).trim() || !String(team2Id).trim()) throw new Error('Sportmonks team ids are required');
  if (!sportmonksConfigured()) return [];
  try {
    const body = await sportmonksGet(
      `fixtures/head-to-head/${encodeURIComponent(String(team1Id))}/${encodeURIComponent(String(team2Id))}`,
      { include: 'participants;scores;league;state;season' }
    );
    return Array.isArray(body.data) ? body.data : [];
  } catch (err) {
    if (!sportmonksConfigured()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}
