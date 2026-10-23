/** A football score must be a nonnegative whole number. */
export function isValidFootballScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
