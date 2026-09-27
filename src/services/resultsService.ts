import { HistoricalMatchResult, MatchFixture } from '../types/soccer';
 
export interface SettledResultsResponse {
  status: 'success' | 'error';
  count: number;
  results: HistoricalMatchResult[];
  message?: string;
}
 
/**
 * Fetches match results settled by the server-side automated pipeline
 * (data/results-log.json, written by the daily ingest + settlement cron jobs).
 * These are real, growing results — distinct from the static seed dataset in
 * src/data/historical_results.ts, which was a one-time hand-authored snapshot.
 */
export async function fetchSettledResults(): Promise<HistoricalMatchResult[]> {
  try {
    const res = await fetch('/api/results/settled');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: SettledResultsResponse = await res.json();
    if (data.status === 'success' && Array.isArray(data.results)) {
      return data.results;
    }
    return [];
  } catch (err) {
    console.warn('Failed to fetch server-settled results:', err);
    return [];
  }
}

export interface DailySlateResponse {
  status: 'success' | 'error';
  count: number;
  syncedAt: string;
  fixtures: MatchFixture[];
  message?: string;
}

/**
 * Fetches the actual fixture slate from the automated server-side pipeline
 * (data/fixtures-manifest.json) — this is the ONE authoritative source of
 * fixtures, combining whatever bookmaker slate was ingested with whatever
 * the daily provider sync (TheSportsDB / API-Football) added. This is what
 * should drive the visible match list; there is no other legitimate source.
 */
export async function fetchDailySlate(): Promise<MatchFixture[] | null> {
  try {
    const res = await fetch('/api/fixtures/daily-slate');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: DailySlateResponse = await res.json();
    if (data.status === 'success' && Array.isArray(data.fixtures)) {
      return data.fixtures;
    }
    return null;
  } catch (err) {
    console.warn('Failed to fetch daily slate from server pipeline:', err);
    return null;
  }
}
 
export interface CronStatusResponse {
  status: 'success' | 'error';
  sportApiAiConfigured: boolean;
  theRundownConfigured: boolean;
  cron: {
    ingest: { lastRunAt: string | null; lastSuccess: boolean | null; lastMessage: string; fixturesIngested: number; sourceUsed?: string | null };
    settlement: { lastRunAt: string | null; lastSuccess: boolean | null; lastMessage: string; resultsSettled: number };
  };
}
 
/** Lets the UI show whether the automated pipeline is actually configured and running — real numbers, not a simulation. */
export async function fetchCronStatus(): Promise<CronStatusResponse | null> {
  try {
    const res = await fetch('/api/admin/cron-status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch cron status:', err);
    return null;
  }
}

/** Manually triggers the ingestion job right now, for a 'Sync Now' button that does something real. */
export async function triggerIngestNow(): Promise<{ success: boolean; message: string; count: number }> {
  try {
    const res = await fetch('/api/admin/run-ingest-now', { method: 'POST' });
    return await res.json();
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Request failed', count: 0 };
  }
}
