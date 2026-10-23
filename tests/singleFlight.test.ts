import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleFlight } from '../src/utils/singleFlight';

test('concurrent calls share one run and a later call starts a new run', async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const run = createSingleFlight(async () => {
    calls++;
    await gate;
    return calls;
  });

  const first = run();
  const concurrent = run();
  assert.equal(concurrent, first);
  assert.equal(calls, 1);

  release();
  assert.equal(await first, 1);
  assert.equal(await run(), 2);
});

test('a rejected run releases the guard for a retry', async () => {
  let calls = 0;
  const run = createSingleFlight(async () => {
    calls++;
    if (calls === 1) throw new Error('first attempt failed');
    return 'recovered';
  });

  await assert.rejects(run(), /first attempt failed/);
  assert.equal(await run(), 'recovered');
});
