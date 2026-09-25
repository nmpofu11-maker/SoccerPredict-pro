import { HistoricalMatchResult } from '../types/soccer';
 
export interface SettledResultsResponse {
  status: 'success' | 'error';
  count: number;
  results: HistoricalMatchResult[];
  message?: string;
}
 
/**
 * Fetches match results settled by the server-side API-Football pipeline
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
 
export interface CronStatusResponse {
  status: 'success' | 'error';
  apiFootballConfigured: boolean;
  quota: { date: string; callsUsed: number; maxDailyLimit: number };
  cron: {
    ingest: { lastRunAt: string | null; lastSuccess: boolean | null; lastMessage: string; fixturesIngested: number };
    settlement: { lastRunAt: string | null; lastSuccess: boolean | null; lastMessage: string; resultsSettled: number };
  };
}
 
/** Lets the UI show whether the automated pipeline is actually configured and running. */
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
