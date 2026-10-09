export type FixtureStatusState = 'scheduled' | 'live' | 'finished' | 'unknown';

export function normalizeFixtureStatus(value: unknown): string | undefined {
  const candidate = typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? ((value as any).short ?? (value as any).code ?? (value as any).name ?? (value as any).long)
      : undefined;
  if (typeof candidate !== 'string' || !candidate.trim()) return undefined;
  return candidate.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

const FINISHED_STATUSES = new Set([
  'FINISHED', 'FT', 'AET', 'PEN', 'FINAL', 'COMPLETED', 'ENDED',
  'MATCH_FINISHED', 'AFTER_EXTRA_TIME', 'AFTER_PENALTIES',
]);
const LIVE_STATUSES = new Set([
  'LIVE', 'IN_PLAY', 'INPLAY', '1H', '2H', 'HT', 'ET', 'P',
  'PAUSED', 'FIRST_HALF', 'SECOND_HALF', 'HALF_TIME', 'EXTRA_TIME',
  'PENALTY_SHOOTOUT',
]);
const SCHEDULED_STATUSES = new Set([
  'NS', 'SCHEDULED', 'NOT_STARTED', 'TBD', 'TIMED', 'UPCOMING',
]);

export function classifyFixtureStatus(value: unknown): FixtureStatusState {
  const status = normalizeFixtureStatus(value);
  if (!status) return 'unknown';
  if (FINISHED_STATUSES.has(status)) return 'finished';
  if (LIVE_STATUSES.has(status)) return 'live';
  if (SCHEDULED_STATUSES.has(status)) return 'scheduled';
  return 'unknown';
}
