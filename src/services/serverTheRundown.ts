/**
 * TheRundown.io client (Secondary Provider & Betting Odds Feed).
 *
 * Provides real-time and closing lines, consensus odds, schedules, and scores
 * for premier soccer leagues (EPL, La Liga, Serie A, Bundesliga, Ligue 1, MLS, UCL).
 *
 * Base URL: https://therundown.io/api/v2
 * Auth: X-TheRundown-Key: <THERUNDOWN_KEY>
 * Daily Endpoint: GET /api/v2/sports/{sportId}/events/{YYYY-MM-DD}?include=scores+all_periods
 */

export interface TheRundownEvent {
  event_id: string;
  sport_id: number;
  event_date: string;
  teams_normalized?: Array<{
    team_id: number;
    name: string;
    is_home: boolean;
    is_away: boolean;
  }>;
  teams?: Array<{
    team_id: number;
    name: string;
    is_home: boolean;
    is_away: boolean;
  }>;
  score?: {
    event_status: string; // 'STATUS_FINAL', 'STATUS_SCHEDULED', 'STATUS_IN_PROGRESS', 'STATUS_POSTPONED'
    score_home: number | null;
    score_away: number | null;
    winner_home?: number;
    winner_away?: number;
  };
  lines?: Record<string, any>;
  [key: string]: any;
}

// Major soccer sport IDs tracked by TheRundown.
// These are verified directly against TheRundown's own live, no-auth reference
// endpoint (GET https://therundown.io/api/v2/sports), not guessed or copied from
// a stale doc example — the previous hardcoded list here had 6 of 8 IDs wrong,
// which would have silently fetched the wrong competition under the wrong label
// (e.g. id 16 was labeled "Serie A" but is actually UEFA Champions League).
// Swapped the two rarely-active international tournaments (Euro Championship,
// World Cup — only relevant every few years) for two regularly-active club
// competitions TheRundown actually covers, since this is a daily fixture feed.
const SOCCER_LEAGUE_NAMES = new Set([
  'EPL',
  'La Liga',
  'Bundesliga',
  'Serie A',
  'Ligue 1',
  'MLS',
  'UEFA Champions League',
  'UEFA Europa League',
  'UEFA Conference League',
  'Liga MX',
]);

let rundownSportsCache: Array<{ id: number; name: string; country: string }> | null = null;
let rundownSportsCacheAt = 0;
const RUNDOWN_SPORTS_CACHE_MS = 6 * 60 * 60 * 1000;

async function getRundownSoccerSports(): Promise<Array<{ id: number; name: string; country: string }>> {
  if (rundownSportsCache && Date.now() - rundownSportsCacheAt < RUNDOWN_SPORTS_CACHE_MS) {
    return rundownSportsCache;
  }

  const key = (process.env.THERUNDOWN_API_KEY || process.env.THERUNDOWN_KEY)?.trim();
  if (!key) return [];

  const res = await fetch(`${getBaseUrl()}/sports`, {
    headers: { 'X-TheRundown-Key': key, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`TheRundown sports catalog HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const sports = Array.isArray(data) ? data : Array.isArray(data.sports) ? data.sports : [];
  const selected = sports
    .filter((s: any) => {
      const name = String(s.name || s.display_name || s.league_name || '').trim();
      return SOCCER_LEAGUE_NAMES.has(name);
    })
    .map((s: any) => ({
      id: Number(s.id ?? s.sport_id),
      name: String(s.name || s.display_name || s.league_name),
      country: String(s.country || s.region || 'International'),
    }))
    .filter((s: any) => Number.isInteger(s.id) && s.id > 0);

  if (selected.length === 0) {
    throw new Error('TheRundown sports catalog returned no recognized soccer leagues.');
  }

  rundownSportsCache = selected;
  rundownSportsCacheAt = Date.now();
  return selected;
}

export function theRundownConfigured(): boolean {
  return Boolean((process.env.THERUNDOWN_API_KEY || process.env.THERUNDOWN_KEY)?.trim());
}

function getBaseUrl(): string {
  return (process.env.THERUNDOWN_BASE_URL || 'https://therundown.io/api/v2').replace(/\/+$/, '');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Milliseconds between TheRundown requests (plan limit: 1 request/second). */
function requestSpacingMs(): number {
  const raw = Number(process.env.THERUNDOWN_REQUEST_SPACING_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1100;
}

/** Thrown when TheRundown answers HTTP 429 after a retry. Detected by type, not by message text. */
export class TheRundownRateLimitError extends Error {
  constructor(detail: string) {
    super(`TheRundown rate limited (HTTP 429): ${detail}`);
    this.name = 'TheRundownRateLimitError';
  }
}

/**
 * Fetch events for a given sport ID and calendar date (YYYY-MM-DD).
 */
export async function fetchTheRundownSportEvents(sportId: number, dateStr: string): Promise<TheRundownEvent[]> {
  if (!theRundownConfigured()) {
    throw new Error('THERUNDOWN_KEY is not configured in environment variables.');
  }

  const key = (process.env.THERUNDOWN_API_KEY || process.env.THERUNDOWN_KEY)!.trim();
  const url = `${getBaseUrl()}/sports/${sportId}/events/${encodeURIComponent(dateStr)}?include=scores+all_periods`;

  // Up to 2 attempts with exponential backoff if 429 is encountered
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: {
        'X-TheRundown-Key': key,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 429) {
      if (attempt === 0) {
        // Wait 1.1s before retrying to respect the 1 req/sec rate limit
        await delay(requestSpacingMs());
        continue;
      }
      // Fail gracefully without flooding error boundaries
      const errorText = await res.text().catch(() => '');
      throw new TheRundownRateLimitError(errorText.slice(0, 100));
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`TheRundown HTTP ${res.status}: ${errorText.slice(0, 300)}`);
    }

    const data = await res.json();
    return Array.isArray(data.events) ? data.events : [];
  }

  return [];
}

/**
 * Fetch all soccer fixtures across all covered soccer sport IDs for a given date.
 */
export async function fetchAllTheRundownSoccerEvents(dateStr: string): Promise<Array<TheRundownEvent & { leagueName: string; country: string }>> {
  if (!theRundownConfigured()) return [];

  const results: Array<TheRundownEvent & { leagueName: string; country: string }> = [];
  const sports = await getRundownSoccerSports();

  // Query each live-discovered soccer sport with 1.1s spacing to respect the provider rate limit.
  for (let i = 0; i < sports.length; i++) {
    const sport = sports[i];
    try {
      if (i > 0) {
        await delay(requestSpacingMs());
      }
      const events = await fetchTheRundownSportEvents(sport.id, dateStr);
      for (const ev of events) {
        results.push({
          ...ev,
          leagueName: sport.name,
          country: sport.country,
        });
      }
    } catch (err: unknown) {
      if (err instanceof TheRundownRateLimitError) {
        // Plan limit exhausted: stop this batch, but say so, because the remaining leagues are skipped.
        const skipped = sports.length - i;
        console.warn(
          `[TheRundown] Rate limit reached at ${sport.name}; skipping ${skipped} league(s) for ${dateStr}. ` +
          `Returning ${results.length} event(s) fetched so far.`
        );
        break;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[TheRundown] Failed fetching events for sport ${sport.name} (${sport.id}):`, errMsg);
    }
  }

  return results;
}

export function isTheRundownEventFinished(ev: TheRundownEvent): boolean {
  if (!ev || !ev.score) return false;
  const status = (ev.score.event_status || '').toUpperCase();
  return status === 'STATUS_FINAL' || status === 'FINAL' || status === 'STATUS_FINAL_PEN';
}

export function getTheRundownScores(ev: TheRundownEvent): { home: number | null; away: number | null; outcome: 'home' | 'draw' | 'away' | null } {
  if (!ev || !ev.score) return { home: null, away: null, outcome: null };

  const home = typeof ev.score.score_home === 'number' ? ev.score.score_home : null;
  const away = typeof ev.score.score_away === 'number' ? ev.score.score_away : null;

  if (home === null || away === null) {
    return { home: null, away: null, outcome: null };
  }

  const outcome: 'home' | 'draw' | 'away' = home > away ? 'home' : away > home ? 'away' : 'draw';
  return { home, away, outcome };
}
