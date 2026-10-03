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
  return process.env.SPORTMONKS_API_KEY?.trim() || process.env.SPORTMONKS_API_TOKEN?.trim() || '';
}

function getBaseUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

export function apiFootballConfigured(): boolean {
  return getApiFootballKey().length > 0;
}

export function sportmonksConfigured(): boolean {
  return getSportmonksKey().length > 0;
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
    throw new Error(`${provider} HTTP ${response.status}: ${message}`);
  }
  if (!body || typeof body !== 'object') {
    throw new Error(`${provider} returned an invalid JSON response`);
  }
  return body;
}

/** Call an API-Football v3 endpoint using the RapidAPI credential. */
export async function apiFootballGet(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const key = getApiFootballKey();
  if (!key) throw new Error('API_FOOTBALL_USE_RAPIDAPI is not configured');

  const base = getBaseUrl(process.env.API_FOOTBALL_BASE_URL, API_FOOTBALL_DEFAULT_BASE_URL);
  const url = new URL(`${base}/${path.replace(/^\/+/, '')}`);
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
  const body = await apiFootballGet('fixtures', { date });
  if (!Array.isArray(body.response)) throw new Error('API-Football fixtures response.response is not an array');
  return body.response;
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

/** Call a Sportmonks v3 Football endpoint; api_token is added as a query parameter. */
export async function sportmonksGet(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
  const key = getSportmonksKey();
  if (!key) throw new Error('SPORTMONKS_API_KEY is not configured');

  const base = getBaseUrl(process.env.SPORTMONKS_BASE_URL, SPORTMONKS_DEFAULT_BASE_URL);
  const url = new URL(`${base}/${path.replace(/^\/+/, '')}`);
  url.searchParams.set('api_token', key);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
  }
  return requestJson(url, {}, 'Sportmonks');
}

export async function fetchSportmonksFixturesByDate(date: string, includes = 'participants;scores;league;state'): Promise<any[]> {
  assertDate(date);
  const body = await sportmonksGet(`fixtures/date/${date}`, { include: includes });
  if (!Array.isArray(body.data)) throw new Error('Sportmonks fixtures response.data is not an array');
  return body.data;
}

export async function fetchSportmonksFixtureStatistics(fixtureId: number | string): Promise<any[]> {
  const body = await sportmonksGet(`fixtures/${fixtureId}`, { include: 'statistics.type;participants' });
  const stats = body.data?.statistics?.data ?? body.data?.statistics;
  return Array.isArray(stats) ? stats : [];
}

export async function fetchSportmonksFixturesBetween(
  startDate: string,
  endDate: string,
  includes = 'participants;scores;league;state;venue;round;season'
): Promise<any[]> {
  assertDate(startDate);
  assertDate(endDate);
  if (startDate > endDate) throw new Error('Start date must be on or before end date');
  const body = await sportmonksGet(`fixtures/between/${startDate}/${endDate}`, {
    include: includes,
    per_page: 100,
  });
  if (!Array.isArray(body.data)) throw new Error('Sportmonks fixture range response.data is not an array');
  return body.data;
}

export async function fetchSportmonksFixturesBetweenForTeam(
  startDate: string,
  endDate: string,
  teamId: number | string,
  includes = 'participants;scores;league;state;venue;round;season;statistics.type;xGFixture'
): Promise<any[]> {
  assertDate(startDate);
  assertDate(endDate);
  if (startDate > endDate) throw new Error('Start date must be on or before end date');
  if (!String(teamId).trim()) throw new Error('Sportmonks team id is required');
  const body = await sportmonksGet(`fixtures/between/${startDate}/${endDate}/${encodeURIComponent(String(teamId))}`, {
    include: includes,
    per_page: 25,
  });
  if (!Array.isArray(body.data)) throw new Error('Sportmonks team fixture response.data is not an array');
  return body.data;
}

export async function fetchSportmonksStandingsBySeason(seasonId: number | string): Promise<any[]> {
  if (!String(seasonId).trim()) throw new Error('Sportmonks season id is required');
  const body = await sportmonksGet(`standings/seasons/${encodeURIComponent(String(seasonId))}`, {});
  return Array.isArray(body.data) ? body.data : [];
}

export async function fetchSportmonksHeadToHead(
  team1Id: number | string,
  team2Id: number | string
): Promise<any[]> {
  if (!String(team1Id).trim() || !String(team2Id).trim()) throw new Error('Sportmonks team ids are required');
  const body = await sportmonksGet(
    `fixtures/head-to-head/${encodeURIComponent(String(team1Id))}/${encodeURIComponent(String(team2Id))}`,
    { include: 'participants;scores;league;state;season' }
  );
  return Array.isArray(body.data) ? body.data : [];
}
