import test from 'node:test';
import assert from 'node:assert/strict';
import { isSportApiAiFixtureFinished } from '../src/services/serverSportApiAi';

test('SportAPI.ai settlement requires an explicit completed status', () => {
  assert.equal(isSportApiAiFixtureFinished({ status: 'FINISHED', home_score: 2, away_score: 1 }), true);
  assert.equal(isSportApiAiFixtureFinished({ status: 'FT', score: { home: 1, away: 0 } }), true);
  assert.equal(isSportApiAiFixtureFinished({ state: { short: 'AET' }, score: { home: 2, away: 2 } }), true);
  assert.equal(isSportApiAiFixtureFinished({ status: { name: 'Match Finished' } }), true);
});

test('SportAPI.ai settlement does not infer completion from provisional or live scores', () => {
  assert.equal(isSportApiAiFixtureFinished({ status: 'SCHEDULED', home_score: 0, away_score: 0 }), false);
  assert.equal(isSportApiAiFixtureFinished({ score: { home: 3, away: 0 } }), false);
  assert.equal(isSportApiAiFixtureFinished({ status: 'LIVE', home_score: 2, away_score: 1 }), false);
  assert.equal(isSportApiAiFixtureFinished({ state: 'IN PLAY', score: { home: 1, away: 0 } }), false);
  assert.equal(isSportApiAiFixtureFinished({ status: 'UNKNOWN', home_score: 4, away_score: 0 }), false);
  assert.equal(isSportApiAiFixtureFinished(null), false);
});
