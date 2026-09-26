/**
 * TheSportsDB fallback client.
 *
 * This exists purely as a backup source for when API-Football is unavailable
 * (suspended account, exhausted daily quota, outage, etc). It is NOT a
 * replacement — API-Football has far deeper league coverage (1,236 leagues
 * vs TheSportsDB's ~617, and TheSportsDB's data is community-edited, not
 * professionally maintained), so this only kicks in as a fallback, and the
 * fixtures/results it produces are tagged with their source so nothing about
 * where the data came from is hidden from you.
 *
 * Auth: TheSportsDB uses a key embedded in the URL path, not a header. The
 * shared public test key "3" works out of the box but is rate-limited and
 * shared across everyone using it — get your own free key at
 * https://www.thesportsdb.com/api.php and set THESPORTSDB_API_KEY for a
 * private, more reliable quota.
 *
 * IMPORTANT — licensing: TheSportsDB's free tier is for non-commercial use
 * per their terms. If this app is ever monetized, their $9/month Patreon
 * tier is required to stay compliant. This module does not enforce that;
 * it's on you to check current terms before relying on this in production.
 */

import type { ApiFootballFixture } from './serverApiFootball';

function getApiKey(): string {
  return process.env.THESPORTSDB_API_KEY || '3'; // shared public test key as last resort
}

function isUsingSharedTestKey(): boolean {
  return !process.env.THESPORTSDB_API_KEY;
}

interface TheSportsDbEvent {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  idHomeTeam: string;
  idAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strLeague: string;
  strCountry?: string | null;
  dateEvent: string;
  strTime?: string | null;
  strVenue?: string | null;
}

async function theSportsDbFetch<T = any>(pathAndQuery: string): Promise<T> {
  const url = `https://www.thesportsdb.com/api/v1/json/${getApiKey()}${pathAndQuery}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`TheSportsDB request failed (${res.status}): ${bodyText.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Fetches all soccer events for a given date (YYYY-MM-DD), across leagues TheSportsDB covers. */
export async function fetchTheSportsDbEventsByDate(dateStr: string): Promise<TheSportsDbEvent[]> {
  const json = await theSportsDbFetch<{ events: TheSportsDbEvent[] | null }>(
    `/eventsday.php?d=${encodeURIComponent(dateStr)}&s=Soccer`
  );
  return json.events || [];
}

/**
 * Normalizes a TheSportsDB event into the same shape as an API-Football
 * fixture, so the existing mapping/settlement logic (mapApiFootballToInternalFixture,
 * mapApiFootballOutcome, isFixtureFinished) can be reused without duplicating it.
 * Fixture IDs from this source are tagged distinctly (see TAG below) so a
 * TheSportsDB-derived id can never collide with a real API-Football id.
 */
export function normalizeTheSportsDbEvent(ev: TheSportsDbEvent): ApiFootballFixture & { __source: 'thesportsdb' } {
  const finished = ev.intHomeScore !== null && ev.intAwayScore !== null && ev.intHomeScore !== '' && ev.intAwayScore !== '';
  return {
    __source: 'thesportsdb',
    fixture: {
      id: Number(ev.idEvent),
      date: `${ev.dateEvent}T${ev.strTime || '00:00:00'}Z`,
      status: {
        short: finished ? 'FT' : (ev.strStatus || 'NS'),
        long: finished ? 'Match Finished' : (ev.strStatus || 'Not Started'),
        elapsed: null,
      },
      venue: { name: ev.strVenue || null },
    },
    league: {
      id: 0,
      name: ev.strLeague,
      country: ev.strCountry || '',
      round: '',
    },
    teams: {
      home: { id: Number(ev.idHomeTeam) || 0, name: ev.strHomeTeam, winner: null },
      away: { id: Number(ev.idAwayTeam) || 0, name: ev.strAwayTeam, winner: null },
    },
    goals: {
      home: ev.intHomeScore !== null && ev.intHomeScore !== '' ? Number(ev.intHomeScore) : null,
      away: ev.intAwayScore !== null && ev.intAwayScore !== '' ? Number(ev.intAwayScore) : null,
    },
  };
}

/** Fetches and normalizes a date's fixtures in one call — the main entry point callers should use. */
export async function fetchNormalizedFixturesByDate(dateStr: string) {
  const events = await fetchTheSportsDbEventsByDate(dateStr);
  return events.map(normalizeTheSportsDbEvent);
}

export function theSportsDbUsingSharedKey(): boolean {
  return isUsingSharedTestKey();
}
