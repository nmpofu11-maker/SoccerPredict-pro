/**
 * API Scheduler & Batch Downloader Service
 * Automatically downloads required fixture datasets in a single batch call on app boot
 * and schedules sensible interval checks (e.g., every 6 hours) to respect the 100 calls/day limit.
 */

import { MatchFixture } from '../types/soccer';
import { loadApiQuotaState, smartCachedApiFetch } from './apiQuotaGuardService';
import { getRealDefaultFixtures } from './storage';

const LAST_SYNC_KEY = 'soccer_engine_last_batch_sync_timestamp_v1';
const BATCH_CACHE_KEY = 'soccer_engine_batch_fixtures_cache_v1';
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncedAt: string;
  source: 'api' | 'cache' | 'fallback';
  callsUsedToday: number;
}

/**
 * Perform intelligent batch synchronization of fixtures and results.
 * Respects the 100 calls/day budget guard by caching heavily and syncing only once every 6 hours.
 */
export async function performSmartBatchSync(force = false): Promise<{ fixtures: MatchFixture[]; status: SyncStatus }> {
  const now = Date.now();
  const lastSyncStr = localStorage.getItem(LAST_SYNC_KEY);
  const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;

  const quotaState = loadApiQuotaState();

  // If within interval and not forced, return cached batch
  if (!force && now - lastSyncTime < SYNC_INTERVAL_MS && quotaState.callsUsed < 100) {
    try {
      const cached = localStorage.getItem(BATCH_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return {
            fixtures: parsed,
            status: {
              isSyncing: false,
              lastSyncedAt: new Date(lastSyncTime).toISOString(),
              source: 'cache',
              callsUsedToday: quotaState.callsUsed,
            },
          };
        }
      }
    } catch (e) {
      console.warn('Batch cache read error', e);
    }
  }

  // If quota is exhausted or close to limit, return local verified fallback instantly with zero network calls
  if (quotaState.callsUsed >= 98) {
    const fallback = getRealDefaultFixtures();
    return {
      fixtures: fallback,
      status: {
        isSyncing: false,
        lastSyncedAt: new Date().toISOString(),
        source: 'fallback',
        callsUsedToday: quotaState.callsUsed,
      },
    };
  }

  // Perform single optimized batch fetch via Smart Cached API
  try {
    const result = await smartCachedApiFetch(
      'daily_batch_fixtures_sync',
      async () => {
        // Simulated or real batch API call to fetch fresh verified fixtures & results
        // In production, this calls the backend /api/fixtures/live or external API endpoint
        const res = await fetch('/api/fixtures/live');
        if (!res.ok) {
          throw new Error('Live fixtures sync endpoint returned error');
        }
        const json = await res.json();
        return (json.fixtures && json.fixtures.length > 0) ? json.fixtures : getRealDefaultFixtures();
      },
      360 // 6 hour TTL
    );

    localStorage.setItem(LAST_SYNC_KEY, now.toString());
    localStorage.setItem(BATCH_CACHE_KEY, JSON.stringify(result.data));

    return {
      fixtures: result.data,
      status: {
        isSyncing: false,
        lastSyncedAt: new Date().toISOString(),
        source: result.source,
        callsUsedToday: result.quotaState.callsUsed,
      },
    };
  } catch (err) {
    console.warn('Batch sync fallback triggered due to network/quota:', err);
    const fallback = getRealDefaultFixtures();
    return {
      fixtures: fallback,
      status: {
        isSyncing: false,
        lastSyncedAt: new Date().toISOString(),
        source: 'fallback',
        callsUsedToday: loadApiQuotaState().callsUsed,
      },
    };
  }
}
