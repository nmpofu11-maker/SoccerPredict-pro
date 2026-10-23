import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidFootballScore, normalizeFootballScore } from '../src/utils/scoreValidation';

test('accepts nonnegative safe integer football scores', () => {
  for (const score of [0, 1, 12, Number.MAX_SAFE_INTEGER]) {
    assert.equal(isValidFootballScore(score), true);
    assert.equal(normalizeFootballScore(score), score);
  }
});

test('normalizes numeric strings and rejects invalid or missing scores', () => {
  assert.equal(normalizeFootballScore('0'), 0);
  assert.equal(normalizeFootballScore(' 3 '), 3);
  for (const score of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, null, undefined, '', ' ', true, '1.5', '-1']) {
    assert.equal(isValidFootballScore(score), false);
    assert.equal(normalizeFootballScore(score), null);
  }
});
