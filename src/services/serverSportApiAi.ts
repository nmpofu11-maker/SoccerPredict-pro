/**
 * SportAPI.ai client (Primary Provider).
 *
 * Provides real-time fixtures, live scores, match events, and historical results
 * across 100+ worldwide soccer leagues.
 *
 * Base URL: https://sportapi.ai/api
 * Auth: Authorization: Bearer <SPORTAPI_AI_KEY>
 * Daily Endpoint: GET /api/fixtures/date/{YYYY-MM-DD}
 */

import { isValidFootballScore, normalizeFootballScore } from '../utils/scoreValidation';

export interface SportApiAiFixture {
  id: string | number;
  date?: string;
  kickoff_time?: string;
  status?: string; // 'FINISHED', 'FT', 'LIVE', 'SCHEDULED', 'AET', 'PEN'
  league?: {
    id?: string | number;
    name?: string;
    country?: string;
    round?: string;
  } | string;
  home_team?: {
    id?: string | number;
    name?: string;
    score?: number | null;
  };
  away_team?: {
    id?: string | number;
    name?: string;
    score?: number | null;
  };
  score?: {
    home?: number | null;
    away?: number | null;
  };
  [key: string]: any;
}

let sportApiAiRateLimitUntil = 0;

export function isSportApiAiRateLimited(): boolean {
  return Date.now() < sportApiAiRateLimitUntil;
}

export function setSportApiAiRateLimit(resetInSeconds = 3600): void {
  const duration = Math.max(60, Number(resetInSeconds) || 3600);
  sportApiAiRateLimitUntil = Date.now() + duration * 1000;
}

export function hasSportApiAiKey(): boolean {
  return Boolean((process.env.SPORTAPI_AI_KEY || process.env.SPORTAPI_API_KEY)?.trim());
}

export function sportApiAiConfigured(): boolean {
  return hasSportApiAiKey() && !isSportApiAiRateLimited();
}

function getBaseUrl(): string {
  return (process.env.SPORTAPI_AI_BASE_URL || 'https://sportapi.ai/api').replace(/\/+$/, '');
}

/**
 * Fetch all fixtures across covered leagues for a given calendar date (YYYY-MM-DD).
 */
export async function fetchSportApiAiFixturesByDate(dateStr: string): Promise<any[]> {
  if (!hasSportApiAiKey()) {
    throw new Error('SPORTAPI_AI_KEY is not configured in environment variables.');
  }
  if (isSportApiAiRateLimited()) {
    return [];
  }

  const key = (process.env.SPORTAPI_AI_KEY || process.env.SPORTAPI_API_KEY)!.trim();
  const url = `${getBaseUrl()}/fixtures/date/${encodeURIComponent(dateStr)}`;

  const res = await fetch(url, {
    headers: {
      'X-Api-Key': key,
      'Authorization': `Bearer ${key}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    if (res.status === 429 || errorText.includes('Daily request limit reached')) {
      const match = errorText.match(/"reset_in"\s*:\s*(\d+)/);
      const resetIn = match ? parseInt(match[1], 10) : 3600;
      setSportApiAiRateLimit(resetIn);
      console.info(`[SportAPI.ai] Daily request limit reached (HTTP 429); falling back to secondary providers (${resetIn}s reset window).`);
      return [];
    }
    throw new Error(`SportAPI.ai HTTP ${res.status}: ${errorText.slice(0, 300)}`);
  }

  const rawText = await res.text();
  let data: any;

  // Preserve complete JSON documents, including top-level arrays.
  try {
    data = JSON.parse(rawText.trim());
  } catch {
    // Fallback for gateways that prepend text to an object response.
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd < jsonStart) {
      throw new Error(`SportAPI.ai invalid response format: ${rawText.slice(0, 200)}`);
    }
    try {
      data = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
    } catch {
      throw new Error(`SportAPI.ai invalid JSON response: ${rawText.slice(0, 200)}`);
    }
  }

  const fixturesArray: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.fixtures)
    ? data.fixtures
    : [];

  return fixturesArray;
}

/**
 * Checks whether a fixture has reached final time / settlement status.
 */
export function isSportApiAiFixtureFinished(f: any): boolean {
  if (!f || typeof f !== 'object') return false;

  const statusValues = [
    f.status,
    f.state,
    f.status_short,
    f.status?.short,
    f.status?.name,
    f.state?.short,
    f.state?.name,
    f.fixture?.status?.short,
    f.fixture?.status?.name,
  ];

  const finishedStatuses = new Set([
    'FINISHED', 'FT', 'AET', 'PEN', 'PENS', 'ENDED', 'FINAL', 'COMPLETED',
    'FULL TIME', 'MATCH FINISHED',
  ]);

  // Never infer completion from score fields alone: some feeds publish
  // provisional scores before the match has finished.
  return statusValues.some((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    return finishedStatuses.has(normalized);
  });
}

/** Confirm exact provider ID and exact normalized home/away identity. */
export function isSportApiAiFixtureIdentityMatch(
  candidate: any,
  fixtureId: number | string,
  homeTeam: string,
  awayTeam: string,
): boolean {
  if (!candidate || String(candidate.id) !== String(fixtureId)) return false;
  const candidateHome = candidate.home_team?.name || candidate.homeTeam?.name || candidate.home_team || candidate.homeTeam;
  const candidateAway = candidate.away_team?.name || candidate.awayTeam?.name || candidate.away_team || candidate.awayTeam;
  const normalize = (name: unknown) => typeof name === 'string' ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const expectedHome = normalize(homeTeam);
  const expectedAway = normalize(awayTeam);
  return Boolean(expectedHome && expectedAway) &&
    normalize(candidateHome) === expectedHome && normalize(candidateAway) === expectedAway;
}

/**
 * Extracts scores and decisive outcome from a SportAPI.ai fixture record.
 */
export function getSportApiAiScores(f: any): { home: number | null; away: number | null; outcome: 'home' | 'draw' | 'away' | null } {
  if (!f || typeof f !== 'object') {
    return { home: null, away: null, outcome: null };
  }

  let home: number | null = null;
  let away: number | null = null;

  const pairs = [
    [f.home_score, f.away_score],
    [f.score?.home, f.score?.away],
    [f.home_team?.score, f.away_team?.score],
    [f.homeScore, f.awayScore],
    [f.goals?.home, f.goals?.away],
    [f.score?.fulltime?.home, f.score?.fulltime?.away],
    [f.score?.fullTime?.home, f.score?.fullTime?.away],
  ];

  for (const [homeValue, awayValue] of pairs) {
    if (
      homeValue === null || homeValue === undefined || homeValue === '' ||
      awayValue === null || awayValue === undefined || awayValue === ''
    ) continue;

    const parsedHome = normalizeFootballScore(homeValue);
    const parsedAway = normalizeFootballScore(awayValue);
    if (parsedHome !== null && parsedAway !== null) {
      home = parsedHome;
      away = parsedAway;
      break;
    }
  }

  if (home === null || away === null) {
    const scores = f.scores?.data ?? f.scores;
    if (Array.isArray(scores)) {
      const current = scores.filter(
        (entry: any) => String(entry?.description || '').toUpperCase() === 'CURRENT'
      );
      const rows = current.length ? current : scores;

      for (const entry of rows) {
        const score = entry?.score ?? entry;
        const side = String(
          score?.participant ?? entry?.participant ?? ''
        ).toLowerCase();
        const value = score?.goals ?? score?.value ?? entry?.goals;
        if (value === null || value === undefined || value === '') continue;

        const parsed = normalizeFootballScore(value);
        if (parsed === null) continue;

        if (side === 'home' || side === '1') home = parsed;
        if (side === 'away' || side === '2') away = parsed;
      }
    }
  }

  if (home === null || away === null) {
    return { home: null, away: null, outcome: null };
  }
  const outcome: 'home' | 'draw' | 'away' =
    home > away ? 'home' : away > home ? 'away' : 'draw';

  return { home, away, outcome };
}

export async function sportApiAiGet(path: string): Promise<any> {
  if (!hasSportApiAiKey()) {
    throw new Error('SPORTAPI_AI_KEY is not configured in environment variables.');
  }
  if (isSportApiAiRateLimited()) {
    return null;
  }
  const key = (process.env.SPORTAPI_AI_KEY || process.env.SPORTAPI_API_KEY)!.trim();
  const url = `${getBaseUrl()}/${path.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    headers: {
      'X-Api-Key': key,
      'Authorization': `Bearer ${key}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    if (res.status === 429 || errorText.includes('Daily request limit reached')) {
      const match = errorText.match(/"reset_in"\s*:\s*(\d+)/);
      const resetIn = match ? parseInt(match[1], 10) : 3600;
      setSportApiAiRateLimit(resetIn);
      console.info(`[SportAPI.ai] Daily request limit reached (HTTP 429); path ${path} returned null (${resetIn}s reset window).`);
      return null;
    }
    throw new Error(`SportAPI.ai HTTP ${res.status}: ${errorText.slice(0, 300)}`);
  }
  return res.json();
}

export async function fetchSportApiAiTeam(teamId: number | string): Promise<any> {
  const body = await sportApiAiGet(`teams/${encodeURIComponent(String(teamId))}`);
  // Keep the envelope because providers may place recent matches alongside the
  // nested team object. The enrichment parser handles both shapes.
  return body;
}

export async function fetchSportApiAiStandings(leagueId: number | string): Promise<any[]> {
  const body = await sportApiAiGet(`standings/${encodeURIComponent(String(leagueId))}`);
  const standings = body?.data?.standings ?? body?.standings ?? body?.data;
  return Array.isArray(standings) ? standings : [];
}

export async function fetchSportApiAiFixtureStats(fixtureId: number | string): Promise<any> {
  const body = await sportApiAiGet(`fixtures/${encodeURIComponent(String(fixtureId))}/stats`);
  return body?.data ?? body;
}

/** Fetch one provider fixture directly when the date index does not return it. */
export async function fetchSportApiAiFixtureById(fixtureId: number | string): Promise<any | null> {
  const body = await sportApiAiGet(`fixtures/${encodeURIComponent(String(fixtureId))}`);
  return body?.fixture ?? body?.data ?? null;
}

export async function fetchSportApiAiHeadToHead(team1Id: number | string, team2Id: number | string): Promise<any> {
  const body = await sportApiAiGet(
    `fixtures/h2h/${encodeURIComponent(String(team1Id))}/${encodeURIComponent(String(team2Id))}`
  );
  return body;
}
