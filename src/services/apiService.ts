import { MatchFixture, DataIntegrityAuditReport } from '../types/soccer';
import { saveCustomFixtures } from './storage';

export interface LiveApiResponse {
  status: 'success' | 'error';
  provider: string;
  count: number;
  syncedAt: string;
  isLive?: boolean;
  auditReport?: DataIntegrityAuditReport;
  fixtures: MatchFixture[];
}

export interface IngestSlateResponse {
  status: 'success' | 'error';
  message: string;
  ingestedCount?: number;
  totalCount?: number;
  auditReport?: DataIntegrityAuditReport;
  fixtures: MatchFixture[];
}

export interface DeleteFixtureResponse {
  status: 'success' | 'error';
  message: string;
  deletedId?: string;
  remainingCount?: number;
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
    if (data.status === 'success' && Array.isArray(data.fixtures)) {
      if (data.fixtures.length > 0) {
        saveCustomFixtures(data.fixtures);
      }
      return data;
    }
    throw new Error('Invalid response structure from live fixtures endpoint');
  } catch (err: unknown) {
    console.warn('Live API fetch failed, falling back to persisted disk cache:', err);
    return fetchPersistedFixtures();
  }
}

/**
 * Fetch persisted fixtures directly from server disk manifest (data/fixtures-manifest.json)
 */
export async function fetchPersistedFixtures(): Promise<LiveApiResponse> {
  try {
    const response = await fetch('/api/fixtures/persisted');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.status === 'success' && Array.isArray(data.fixtures)) {
      if (data.fixtures.length > 0) {
        saveCustomFixtures(data.fixtures);
      }
      return data;
    }
    return {
      status: 'success',
      provider: 'Server Disk Manifest',
      count: 0,
      syncedAt: new Date().toISOString(),
      fixtures: [],
    };
  } catch (err: unknown) {
    console.warn('Persisted fixtures fetch failed:', err);
    return {
      status: 'error',
      provider: 'Server Disk Manifest (Offline)',
      count: 0,
      syncedAt: new Date().toISOString(),
      fixtures: [],
    };
  }
}

/**
 * Atomically ingest raw bookmaker text or fixture array directly into server disk manifest
 */
export async function ingestSlateToServer(payload: { rawText?: string; fixtures?: MatchFixture[] }): Promise<IngestSlateResponse> {
  const response = await fetch('/api/fixtures/ingest-slate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.status === 'success' && Array.isArray(data.fixtures)) {
    saveCustomFixtures(data.fixtures);
  }
  return data;
}

/**
 * Purge and wipe all server disk fixtures and memory caches to a clean state
 */
export async function purgeFixturesOnServer(): Promise<{ status: string; message: string; count: number; fixtures: MatchFixture[] }> {
  const response = await fetch('/api/fixtures/purge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  saveCustomFixtures([]);
  return data;
}

/**
 * Delete an individual fixture by matchId from server disk manifest and active cache
 */
export async function deleteFixtureOnServer(matchId: string): Promise<DeleteFixtureResponse> {
  const response = await fetch('/api/fixtures/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.status === 'success' && Array.isArray(data.fixtures)) {
    saveCustomFixtures(data.fixtures);
  }
  return data;
}
