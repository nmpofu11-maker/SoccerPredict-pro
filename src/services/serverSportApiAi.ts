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
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`SportAPI.ai invalid response format: ${rawText.slice(0, 200)}`);
  }

  const data = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
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
 * Checks whether a fixture has an explicit completed status.
 * Scores alone are not evidence of completion: scheduled feeds can expose
 * provisional 0-0 scores, and live scores must never trigger settlement.
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
    'FINISHED', 'FT', 'AET', 'PEN', 'ENDED', 'FINAL', 'COMPLETED',
    'FULL TIME', 'MATCH FINISHED',
  ]);

  return statusValues.some((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    return finishedStatuses.has(normalized);
  });
}

/**
 * Extracts scores and decisive outcome from a SportAPI.ai fixture record.
 */
export function getSportApiAiScores(f: any): { home: number | null; away: number | null; outcome: 'home' | 'draw' | 'away' | null } {
  let home: number | null = null;
  let away: number | null = null;

  if (typeof f.home_score === 'number' && typeof f.away_score === 'number') {
    home = f.home_score;
    away = f.away_score;
  } else if (f.score && typeof f.score.home === 'number' && typeof f.score.away === 'number') {
    home = f.score.home;
    away = f.score.away;
  } else if (f.home_team && typeof f.home_team.score === 'number' && f.away_team && typeof f.away_team.score === 'number') {
    home = f.home_team.score;
    away = f.away_team.score;
  } else if (typeof f.homeScore === 'number' && typeof f.awayScore === 'number') {
    home = f.homeScore;
    away = f.awayScore;
  }

  if (home === null || away === null) {
    return { home: null, away: null, outcome: null };
  }

  const outcome: 'home' | 'draw' | 'away' = home > away ? 'home' : away > home ? 'away' : 'draw';
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

export async function fetchSportApiAiHeadToHead(team1Id: number | string, team2Id: number | string): Promise<any> {
  const body = await sportApiAiGet(
    `fixtures/h2h/${encodeURIComponent(String(team1Id))}/${encodeURIComponent(String(team2Id))}`
  );
  return body;
}
