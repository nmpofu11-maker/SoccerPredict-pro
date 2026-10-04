/**
 * Bzzoiro Sports Data (BSD) isolated server-side REST client.
 *
 * Stage A only: no prediction-engine or fixture-enrichment integration.
 * BSD identifiers remain in the bsd* namespace and are never translated into
 * SportAPI.ai or Sportmonks identifiers.
 */
const DEFAULT_BASE_URL = 'https://sports.bzzoiro.com/api/v2';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const MIN_REQUEST_INTERVAL_MS = 100; // BSD documents 10 requests/second per IP.
const MAX_CACHE_ENTRIES = 500;

export type BsdResource = 'availability' | 'stats' | 'lineups' | 'incidents' |
  'player-stats' | 'odds' | 'odds/comparison' | 'prediction' | 'shotmap';

export interface BsdEnvelope<T = unknown> {
  data: T;
  source: 'BSD';
  fetchedAt: string;
  endpoint: string;
  httpStatus: number;
  cacheHit: boolean;
  rateLimit: { limit?: string; remaining?: string; reset?: string };
}

export interface BsdRequestOptions {
  cacheTtlMs?: number;
  forceRefresh?: boolean;
  timeoutMs?: number;
}

export class BsdApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'BsdApiError';
  }
}

const responseCache = new Map<string, { expiresAt: number; value: BsdEnvelope }>();
let nextRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();
let rateLimitedUntil = 0;

function apiKey(): string {
  return (process.env.BSD_API_KEY || '').trim();
}

export function bsdConfigured(): boolean {
  return apiKey().length > 0;
}

export function bsdBaseUrl(): string {
  return (process.env.BSD_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function clearBsdCache(): void {
  responseCache.clear();
}

export function isBsdRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

function headerValue(headers: Headers, name: string): string | undefined {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
}

function retryAfterSeconds(headers: Headers): number | undefined {
  const raw = headerValue(headers, 'retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(1, seconds);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

async function paceRequests(): Promise<void> {
  const previous = requestQueue;
  let release!: () => void;
  requestQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    if (Date.now() < rateLimitedUntil) {
      throw new BsdApiError('BSD rate limit is active; request skipped.', 429,
        Math.ceil((rateLimitedUntil - Date.now()) / 1000));
    }
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
  } finally {
    release();
  }
}

function normalizePayload(payload: any): any {
  if (payload && typeof payload === 'object' && payload.error === true) {
    throw new BsdApiError(String(payload.detail || 'BSD API returned an error.'), Number(payload.status) || 502);
  }
  return payload;
}

export async function bsdGet<T = unknown>(
  endpoint: string,
  options: BsdRequestOptions = {},
): Promise<BsdEnvelope<T>> {
  if (!bsdConfigured()) throw new BsdApiError('BSD_API_KEY is not configured; BSD remains disabled.', 503);
  const cleanPath = endpoint.replace(/^\/+/, '');
  if (!cleanPath || cleanPath.split('/').some(part => part === '..')) {
    throw new BsdApiError('Invalid BSD endpoint path.', 400);
  }

  const url = bsdBaseUrl() + '/' + cleanPath;
  const cacheKey = url;
  const cached = responseCache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cacheHit: true } as BsdEnvelope<T>;
  }

  await paceRequests();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: 'Token ' + apiKey(),
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: any = null;
    if (raw) {
      try { body = JSON.parse(raw); }
      catch { throw new BsdApiError('BSD returned non-JSON content for ' + cleanPath, response.status || 502); }
    }

    if (!response.ok) {
      const retry = retryAfterSeconds(response.headers);
      if (response.status === 429) rateLimitedUntil = Date.now() + (retry ?? 60) * 1000;
      const detail = typeof body?.detail === 'string' ? body.detail :
        typeof body?.message === 'string' ? body.message : 'HTTP ' + response.status;
      throw new BsdApiError('BSD ' + response.status + ': ' + detail, response.status, retry);
    }

    body = normalizePayload(body);
    const envelope: BsdEnvelope<T> = {
      data: (body && typeof body === 'object' && 'data' in body ? body.data : body) as T,
      source: 'BSD',
      fetchedAt: new Date().toISOString(),
      endpoint: cleanPath,
      httpStatus: response.status,
      cacheHit: false,
      rateLimit: {
        limit: headerValue(response.headers, 'ratelimit-limit'),
        remaining: headerValue(response.headers, 'ratelimit-remaining'),
        reset: headerValue(response.headers, 'ratelimit-reset'),
      },
    };
    const ttl = Math.max(0, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    if (ttl > 0) {
      if (responseCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = responseCache.keys().next().value;
        if (oldest) responseCache.delete(oldest);
      }
      responseCache.set(cacheKey, { expiresAt: Date.now() + ttl, value: envelope });
    }
    return envelope;
  } catch (error) {
    if (error instanceof BsdApiError) throw error;
    if ((error as Error)?.name === 'AbortError') throw new BsdApiError('BSD request timed out.', 408);
    throw new BsdApiError('BSD network request failed: ' + (error instanceof Error ? error.message : String(error)), 502);
  } finally {
    clearTimeout(timeout);
  }
}

/** Public coverage catalogue. */
export function fetchBsdCoverage(options?: BsdRequestOptions): Promise<BsdEnvelope> {
  return bsdGet('coverage/', options);
}

/** Authenticated paginated league catalogue. */
export function fetchBsdLeagues(params: { limit?: number; offset?: number } = {}, options?: BsdRequestOptions): Promise<BsdEnvelope> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(Math.min(200, Math.max(1, Math.floor(params.limit)))));
  if (params.offset !== undefined) query.set('offset', String(Math.max(0, Math.floor(params.offset))));
  return bsdGet('leagues/' + (query.size ? '?' + query.toString() : ''), options);
}

/** Fixture list; date/status filters are passed as documented query parameters. */
export function fetchBsdEvents(params: Record<string, string | number | undefined> = {}, options?: BsdRequestOptions): Promise<BsdEnvelope> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
  return bsdGet('events/' + (query.size ? '?' + query.toString() : ''), options);
}

export function fetchBsdEventDetail(bsdFixtureId: string | number, options?: BsdRequestOptions): Promise<BsdEnvelope> {
  return bsdGet('events/' + encodeURIComponent(String(bsdFixtureId)) + '/', options);
}

export function fetchBsdEventResource(
  bsdFixtureId: string | number,
  resource: BsdResource,
  options?: BsdRequestOptions,
): Promise<BsdEnvelope> {
  const allowed: BsdResource[] = ['availability', 'stats', 'lineups', 'incidents', 'player-stats', 'odds', 'odds/comparison', 'prediction', 'shotmap'];
  if (!allowed.includes(resource)) throw new BsdApiError('Unsupported BSD event resource.', 400);
  return bsdGet('events/' + encodeURIComponent(String(bsdFixtureId)) + '/' + resource + '/', options);
}

/** Stable provider namespace helper; never assign these values to another provider's ID fields. */
export function withBsdIds<T extends Record<string, any>>(
  fixture: T,
  ids: { fixtureId?: string | number; homeTeamId?: string | number; awayTeamId?: string | number },
): T & { bsdFixtureId?: string; bsdHomeTeamId?: string; bsdAwayTeamId?: string } {
  return {
    ...fixture,
    ...(ids.fixtureId !== undefined ? { bsdFixtureId: String(ids.fixtureId) } : {}),
    ...(ids.homeTeamId !== undefined ? { bsdHomeTeamId: String(ids.homeTeamId) } : {}),
    ...(ids.awayTeamId !== undefined ? { bsdAwayTeamId: String(ids.awayTeamId) } : {}),
  };
}
