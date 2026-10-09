import fs from 'node:fs';
import path from 'node:path';

export interface IngestProviderDiagnostics {
  configured: boolean;
  requestedDates: string[];
  requestCount: number;
  successfulRequests: number;
  failedRequests: number;
  httpErrors: string[];
  rawRecords: number;
  mappedRecords: number;
  rejectedRecords: number;
  mappingRejectReasons: Record<string, number>;
  notes: string[];
}

export interface IngestDiagnostics {
  startedAt: string;
  completedAt?: string;
  timezone: string;
  requestedDates: string[];
  sportApiAi: IngestProviderDiagnostics;
  theRundown: IngestProviderDiagnostics;
  pitchApi: IngestProviderDiagnostics;
  sportDb: IngestProviderDiagnostics;
  apiFootball: IngestProviderDiagnostics;
  sportmonks: IngestProviderDiagnostics;
  manifestBefore: number;
  manifestAfter: number;
  added: number;
  sourceUsed: 'SPORTAPI_AI' | 'THERUNDOWN' | 'PITCHAPI' | 'SPORTDB' | 'API_FOOTBALL' | 'SPORTMONKS' | null;
}

export interface IngestStatus {
  lastRunAt: string | null;
  lastSuccess: boolean | null;
  lastMessage: string;
  fixturesIngested: number;
  sourceUsed?: 'SPORTAPI_AI' | 'THERUNDOWN' | 'PITCHAPI' | 'SPORTDB' | 'API_FOOTBALL' | 'SPORTMONKS' | null;
  diagnostics?: IngestDiagnostics;
}

export interface SettlementStatus {
  lastRunAt: string | null;
  lastSuccess: boolean | null;
  lastMessage: string;
  resultsSettled: number;
}

export interface CronStatus {
  ingest: IngestStatus;
  settlement: SettlementStatus;
}

/** Parse one JSON value or a sequence of complete top-level JSON objects/arrays.
 * Returns null for truncated or otherwise unrecoverable input.
 */
function parseCompleteJsonValues(raw: string): unknown[] | null {
  const values: unknown[] = [];
  let index = 0;
  while (index < raw.length) {
    while (index < raw.length && (/[\s,]/.test(raw[index]))) index++;
    if (index >= raw.length) break;
    const start = index;
    const first = raw[index];
    if (first !== '{' && first !== '[') return null;
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (; index < raw.length; index++) {
      const ch = raw[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack.pop() !== ch) return null;
        if (stack.length === 0) {
          index++;
          try { values.push(JSON.parse(raw.slice(start, index))); }
          catch { return null; }
          break;
        }
      }
    }
    if (stack.length !== 0 || inString) return null;
  }
  return values.length ? values : null;
}

export const DEFAULT_CRON_STATUS_PATH = path.join(process.cwd(), 'data', 'cron-status.json');

export function getDefaultCronStatus(): CronStatus {
  return {
    ingest: {
      lastRunAt: null,
      lastSuccess: null,
      lastMessage: 'Not yet run',
      fixturesIngested: 0,
    },
    settlement: {
      lastRunAt: null,
      lastSuccess: null,
      lastMessage: 'Not yet run',
      resultsSettled: 0,
    },
  };
}

/**
 * Safely reads the cron status JSON file.
 * Returns default initial status if the file does not exist or contains invalid JSON.
 */
export function readCronStatus(filePath: string = DEFAULT_CRON_STATUS_PATH): CronStatus {
  const empty = getDefaultCronStatus();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Recover the last complete cron snapshot if a previous writer appended
        // multiple complete JSON objects. Truncated/corrupt data still falls back.
        const recovered = parseCompleteJsonValues(raw);
        parsed = recovered?.filter((value) => value && typeof value === 'object' && !Array.isArray(value)).at(-1);
        if (!parsed) throw new Error('cron-status.json contains unrecoverable JSON');
        console.warn('Recovered latest complete object from malformed cron-status.json');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('cron-status.json must contain a JSON object');
      }
      return {
        ingest: { ...empty.ingest, ...(parsed?.ingest || {}) },
        settlement: { ...empty.settlement, ...(parsed?.settlement || {}) },
      };
    }
  } catch (e) {
    console.warn(`Error reading cron status at ${filePath}:`, e);
  }
  return empty;
}

/**
 * Atomically writes cron status using a temporary file and renameSync,
 * preventing readers from observing half-written or corrupted JSON states.
 */
export function writeCronStatusAtomic(status: CronStatus, filePath: string = DEFAULT_CRON_STATUS_PATH): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${randomSuffix}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(status, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    console.error(`Error atomically writing cron status to ${filePath}:`, e);
  }
}

/**
 * Synchronous atomic read-modify-write for CronStatus.
 * Reads the latest state from disk, applies the mutator, and writes back atomically.
 * Because Node.js is single-threaded, synchronous execution guarantees that no other
 * event-loop code in this process can interleave between the read and the atomic write.
 */
export function updateCronStatus(
  mutator: (current: CronStatus) => CronStatus,
  filePath: string = DEFAULT_CRON_STATUS_PATH
): CronStatus {
  const current = readCronStatus(filePath);
  const updated = mutator(current);
  writeCronStatusAtomic(updated, filePath);
  return updated;
}

/**
 * Concurrency-safe helper to update only the `ingest` partition of cron status.
 * Reads the latest status from disk, updates `ingest`, preserves existing `settlement`,
 * and writes back atomically.
 */
export function updateIngestCronStatus(
  update: IngestStatus | ((prev: IngestStatus) => IngestStatus),
  filePath: string = DEFAULT_CRON_STATUS_PATH
): CronStatus {
  return updateCronStatus((current) => {
    const nextIngest = typeof update === 'function' ? update(current.ingest) : update;
    return {
      ...current,
      ingest: nextIngest,
    };
  }, filePath);
}

/**
 * Concurrency-safe helper to update only the `settlement` partition of cron status.
 * Reads the latest status from disk, updates `settlement`, preserves existing `ingest`,
 * and writes back atomically.
 */
export function updateSettlementCronStatus(
  update: SettlementStatus | ((prev: SettlementStatus) => SettlementStatus),
  filePath: string = DEFAULT_CRON_STATUS_PATH
): CronStatus {
  return updateCronStatus((current) => {
    const nextSettlement = typeof update === 'function' ? update(current.settlement) : update;
    return {
      ...current,
      settlement: nextSettlement,
    };
  }, filePath);
}
