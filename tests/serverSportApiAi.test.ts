import test from 'node:test';
import assert from 'node:assert/strict';
import { isSportApiAiFixtureFinished } from '../src/services/serverSportApiAi';

test('requires an explicit completed status; scores alone are insufficient', () => {
  assert.equal(isSportApiAiFixtureFinished({ home_score: 2, away_score: 1 }), false);
  assert.equal(isSportApiAiFixtureFinished({ score: { home: 0, away: 0 } }), false);
  assert.equal(isSportApiAiFixtureFinished({ status: 'LIVE', home_score: 2, away_score: 1 }), false);
});

test('recognizes explicit final status variants from provider payloads', () => {
  assert.equal(isSportApiAiFixtureFinished({ status: 'FINISHED' }), true);
  assert.equal(isSportApiAiFixtureFinished({ status: 'full_time' }), true);
  assert.equal(isSportApiAiFixtureFinished({ fixture: { status: { short: 'FT' } } }), true);
  assert.equal(isSportApiAiFixtureFinished({ state: { name: 'Match Finished' } }), true);
  assert.equal(isSportApiAiFixtureFinished({ status: 'SCHEDULED', score: { home: 0, away: 0 } }), false);
});
