/**
 * Sportmonks API client (Primary Data Provider).
 *
 * Auth: Sportmonks uses an API key via query parameter (api_token).
 */

import type { ApiFootballFixture } from './serverApiFootball';

function getApiKey(): string {
  return process.env.SPORTMONKS_API_KEY || '';
}

interface SportmonksFixture {
  id: number;
  starting_at: string;
  state: {
    state: string; // e.g., 'FT', 'NS'
  };
  participants: {
    name: string;
    id: number;
    meta: {
        location: string; // 'home' | 'away'
    }
  }[];
  scores: {
    score: {
      total: number;
    };
    description: string; // 'current', 'ft'
  }[];
  venue_id: number | null;
  league_id: number;
}

async function sportmonksFetch<T = any>(pathAndQuery: string): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('SPORTMONKS_API_KEY not configured');
  
  // Basic structure for Sportmonks v3
  const baseUrl = `https://api.sportmonks.com/v3/football/fixtures/date`;
  const url = `${baseUrl}/${pathAndQuery}?api_token=${apiKey}&include=participants;scores;venue`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`Sportmonks request failed (${res.status}): ${bodyText.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function fetchSportmonksFixturesByDate(dateStr: string): Promise<SportmonksFixture[]> {
  const json = await sportmonksFetch<{ data: SportmonksFixture[] }>(dateStr);
  return json.data || [];
}

export function normalizeSportmonksFixture(f: SportmonksFixture): ApiFootballFixture & { __source: 'sportmonks' } {
  const home = f.participants.find(p => p.meta.location === 'home');
  const away = f.participants.find(p => p.meta.location === 'away');
  
  const ftScore = f.scores.find(s => s.description === 'ft');
  
  return {
    __source: 'sportmonks',
    fixture: {
      id: f.id,
      date: f.starting_at,
      status: {
        short: f.state.state,
        long: f.state.state,
        elapsed: null,
      },
      venue: { name: null }, // Venue lookup needs extra inclusion or mapping
    },
    league: {
      id: f.league_id,
      name: 'Unknown League',
      country: '',
      round: '',
    },
    teams: {
      home: { id: home?.id || 0, name: home?.name || 'Unknown Home', winner: null },
      away: { id: away?.id || 0, name: away?.name || 'Unknown Away', winner: null },
    },
    goals: {
      home: ftScore ? null : null, // This needs smarter score parsing based on Sportmonks structure
      away: ftScore ? null : null,
    },
  };
}

export async function fetchNormalizedSportmonksFixturesByDate(dateStr: string) {
  const fixtures = await fetchSportmonksFixturesByDate(dateStr);
  return fixtures.map(normalizeSportmonksFixture);
}
