/**
 * Server-only clients for API-Football (RapidAPI) and Sportmonks.
 *
 * Credentials are read only from process.env and must be injected by Cloud Run
 * Secret Manager. Never import this module from browser/client code.
 */

const API_FOOTBALL_DEFAULT_BASE_URL = 'https://api-football-v1.p.rapidapi.com/v3';
const SPORTMONKS_DEFAULT_BASE_URL = 'https://api.sportmonks.com/v3/football';

function getApiFootballKey(): string {
  return process.env.API_FOOTBALL_USE_RAPIDAPI?.trim() || process.env.API_FOOTBALL_KEY?.trim() || '';
}

function isRapidApiMode(): boolean {
  return Boolean(process.env.API_FOOTBALL_USE_RAPIDAPI?.trim()) || Boolean(process.env.API_FOOTBALL_RAPIDAPI_HOST?.trim());
}

function getSportmonksKey(): string {
  const raw = process.env.SPORTMONKS_API_KEY?.trim() || process.env.SPORTMONKS_API_TOKEN?.trim() || '';
  if (!raw || raw === 'undefined' || raw === 'null' || raw === 'your_key_here' || raw === 'placeholder') return '';
  return raw;
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

function assertDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be YYYY-MM-DD');
  }
}

async function requestJson(url: URL, headers: Record<string, string>, provider: string): Promise<any> {
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
      // Authentication/plan failures are not rate limits. Avoid a misleading
      // 24-hour cooldown; correct Secret Manager wiring/plan before retrying.
      if (provider === 'Sportmonks') sportmonksAuthFailedKey = getSportmonksKey();
      if (provider === 'API-Football') apiFootballAuthFailedKey = getApiFootballKey();
      console.warn(`[${provider}] Authentication or subscription failure (HTTP ${response.status}); provider paused until its credential changes.`);
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

/** Call an API-Football v3 endpoint using the RapidAPI credential. */
export async function apiFootballGet(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  if (isApiFootballRateLimited()) throw new Error('API-Football is rate-limited');
  const key = getApiFootballKey();
  if (!key) throw new Error('API_FOOTBALL_USE_RAPIDAPI is not configured');
  if (key === apiFootballAuthFailedKey) throw new Error('API-Football credential was rejected; rotate the configured key before retrying');

  const base = getBaseUrl(process.env.API_FOOTBALL_BASE_URL, API_FOOTBALL_DEFAULT_BASE_URL);
  const normalizedPath = path.split('/').filter(Boolean).join('/');
  const url = new URL(`${base}/${normalizedPath}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
  }
  const host = new URL(base).host;
  const headers = isRapidApiMode()
    ? {
        'x-rapidapi-key': key,
        'x-rapidapi-host': process.env.API_FOOTBALL_RAPIDAPI_HOST?.trim() || host,
      }
    : { 'x-apisports-key': key };
  return requestJson(url, headers, 'API-Football');
}

export async function fetchApiFootballFixturesByDate(date: string): Promise<any[]> {
  assertDate(date);
  if (!apiFootballConfigured()) return [];
  try {
    const body = await apiFootballGet('fixtures', { date });
    if (!Array.isArray(body.response)) throw new Error('API-Football fixtures response.response is not an array');
    return body.response;
  } catch (err) {
    if (isApiFootballRateLimited()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchApiFootballHeadToHead(homeTeamId: number | string, awayTeamId: number | string): Promise<any[]> {
  const body = await apiFootballGet('fixtures/headtohead', { h2h: `${homeTeamId}-${awayTeamId}`, last: 5 });
  return Array.isArray(body.response) ? body.response : [];
}

export async function fetchApiFootballTeamStatistics(
  teamId: number | string,
  leagueId: number | string,
  season: number | string
): Promise<any> {
  const body = await apiFootballGet('teams/statistics', { team: teamId, league: leagueId, season });
  return body.response ?? null;
}

export async function fetchApiFootballFixtureStatistics(fixtureId: number | string): Promise<any[]> {
  const body = await apiFootballGet('fixtures/statistics', { fixture: fixtureId });
  return Array.isArray(body.response) ? body.response : [];
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
  if (isSportmonksRateLimited()) return [];
  try {
    const body = await sportmonksGet(`fixtures/date/${date}`, { include: includes });
    if (!Array.isArray(body.data)) throw new Error('Sportmonks fixtures response.data is not an array');
    return body.data;
  } catch (err) {
    if (isSportmonksRateLimited()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchSportmonksFixtureStatistics(fixtureId: number | string): Promise<any[]> {
  if (isSportmonksRateLimited()) return [];
  try {
    const body = await sportmonksGet(`fixtures/${fixtureId}`, { include: 'statistics.type;participants' });
    const stats = body.data?.statistics?.data ?? body.data?.statistics;
    return Array.isArray(stats) ? stats : [];
  } catch (err) {
    if (isSportmonksRateLimited()) return [];
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
  if (isSportmonksRateLimited()) return [];
  try {
    const body = await sportmonksGet(`fixtures/between/${startDate}/${endDate}`, {
      include: includes,
      per_page: 100,
    });
    if (!Array.isArray(body.data)) throw new Error('Sportmonks fixture range response.data is not an array');
    return body.data;
  } catch (err) {
    if (isSportmonksRateLimited()) return [];
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
  if (isSportmonksRateLimited()) return [];
  try {
    const body = await sportmonksGet(`fixtures/between/${startDate}/${endDate}/${encodeURIComponent(String(teamId))}`, {
      include: includes,
      per_page: 25,
    });
    if (!Array.isArray(body.data)) throw new Error('Sportmonks team fixture response.data is not an array');
    return body.data;
  } catch (err) {
    if (isSportmonksRateLimited()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}

export async function fetchSportmonksStandingsBySeason(seasonId: number | string): Promise<any[]> {
  if (!String(seasonId).trim()) throw new Error('Sportmonks season id is required');
  if (isSportmonksRateLimited()) return [];
  try {
    const body = await sportmonksGet(`standings/seasons/${encodeURIComponent(String(seasonId))}`, {});
    return Array.isArray(body.data) ? body.data : [];
  } catch (err) {
    if (isSportmonksRateLimited()) return [];
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
  if (isSportmonksRateLimited()) return [];
  try {
    const body = await sportmonksGet(
      `fixtures/head-to-head/${encodeURIComponent(String(team1Id))}/${encodeURIComponent(String(team2Id))}`,
      { include: 'participants;scores;league;state;season' }
    );
    return Array.isArray(body.data) ? body.data : [];
  } catch (err) {
    if (isSportmonksRateLimited()) return [];
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('401') || msg.includes('Invalid token') || msg.includes('403') || msg.includes('unauthenticated')) {
      return [];
    }
    throw err;
  }
}
