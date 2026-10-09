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
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.trim().length === 0) return empty;
      
      try {
        const parsed = JSON.parse(content);
        return {
          ingest: { ...empty.ingest, ...(parsed?.ingest || {}) },
          settlement: { ...empty.settlement, ...(parsed?.settlement || {}) },
        };
      } catch (e) {
        // Fallback: Try to recover the first JSON object
        console.warn(`Attempting to recover malformed cron status at ${filePath}:`, e);
        try {
          const match = content.match(/\{.*?\}/s);
          if (!match) return empty;
          const parsed = JSON.parse(match[0]);
          return {
            ingest: { ...empty.ingest, ...(parsed?.ingest || {}) },
            settlement: { ...empty.settlement, ...(parsed?.settlement || {}) },
          };
        } catch (innerE) {
          console.warn(`Failed to recover cron status from ${filePath}:`, innerE);
          return empty;
        }
      }
    }
  } catch (e) {
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf-8').trim().length > 0) {
      console.warn(`Error reading cron status at ${filePath}:`, e);
    }
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
