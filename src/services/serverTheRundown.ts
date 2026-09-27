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

// Major soccer sport IDs tracked by TheRundown
export const THE_RUNDOWN_SOCCER_SPORTS = [
  { id: 11, name: 'EPL', country: 'England' },
  { id: 17, name: 'La Liga', country: 'Spain' },
  { id: 16, name: 'Serie A', country: 'Italy' },
  { id: 18, name: 'Bundesliga', country: 'Germany' },
  { id: 19, name: 'Ligue 1', country: 'France' },
  { id: 10, name: 'MLS', country: 'USA' },
  { id: 12, name: 'UEFA Champions League', country: 'Europe' },
  { id: 13, name: 'UEFA Europa League', country: 'Europe' },
];

export function theRundownConfigured(): boolean {
  return Boolean(process.env.THERUNDOWN_KEY && process.env.THERUNDOWN_KEY.trim().length > 0);
}

function getBaseUrl(): string {
  return (process.env.THERUNDOWN_BASE_URL || 'https://therundown.io/api/v2').replace(/\/+$/, '');
}

/**
 * Fetch events for a given sport ID and calendar date (YYYY-MM-DD).
 */
export async function fetchTheRundownSportEvents(sportId: number, dateStr: string): Promise<TheRundownEvent[]> {
  if (!theRundownConfigured()) {
    throw new Error('THERUNDOWN_KEY is not configured in environment variables.');
  }

  const key = process.env.THERUNDOWN_KEY!.trim();
  const url = `${getBaseUrl()}/sports/${sportId}/events/${encodeURIComponent(dateStr)}?include=scores+all_periods`;

  const res = await fetch(url, {
    headers: {
      'X-TheRundown-Key': key,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`TheRundown HTTP ${res.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await res.json();
  return Array.isArray(data.events) ? data.events : [];
}

/**
 * Fetch all soccer fixtures across all covered soccer sport IDs for a given date.
 */
export async function fetchAllTheRundownSoccerEvents(dateStr: string): Promise<Array<TheRundownEvent & { leagueName: string; country: string }>> {
  if (!theRundownConfigured()) return [];

  const results: Array<TheRundownEvent & { leagueName: string; country: string }> = [];

  // Query each covered sport ID with error insulation per league
  for (const sport of THE_RUNDOWN_SOCCER_SPORTS) {
    try {
      const events = await fetchTheRundownSportEvents(sport.id, dateStr);
      for (const ev of events) {
        results.push({
          ...ev,
          leagueName: sport.name,
          country: sport.country,
        });
      }
    } catch (err) {
      console.warn(`[TheRundown] Failed fetching events for sport ${sport.name} (${sport.id}):`, err);
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
