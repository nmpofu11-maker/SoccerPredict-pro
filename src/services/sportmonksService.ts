/**
 * Sportmonks API Service
 * 
 * Fetches and normalizes fixtures from the Sportmonks Football API v3.
 */

import type { ApiFootballFixture } from './serverApiFootball';

const BASE_URL = 'https://api.sportmonks.com/v3/football/fixtures/date';

function getApiKey(): string {
  if (!process.env.SPORTMONKS_API_KEY) {
    throw new Error('SPORTMONKS_API_KEY is not configured');
  }
  return process.env.SPORTMONKS_API_KEY;
}

interface SportmonksFixture {
  id: number;
  starting_at: string;
  state: { state: string };
  participants: {
    name: string;
    id: number;
    meta: { location: 'home' | 'away' };
  }[];
  scores: {
    score: { total: number };
    description: 'current' | 'ft' | 'ht';
  }[];
  league_id: number;
  venue_id: number | null;
}

interface SportmonksResponse {
  data: SportmonksFixture[] | undefined;
  pagination?: {
    total?: number;
    count?: number;
    per_page?: number;
    current_page?: number;
    total_pages?: number;
  };
}

/**
 * Fetches all fixtures for a specific date with pagination support.
 */
export async function fetchDailyFixtures(dateStr: string): Promise<SportmonksFixture[]> {
  const apiKey = getApiKey();
  let allFixtures: SportmonksFixture[] = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const url = `${BASE_URL}/${dateStr}?api_token=${apiKey}&page=${currentPage}&include=participants;scores;venue`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Sportmonks request failed (${res.status}): ${errorText.slice(0, 200)}`);
    }

    const json: SportmonksResponse = await res.json();
    
    if (json.data && Array.isArray(json.data)) {
        allFixtures.push(...json.data);
    } else {
        console.warn(`[Sportmonks] Missing or invalid data in response for page ${currentPage}`);
    }
    
    if (json.pagination && typeof json.pagination.total_pages === 'number') {
        totalPages = json.pagination.total_pages;
    } else {
        totalPages = 1; // Default to one page if no pagination data
    }
    currentPage++;
  } while (currentPage <= totalPages);

  return allFixtures;
}

/**
 * Normalizes a Sportmonks fixture to the internal ApiFootballFixture structure.
 */
export function mapSportmonksToInternal(f: SportmonksFixture): ApiFootballFixture & { __source: 'sportmonks' } {
  const home = f.participants.find(p => p.meta.location === 'home');
  const away = f.participants.find(p => p.meta.location === 'away');
  const ftScore = f.scores.find(s => s.description === 'ft');
  
  return {
    __source: 'sportmonks',
    fixture: {
      id: f.id,
      date: f.starting_at,
      status: { short: f.state.state, long: f.state.state, elapsed: null },
      venue: { name: null }, 
    },
    league: {
      id: f.league_id,
      name: 'Unknown League',
      country: '',
      round: '',
    },
    teams: {
      home: { id: home?.id || 0, name: home?.name || 'Unknown', winner: null },
      away: { id: away?.id || 0, name: away?.name || 'Unknown', winner: null },
    },
    goals: {
      home: ftScore ? null : null, // Simplification pending full schema mapping
      away: ftScore ? null : null,
    },
  };
}
