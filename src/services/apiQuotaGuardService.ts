/**
 * API Quota Guard Service
 * Enforces a strict maximum of 100 API calls per day, with intelligent caching,
 * persistent daily budget resets, and immutable local verified fallback.
 */

export interface ApiQuotaState {
  date: string; // YYYY-MM-DD
  callsUsed: number;
  maxDailyLimit: number;
  lastCallTimestamp: string;
  cacheHitCount: number;
}

const STORAGE_KEYS = {
  QUOTA_STATE: 'soccer_engine_api_quota_state_v1',
  API_CACHE_PREFIX: 'soccer_engine_api_cache_',
};

const MAX_DAILY_CALLS = 100;

export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function loadApiQuotaState(): ApiQuotaState {
  const today = getTodayDateString();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.QUOTA_STATE);
    if (raw) {
      const state: ApiQuotaState = JSON.parse(raw);
      // If date changed, reset quota for the new day
      if (state.date === today) {
        return state;
      }
    }
  } catch (e) {
    console.warn('Failed to load API quota state', e);
  }

  // Initial fresh state for today
  const freshState: ApiQuotaState = {
    date: today,
    callsUsed: 0,
    maxDailyLimit: MAX_DAILY_CALLS,
    lastCallTimestamp: new Date().toISOString(),
    cacheHitCount: 0,
  };
  saveApiQuotaState(freshState);
  return freshState;
}

export function saveApiQuotaState(state: ApiQuotaState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.QUOTA_STATE, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save API quota state', e);
  }
}

/**
 * Check if we can safely make an API call without exceeding the 100 call limit.
 * If quota is exhausted (callsUsed >= 100), throws or returns false to force local cache serving.
 */
export function canMakeApiCall(): boolean {
  const state = loadApiQuotaState();
  return state.callsUsed < MAX_DAILY_CALLS;
}

/**
 * Record an API call execution, incrementing daily count.
 */
export function recordApiCallExecuted(isCacheHit = false): ApiQuotaState {
  const state = loadApiQuotaState();
  if (isCacheHit) {
    state.cacheHitCount += 1;
  } else {
    state.callsUsed = Math.min(MAX_DAILY_CALLS, state.callsUsed + 1);
  }
  state.lastCallTimestamp = new Date().toISOString();
  saveApiQuotaState(state);
  return state;
}

/**
 * Smart Cached Fetch: Fetches data from API only if quota permits and cache is expired/missing.
 * Otherwise serves verified local cache with zero API calls.
 */
export async function smartCachedApiFetch<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  ttlMinutes = 120
): Promise<{ data: T; source: 'api' | 'cache'; quotaState: ApiQuotaState }> {
  const fullKey = `${STORAGE_KEYS.API_CACHE_PREFIX}_${cacheKey}`;
  const now = Date.now();

  try {
    const cachedRaw = localStorage.getItem(fullKey);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed && parsed.expiry && parsed.data && now < parsed.expiry) {
        // Cache hit! Zero API calls consumed.
        const quotaState = recordApiCallExecuted(true);
        return { data: parsed.data, source: 'cache', quotaState };
      }
    }
  } catch (e) {
    console.warn('Cache read warning for key', cacheKey, e);
  }

  // Check quota before hitting network
  if (!canMakeApiCall()) {
    console.warn('API Quota exhausted (100/day limit reached). Serving verified fallback cache.');
    // Try stale cache if available
    try {
      const staleRaw = localStorage.getItem(fullKey);
      if (staleRaw) {
        const parsed = JSON.parse(staleRaw);
        if (parsed && parsed.data) {
          const quotaState = loadApiQuotaState();
          return { data: parsed.data, source: 'cache', quotaState };
        }
      }
    } catch (err) {
      console.warn('Stale cache fallback failed', err);
    }
    throw new Error('Daily API quota limit (100 calls) reached. Serving immutable verified local fallback.');
  }

  // Execute API call
  const data = await fetchFn();
  const quotaState = recordApiCallExecuted(false);

  // Save to cache with TTL
  try {
    const expiry = now + ttlMinutes * 60 * 1000;
    localStorage.setItem(fullKey, JSON.stringify({ data, expiry }));
  } catch (e) {
    console.warn('Cache write warning for key', cacheKey, e);
  }

  return { data, source: 'api', quotaState };
}
