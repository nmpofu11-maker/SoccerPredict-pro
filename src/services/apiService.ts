import { MatchFixture } from '../types/soccer';
import { saveCustomFixtures } from './storage';

export interface LiveApiResponse {
  status: 'success' | 'error';
  provider: string;
  count: number;
  syncedAt: string;
  isLive: boolean;
  fixtures: MatchFixture[];
}

/**
 * Fetch real live fixtures directly from server API pipeline
 */
export async function fetchLiveFixtures(apiKey?: string): Promise<LiveApiResponse> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch('/api/fixtures/live', {
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.status === 'success' && Array.isArray(data.fixtures) && data.fixtures.length > 0) {
      saveCustomFixtures(data.fixtures);
      return data;
    }
    throw new Error('Invalid response structure from live fixtures endpoint');
  } catch (err: unknown) {
    console.warn('Live API fetch failed, falling back:', err);
    throw err;
  }
}
