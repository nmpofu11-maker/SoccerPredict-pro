import test from 'node:test';
import assert from 'node:assert/strict';
import { isQuickBetEligible } from '../src/utils/quickBetEligibility';

const valid = {
  hasPredictionEvidence: true,
  hasVerifiedStandings: true,
  modelLeaderProbabilityPct: 85,
  pickProbabilityPct: 85,
  marketOdds: 1.30,
  oddsSource: 'verified-test-book',
};

test('rejects a 50% probability as a Quick Bet', () => {
  assert.equal(isQuickBetEligible({ ...valid, modelLeaderProbabilityPct: 50, pickProbabilityPct: 50, marketOdds: 2 }), false);
});

test('rejects missing verified standings even when probability is high', () => {
  assert.equal(isQuickBetEligible({ ...valid, hasVerifiedStandings: false }), false);
});

test('rejects missing market odds or odds provenance', () => {
  assert.equal(isQuickBetEligible({ ...valid, marketOdds: null }), false);
  assert.equal(isQuickBetEligible({ ...valid, oddsSource: null }), false);
});

test('rejects a high-probability pick with no positive expected value', () => {
  assert.equal(isQuickBetEligible({ ...valid, marketOdds: 1.10 }), false);
});

test('accepts only high-confidence, verified, positive-value selections', () => {
  assert.equal(isQuickBetEligible(valid), true);
});
