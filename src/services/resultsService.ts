import { HistoricalMatchResult, MatchFixture } from '../types/soccer';
import { getAdminApiHeaders } from './adminAuthService';
import { AuditedPerformanceReport } from './performanceService';
import { PredictionRecord, TrackRecord } from './predictionLogTypes';

export interface SettledResultsResponse {
  status: 'success' | 'error';
  count: number;
  results: HistoricalMatchResult[];
  message?: string;
}

export interface AuditedPerformanceApiResponse {
  status: 'ok' | 'error';
  logIntact: boolean;
  logProblem: string | null;
  headHash: string;
  entries: number;
  predictionsCount: number;
  settledResultsCount: number;
  audited: AuditedPerformanceReport;
  trackRecord: TrackRecord;
  message?: string;
}

/**
 * Fetches the audited pre-kickoff prediction performance evaluated against verified settled results.
 * This adheres to strict audit requirements (immutable predictions frozen before kickoff, verified final scores).
 */
export async function fetchAuditedPerformance(): Promise<AuditedPerformanceApiResponse | null> {
  try {
    const res = await fetch('/api/predictions/audited-performance');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch audited performance from server:', err);
    return null;
  }
}

/**
 * Fetches pending pre-match predictions stored in the immutable hash chain awaiting kickoff and settlement.
 */
export async function fetchPendingPredictions(): Promise<PredictionRecord[] | null> {
  try {
    const res = await fetch('/api/predictions/pending');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.status !== 'ok' || !Array.isArray(data.pending)) {
      throw new Error('Pending predictions response has an invalid shape');
    }
    return data.pending;
  } catch (err) {
    console.warn('Failed to fetch pending predictions:', err);
    return null;
  }
}
 
/**
 * Fetches match results settled by the server-side automated pipeline
 * (data/results-log.json, written by the daily ingest + settlement cron jobs).
 * These are the only historical outcomes used for model evaluation and learning.
 * Unverified hard-coded historical records are intentionally excluded.
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
export async function fetchDailySlate(timeoutMs: number = 15_000): Promise<MatchFixture[] | null> {
  const controller = new AbortController();
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(120_000, Math.floor(timeoutMs))) : 15_000;
  const timeoutId = setTimeout(() => controller.abort(), safeTimeoutMs);
  try {
    const res = await fetch('/api/fixtures/daily-slate', { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: DailySlateResponse = await res.json();
    if (data.status === 'success' && Array.isArray(data.fixtures)) {
      return data.fixtures;
    }
    return null;
  } catch (err) {
    console.warn('Failed to fetch daily slate from server pipeline:', err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
 
export interface PersistedSlateFetchResult {
  fixtures: MatchFixture[] | null;
  message: string | null;
}

/**
 * Reads the already-persisted fixture manifest without starting a provider refresh.
 * This endpoint is intentionally lightweight for startup and periodic UI refreshes.
 */
export async function fetchPersistedSlate(timeoutMs: number = 15_000): Promise<PersistedSlateFetchResult> {
  const controller = new AbortController();
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(120_000, Math.floor(timeoutMs))) : 15_000;
  const timeoutId = setTimeout(() => controller.abort(), safeTimeoutMs);
  try {
    const res = await fetch('/api/fixtures/persisted', { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { fixtures: null, message: data?.message || data?.error || `HTTP ${res.status} reading persisted fixtures` };
    }
    if (data?.status === 'success' && Array.isArray(data.fixtures)) {
      return { fixtures: data.fixtures as MatchFixture[], message: null };
    }
    return { fixtures: null, message: data?.message || data?.error || 'Persisted fixture response had an invalid shape.' };
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? `Timed out after ${safeTimeoutMs} ms reading persisted fixtures.`
      : err instanceof Error ? err.message : 'Request failed reading persisted fixtures.';
    return { fixtures: null, message };
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface CronStatusResponse {
  status: 'success' | 'error';
  sportApiAiConfigured: boolean;
  theRundownConfigured: boolean;
  pitchApiConfigured: boolean;
  sportDbConfigured: boolean;
  apiFootballConfigured: boolean;
  sportmonksConfigured: boolean;
  footballDataConfigured: boolean;
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

export interface EvidenceCoverageResponse {
  status: 'success' | 'error';
  totalFixtures: number;
  withEvidenceCount: number;
  noEvidenceCount: number;
  standingsCount: number;
  formCount: number;
  matchStatsCount: number;
  advancedStatsCount: number;
  byLeague: Record<string, { total: number; withEvidence: number; noEvidence: number; standings: number; form: number; stats: number }>;
  noEvidenceSampleTeams: string[];
  message?: string;
}

export async function fetchEvidenceCoverage(): Promise<EvidenceCoverageResponse | null> {
  try {
    const res = await fetch('/api/admin/evidence-coverage', { headers: getAdminApiHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Manually triggers the ingestion job right now, for a 'Sync Now' button that does something real. */
export async function triggerIngestNow(): Promise<{ success: boolean; message: string; count: number }> {
  try {
    const res = await fetch('/api/admin/run-ingest-now', { method: 'POST', headers: getAdminApiHeaders() });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      return { success: false, message: 'Authentication required (401): Please configure ADMIN_API_KEY in session.', count: 0 };
    }
    if (res.status === 503) {
      return { success: false, message: 'Service unavailable (503): ADMIN_API_KEY is not configured on the server.', count: 0 };
    }
    if (!res.ok) {
      return { success: false, message: data.message || data.error || `HTTP error ${res.status}`, count: 0 };
    }
    return data;
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Request failed', count: 0 };
  }
}
