/**
 * Bzzoiro Sports Data (BSD) API Client (https://sports.bzzoiro.com/docs/football/)
 *
 * Provides football results, live scores, league standings, team form,
 * xG shotmaps, multi-bookmaker odds, and Dixon-Coles statistical predictions.
 *
 * Auth: Header `Authorization: Token <BSD_API_KEY>`
 * Rate Limit: 10 requests/second per IP with burst.
 */

function getApiKey(): string {
  return (
    process.env.BSD_API_KEY?.trim() ||
    process.env.BZZOIRO_API_KEY?.trim() ||
    process.env.BZZOIRO_KEY?.trim() ||
    ''
  );
}

function getBaseUrl(): string {
  return (
    process.env.BSD_BASE_URL?.trim() ||
    'https://sports.bzzoiro.com/api/v2'
  ).replace(/\/+$/, '');
}

export function bsdConfigured(): boolean {
  return getApiKey().length > 0;
}

export interface BsdSportCoverage {
  sport: string;
  name: string;
  status: string;
  events_next_7d: number;
  events_next_30d: number;
  events_last_7d: number;
  priced_next_7d: number;
  live_now: number;
  next_event_at: string | null;
  last_event_at: string | null;
  docs_url?: string;
}

export interface BsdCoverage {
  generated_at: string;
  sports: BsdSportCoverage[];
}

export interface BsdEvent {
  id: number;
  date: string;
  kickoff_time?: string;
  utc_date?: string;
  status?: string;
  league: {
    id: number;
    name: string;
    country?: string;
    season?: string;
  };
  home_team: {
    id: number;
    name: string;
    short_name?: string;
  };
  away_team: {
    id: number;
    name: string;
    short_name?: string;
  };
  score?: {
    home?: number | null;
    away?: number | null;
    ht_home?: number | null;
    ht_away?: number | null;
  };
  venue?: {
    id?: number;
    name?: string;
    city?: string;
    capacity?: number;
  };
  [key: string]: any;
}

export interface BsdShot {
  id: number;
  minute: number;
  team_id: number;
  player_name?: string;
  xg: number;
  x: number;
  y: number;
  outcome: string;
  situation: string;
  body_part: string;
}

export interface BsdStats {
  match_id: number;
  possession?: {
    home: number;
    away: number;
  };
  shots_total?: {
    home: number;
    away: number;
  };
  shots_on_target?: {
    home: number;
    away: number;
  };
  xg?: {
    home: number;
    away: number;
  };
  corners?: {
    home: number;
    away: number;
  };
  cards_yellow?: {
    home: number;
    away: number;
  };
  cards_red?: {
    home: number;
    away: number;
  };
  passes_total?: {
    home: number;
    away: number;
  };
  pass_accuracy?: {
    home: number;
    away: number;
  };
  shots?: BsdShot[];
  [key: string]: any;
}

export interface BsdPlayer {
  id: number;
  name: string;
  shirt_number?: number;
  position?: string;
  rating?: number;
  xg?: number;
  xa?: number;
}

export interface BsdLineup {
  confirmed: boolean;
  home: {
    formation?: string;
    starting_xi: BsdPlayer[];
    bench: BsdPlayer[];
  };
  away: {
    formation?: string;
    starting_xi: BsdPlayer[];
    bench: BsdPlayer[];
  };
}

export interface BsdPrediction {
  event_id: number;
  model: string; // 'dixon-coles-analytic-blend'
  markets: {
    full_time_result?: {
      home: number;
      draw: number;
      away: number;
    };
    over_under_25?: {
      over: number;
      under: number;
    };
    btts?: {
      yes: number;
      no: number;
    };
  };
  expected_goals?: {
    home: number;
    away: number;
    total: number;
  };
  [key: string]: any;
}

export interface BsdStandingsEntry {
  rank: number;
  team_id: number;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  form?: string;
}

export interface BsdStandings {
  league_id: number;
  season: string;
  entries: BsdStandingsEntry[];
}

export interface BsdTeamForm {
  team_id: number;
  matches_count: number;
  ppg: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored_avg: number;
  goals_conceded_avg: number;
  xg_for_avg?: number;
  xg_against_avg?: number;
  form_sequence: ('W' | 'D' | 'L')[];
  last_matches?: any[];
}

/**
 * Generic BSD API Request Helper with token auth, rate-limit awareness and error handling.
 */
async function bsdFetch<T>(endpoint: string, options: { authRequired?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const { authRequired = true, timeoutMs = 8000 } = options;
  const apiKey = getApiKey();
  if (authRequired && !apiKey) {
    throw new Error('BSD_API_KEY is not configured');
  }

  const baseUrl = getBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'SoccerPredict-Pro/1.0',
  };

  if (apiKey) {
    headers['Authorization'] = `Token ${apiKey}`;
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');

  if (!res.ok) {
    const errorDetail =
      typeof body === 'object' && body !== null && 'detail' in body
        ? (body as any).detail
        : typeof body === 'object' && body !== null && 'message' in body
        ? (body as any).message
        : `HTTP ${res.status}`;
    throw new Error(`BSD API error ${res.status}: ${errorDetail}`);
  }

  return body as T;
}

/**
 * Check real-time seasonal data coverage without requiring an API key.
 */
export async function fetchBsdCoverage(): Promise<BsdCoverage> {
  return bsdFetch<BsdCoverage>('/coverage/', { authRequired: false, timeoutMs: 5000 });
}

/**
 * Fetch matches/fixtures for a specified calendar date (YYYY-MM-DD).
 */
export async function fetchBsdEventsByDate(date: string): Promise<BsdEvent[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('BSD date must be YYYY-MM-DD');
  }

  const body = await bsdFetch<any>(`/events/?date=${encodeURIComponent(date)}`);
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.events)) return body.events;
  return [];
}

/**
 * Fetch detailed match metadata for a specific BSD event ID.
 */
export async function fetchBsdEventDetail(eventId: string | number): Promise<BsdEvent | null> {
  if (!eventId) return null;
  return bsdFetch<BsdEvent>(`/events/${encodeURIComponent(eventId)}/`);
}

/**
 * Check which sub-resources exist for an event in one call.
 */
export async function fetchBsdEventAvailability(eventId: string | number): Promise<Record<string, boolean>> {
  if (!eventId) return {};
  try {
    const body = await bsdFetch<any>(`/events/${encodeURIComponent(eventId)}/availability/`);
    return typeof body === 'object' && body !== null ? body : {};
  } catch {
    return {};
  }
}

/**
 * Fetch match statistics and shot-level xG for a specific BSD event ID.
 */
export async function fetchBsdEventStats(eventId: string | number): Promise<BsdStats | null> {
  if (!eventId) return null;
  return bsdFetch<BsdStats>(`/events/${encodeURIComponent(eventId)}/stats/`);
}

/**
 * Fetch team lineups (starting XI, bench, formation) for a specific BSD event ID.
 */
export async function fetchBsdEventLineups(eventId: string | number): Promise<BsdLineup | null> {
  if (!eventId) return null;
  return bsdFetch<BsdLineup>(`/events/${encodeURIComponent(eventId)}/lineups/`);
}

/**
 * Fetch statistical Dixon-Coles prediction probabilities for a specific BSD event ID.
 */
export async function fetchBsdEventPrediction(eventId: string | number): Promise<BsdPrediction | null> {
  if (!eventId) return null;
  return bsdFetch<BsdPrediction>(`/events/${encodeURIComponent(eventId)}/prediction/`);
}

/**
 * Fetch standings table for a specific BSD league ID.
 */
export async function fetchBsdLeagueStandings(leagueId: string | number): Promise<BsdStandings | null> {
  if (!leagueId) return null;
  return bsdFetch<BsdStandings>(`/leagues/${encodeURIComponent(leagueId)}/standings/`);
}

/**
 * Fetch averaged team form and metrics for a specific BSD team ID.
 */
export async function fetchBsdTeamForm(teamId: string | number): Promise<BsdTeamForm | null> {
  if (!teamId) return null;
  return bsdFetch<BsdTeamForm>(`/teams/${encodeURIComponent(teamId)}/form/`);
}
