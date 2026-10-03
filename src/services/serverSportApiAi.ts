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

export function sportApiAiConfigured(): boolean {
  return Boolean((process.env.SPORTAPI_AI_KEY || process.env.SPORTAPI_API_KEY)?.trim());
}

function getBaseUrl(): string {
  return (process.env.SPORTAPI_AI_BASE_URL || 'https://sportapi.ai/api').replace(/\/+$/, '');
}

/**
 * Fetch all fixtures across covered leagues for a given calendar date (YYYY-MM-DD).
 */
export async function fetchSportApiAiFixturesByDate(dateStr: string): Promise<any[]> {
  if (!sportApiAiConfigured()) {
    throw new Error('SPORTAPI_AI_KEY is not configured in environment variables.');
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
 * Checks whether a fixture has reached final time / settlement status.
 */
export function isSportApiAiFixtureFinished(f: any): boolean {
  if (!f) return false;
  const statusStr = String(f.status || f.state || f.status_short || '').toUpperCase();
  const finishedStatuses = ['FINISHED', 'FT', 'AET', 'PEN', 'ENDED', 'FINAL'];
  if (finishedStatuses.includes(statusStr)) return true;
  if (typeof f.home_score === 'number' && typeof f.away_score === 'number' && statusStr !== 'LIVE' && statusStr !== 'IN PLAY') {
    return true;
  }
  if (f.score && typeof f.score.home === 'number' && typeof f.score.away === 'number' && statusStr !== 'LIVE') {
    return true;
  }
  return false;
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
  if (!sportApiAiConfigured()) {
    throw new Error('SPORTAPI_AI_KEY is not configured in environment variables.');
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
    throw new Error(`SportAPI.ai HTTP ${res.status}: ${errorText.slice(0, 300)}`);
  }
  return res.json();
}

export async function fetchSportApiAiTeam(teamId: number | string): Promise<any> {
  const body = await sportApiAiGet(`teams/${encodeURIComponent(String(teamId))}`);
  return body?.team ?? body;
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
