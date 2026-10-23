import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSettlementRun } from '../src/utils/settlementRunStatus';

test('provider failures make a settlement run visibly unsuccessful even when no results settle', () => {
  assert.deepEqual(summarizeSettlementRun(0, 4, 2, 3), {
    success: false,
    message: 'Settled 0 of 4 unsettled past fixtures. 2 provider queries failed.',
  });
});

test('a settlement run with no provider queries is not reported as successful', () => {
  assert.deepEqual(summarizeSettlementRun(0, 4, 0, 0), {
    success: false,
    message: 'Settled 0 of 4 unsettled past fixtures. No provider queries were made.',
  });
});

test('a completed provider lookup with no matching final results remains a successful zero-result run', () => {
  assert.deepEqual(summarizeSettlementRun(0, 4, 0, 1), {
    success: true,
    message: 'Settled 0 of 4 unsettled past fixtures.',
  });
});
