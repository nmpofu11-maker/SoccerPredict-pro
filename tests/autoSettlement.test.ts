import test from 'node:test';
import assert from 'node:assert/strict';
import { isAutoSettlementEnabled } from '../src/utils/autoSettlement';

test('automatic settlement stays enabled by default for existing deployments', () => {
  assert.equal(isAutoSettlementEnabled(undefined), true);
  assert.equal(isAutoSettlementEnabled(''), true);
  assert.equal(isAutoSettlementEnabled('true'), true);
});

test('automatic settlement can be explicitly disabled for safe diagnostics', () => {
  for (const value of ['false', 'FALSE', '0', 'no', 'off']) {
    assert.equal(isAutoSettlementEnabled(value), false, value);
  }
});
