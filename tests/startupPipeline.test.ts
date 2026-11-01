import test from 'node:test';
import assert from 'node:assert/strict';
import { runStartupPipelinePass } from '../src/utils/startupPipeline';

test('Requirement B: settlement runs independently when startup ingestion returns success: false', async () => {
  const callOrder: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const summary = await runStartupPipelinePass({
    autoSettlementEnabled: true,
    runIngest: async () => {
      callOrder.push('ingest');
      return {
        success: false,
        message: 'Ingestion unsuccessful: configured providers are suspended.',
        count: 0,
      };
    },
    runSettlement: async () => {
      callOrder.push('settlement');
      return {
        success: true,
        message: 'Settled 3 past persisted fixtures.',
        count: 3,
      };
    },
    logger: {
      info: () => {},
      warn: (msg: unknown) => warnings.push(String(msg)),
      error: (msg: unknown) => errors.push(String(msg)),
    },
  });

  assert.deepEqual(callOrder, ['ingest', 'settlement']);
  assert.equal(summary.ingestRan, true);
  assert.equal(summary.ingestSucceeded, false);
  assert.equal(summary.settlementRan, true);
  assert.equal(summary.settlementSucceeded, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Startup ingestion completed without usable incoming fixtures/);
  assert.equal(errors.length, 0);
});

test('Requirement B: settlement still runs against persisted fixtures when startup ingestion rejects', async () => {
  const callOrder: string[] = [];
  const errors: string[] = [];

  const summary = await runStartupPipelinePass({
    autoSettlementEnabled: true,
    runIngest: async () => {
      callOrder.push('ingest');
      throw new Error('Upstream DNS failure');
    },
    runSettlement: async () => {
      callOrder.push('settlement');
      return {
        success: true,
        message: 'Settled 2 past persisted fixtures.',
        count: 2,
      };
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: (msg: unknown) => errors.push(String(msg)),
    },
  });

  assert.deepEqual(callOrder, ['ingest', 'settlement']);
  assert.equal(summary.ingestRan, true);
  assert.equal(summary.ingestSucceeded, false);
  assert.equal(summary.settlementRan, true);
  assert.equal(summary.settlementSucceeded, true);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Startup ingestion threw an unexpected error/);
});

test('Requirement B: settlement failure is isolated and never marks startup ingestion as failed', async () => {
  const errors: string[] = [];

  const summary = await runStartupPipelinePass({
    autoSettlementEnabled: true,
    runIngest: async () => ({
      success: true,
      message: 'Ingested 18 fixtures.',
      count: 18,
    }),
    runSettlement: async () => {
      throw new Error('Results log locked');
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: (msg: unknown) => errors.push(String(msg)),
    },
  });

  assert.equal(summary.ingestSucceeded, true);
  assert.equal(summary.settlementRan, true);
  assert.equal(summary.settlementSucceeded, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Startup settlement threw an unexpected error/);
});

test('Requirement B: startup settlement is skipped when AUTO_SETTLEMENT_ENABLED is false', async () => {
  let settlementCalled = false;

  const summary = await runStartupPipelinePass({
    autoSettlementEnabled: false,
    runIngest: async () => ({
      success: false,
      message: 'No fixtures ingested.',
      count: 0,
    }),
    runSettlement: async () => {
      settlementCalled = true;
      return { success: true, message: 'Should not run', count: 0 };
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });

  assert.equal(settlementCalled, false);
  assert.equal(summary.settlementRan, false);
});
