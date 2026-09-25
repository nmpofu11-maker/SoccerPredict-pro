/**
 * Server-side API-Football (api-sports.io) client.
 *
 * This is the piece that was completely missing from the app: everywhere else
 * in the codebase, "live data" actually meant ESPN's public scoreboard, and
 * SOCCER_API_KEY was declared in .env.example but never read anywhere.
 *
 * This module:
 *  - Talks to the real API-Football v3 REST API using SOCCER_API_KEY.
 *  - Tracks a daily call budget on disk (data/api-football-quota.json), because
 *    the client-side quota guard in apiQuotaGuardService.ts uses localStorage,
 *    which does not exist in this Node process.
 *  - Exposes fetchFixturesByDate() for daily ingestion and
 *    fetchFixturesStatusByIds() for settlement/verification.
 *
 * Host/auth: API-Football supports two hosting options with different auth
 * headers. Set API_FOOTBALL_HOST to override; defaults to the direct
 * api-sports.io host (x-apisports-key header). If you're on the RapidAPI
 * plan instead, set API_FOOTBALL_HOST=v3.football.api-sports.io/rapidapi or
 * simply set API_FOOTBALL_USE_RAPIDAPI=true in your environment.
 */
 
import fs from 'fs';
import path from 'path';
 
const QUOTA_PATH = path.join(process.cwd(), 'data', 'api-football-quota.json');
const MAX_DAILY_CALLS = Number(process.env.SOCCER_API_MAX_DAILY_CALLS || 95); // leave headroom under the typical 100/day free-tier cap
 
interface QuotaState {
  date: string; // YYYY-MM-DD
  callsUsed: number;
}
 
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
 
function ensureDataDir(): void {
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
 
function loadQuota(): QuotaState {
  ensureDataDir();
  try {
    if (fs.existsSync(QUOTA_PATH)) {
      const state: QuotaState = JSON.parse(fs.readFileSync(QUOTA_PATH, 'utf-8'));
      if (state.date === todayStr()) return state;
    }
  } catch (e) {
    console.warn('[api-football] quota read error', e);
  }
  const fresh: QuotaState = { date: todayStr(), callsUsed: 0 };
  saveQuota(fresh);
  return fresh;
}
 
function saveQuota(state: QuotaState): void {
  ensureDataDir();
  try {
    fs.writeFileSync(QUOTA_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[api-football] quota write error', e);
  }
}
 
export function getApiFootballQuotaState(): QuotaState & { maxDailyLimit: number } {
  return { ...loadQuota(), maxDailyLimit: MAX_DAILY_CALLS };
}
 
function recordCall(): QuotaState {
  const state = loadQuota();
  state.callsUsed += 1;
  saveQuota(state);
  return state;
}
 
function isConfigured(): boolean {
  return Boolean(process.env.SOCCER_API_KEY && process.env.SOCCER_API_KEY.trim().length > 0);
}
 
function getAuthHeaders(): Record<string, string> {
  const key = process.env.SOCCER_API_KEY || '';
  const useRapidApi = process.env.API_FOOTBALL_USE_RAPIDAPI === 'true';
  if (useRapidApi) {
    return {
      'x-rapidapi-key': key,
      'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
    };
  }
  return { 'x-apisports-key': key };
}
 
function getBaseUrl(): string {
  const useRapidApi = process.env.API_FOOTBALL_USE_RAPIDAPI === 'true';
  return useRapidApi
    ? 'https://api-football-v1.p.rapidapi.com/v3'
    : 'https://v3.football.api-sports.io';
}
 
async function apiFootballFetch<T = any>(pathAndQuery: string): Promise<T> {
  if (!isConfigured()) {
    throw new Error('SOCCER_API_KEY is not set. API-Football calls cannot be made.');
  }
  const state = loadQuota();
  if (state.callsUsed >= MAX_DAILY_CALLS) {
    throw new Error(
      `API-Football daily call budget exhausted (${state.callsUsed}/${MAX_DAILY_CALLS}). Will resume tomorrow.`
    );
  }
 
  const url = `${getBaseUrl()}${pathAndQuery}`;
  const res = await fetch(url, {
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  recordCall();
 
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`API-Football request failed (${res.status}): ${bodyText.slice(0, 300)}`);
  }
 
  const json = (await res.json()) as any;
  if (json.errors && Array.isArray(json.errors) ? json.errors.length > 0 : Object.keys(json.errors || {}).length > 0) {
    throw new Error(`API-Football returned errors: ${JSON.stringify(json.errors)}`);
  }
  return json as T;
}
 
export interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long: string; elapsed: number | null };
    venue: { name: string | null };
  };
  league: { id: number; name: string; country: string; round: string };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
}
 
/**
 * Pull all fixtures for a given calendar date (YYYY-MM-DD) across all leagues
 * API-Football has coverage for. This is the daily "load today's slate" call.
 */
export async function fetchFixturesByDate(dateStr: string): Promise<ApiFootballFixture[]> {
  const json = await apiFootballFetch<{ response: ApiFootballFixture[] }>(
    `/fixtures?date=${encodeURIComponent(dateStr)}`
  );
  return json.response || [];
}
 
/**
 * Look up current status/score for a specific set of fixture IDs.
 * Used by the settlement job to check whether yesterday's matches have finished.
 * API-Football accepts up to 20 ids per call, dash-separated.
 */
export async function fetchFixturesStatusByIds(ids: number[]): Promise<ApiFootballFixture[]> {
  if (ids.length === 0) return [];
  const out: ApiFootballFixture[] = [];
  const CHUNK = 20;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const json = await apiFootballFetch<{ response: ApiFootballFixture[] }>(
      `/fixtures?ids=${chunk.join('-')}`
    );
    out.push(...(json.response || []));
  }
  return out;
}
 
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
 
export function isFixtureFinished(f: ApiFootballFixture): boolean {
  return FINISHED_STATUSES.has(f.fixture.status.short);
}
 
export function apiFootballConfigured(): boolean {
  return isConfigured();
}
