import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFixtureStatus, normalizeFixtureStatus } from '../src/utils/fixtureStatus';

test('fixture status normalization supports provider status strings and objects', () => {
  assert.equal(normalizeFixtureStatus('Match Finished'), 'MATCH_FINISHED');
  assert.equal(normalizeFixtureStatus({ short: 'FT', long: 'Match Finished' }), 'FT');
  assert.equal(normalizeFixtureStatus({ code: 'AET' }), 'AET');
  assert.equal(normalizeFixtureStatus(undefined), undefined);
});

test('fixture status classification only treats explicit final statuses as finished', () => {
  for (const status of ['FT', 'FINISHED', 'AET', 'PEN', 'FINAL', 'COMPLETED']) {
    assert.equal(classifyFixtureStatus(status), 'finished', status);
  }
  assert.equal(classifyFixtureStatus({ short: 'NS' }), 'scheduled');
  assert.equal(classifyFixtureStatus('LIVE'), 'live');
  assert.equal(classifyFixtureStatus('UNKNOWN'), 'unknown');
  assert.equal(classifyFixtureStatus(undefined), 'unknown');
});
