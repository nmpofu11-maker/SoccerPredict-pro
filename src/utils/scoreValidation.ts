/** A final football score must be a nonnegative, safely representable whole number. */
export function isValidFootballScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Normalize provider score fields without treating null, blanks, or booleans as zero. */
export function normalizeFootballScore(value: unknown): number | null {
  if (typeof value === 'number') return isValidFootballScore(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;

  const parsed = Number(value.trim());
  return isValidFootballScore(parsed) ? parsed : null;
}
