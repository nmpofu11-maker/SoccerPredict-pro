/**
 * SportDB.dev API Client (https://dashboard.sportdb.dev / https://api.sportdb.dev)
 *
 * Provides fixture schedules, live soccer scores, and match statistics.
 * Auth: Header `X-API-KEY: <SPORTDB_API_KEY>` or `Authorization: Bearer <SPORTDB_API_KEY>`
 */

function getApiKey(): string {
  return (
    process.env.SPORTDB_API_KEY?.trim() ||
    process.env.SPORTDB_KEY?.trim() ||
    process.env.SPORT_DB_KEY?.trim() ||
    ''
  );
}

function getBaseUrl(): string {
  return (
    process.env.SPORTDB_BASE_URL?.trim() ||
    'https://api.sportdb.dev'
  ).replace(/\/+$/, '');
}

export function sportDbConfigured(): boolean {
  return getApiKey().length > 0;
}

export interface SportDbMatch {
  id: string | number;
  match_id?: string | number;
  date?: string;
  kickoff_time?: string;
  utc_date?: string;
  status?: string;
  league?: {
    id?: string | number;
    name?: string;
    country?: string;
  } | string;
  home_team?: {
    id?: string | number;
    name?: string;
    score?: number | null;
  } | string;
  away_team?: {
    id?: string | number;
    name?: string;
    score?: number | null;
  } | string;
  score?: {
    home?: number | null;
    away?: number | null;
    fulltime?: {
      home?: number | null;
      away?: number | null;
    };
  };
  score_home?: number | null;
  score_away?: number | null;
  venue?: {
    name?: string;
  } | string;
  [key: string]: any;
}

/**
 * Fetch matches/fixtures for a specified calendar date (YYYY-MM-DD).
 */
export async function fetchSportDbFixturesByDate(date: string): Promise<SportDbMatch[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('SPORTDB_API_KEY is not configured');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('SportDB date must be YYYY-MM-DD');

  const baseUrl = getBaseUrl();
  // Standard SportDB REST endpoint patterns with fallback paths
  const endpoints = [
    `${baseUrl}/v1/matches?date=${encodeURIComponent(date)}`,
    `${baseUrl}/v1/fixtures/date/${encodeURIComponent(date)}`,
    `${baseUrl}/v1/date/${encodeURIComponent(date)}`,
  ];

  let lastError: Error | null = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'X-API-KEY': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404 && url !== endpoints[endpoints.length - 1]) {
        // Try the next endpoint variant
        continue;
      }

      const body = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const message =
          typeof body?.message === 'string'
            ? body.message
            : typeof body?.error?.message === 'string'
            ? body.error.message
            : `HTTP ${res.status}`;
        throw new Error(`SportDB ${res.status}: ${message}`);
      }

      // Check standard response shapes
      if (Array.isArray(body)) return body;
      if (Array.isArray(body?.data)) return body.data;
      if (Array.isArray(body?.matches)) return body.matches;
      if (Array.isArray(body?.fixtures)) return body.fixtures;
      if (Array.isArray(body?.data?.matches)) return body.data.matches;
      if (Array.isArray(body?.data?.fixtures)) return body.data.fixtures;

      return [];
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // If network/auth failure rather than 404 endpoint mismatch, stop and throw
      if (lastError.message.includes('401') || lastError.message.includes('403')) {
        throw lastError;
      }
    }
  }

  if (lastError) throw lastError;
  return [];
}
