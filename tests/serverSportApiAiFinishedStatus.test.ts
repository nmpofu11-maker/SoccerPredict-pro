import test from 'node:test';
import assert from 'node:assert/strict';
import { isSportApiAiFixtureFinished } from '../src/services/serverSportApiAi';

test('SportAPI.ai does not treat a scheduled fixture score as a settled result', () => {
  assert.equal(isSportApiAiFixtureFinished({
    status: 'SCHEDULED',
    home_score: 0,
    away_score: 0,
  }), false);

  assert.equal(isSportApiAiFixtureFinished({
    status: 'NS',
    score: { home: 0, away: 0 },
  }), false);

  assert.equal(isSportApiAiFixtureFinished({
    status: 'LIVE',
    home_score: 1,
    away_score: 0,
  }), false);

  assert.equal(isSportApiAiFixtureFinished({
    home_score: 2,
    away_score: 0,
  }), false);
});

test('SportAPI.ai recognizes explicit completed status strings and status objects', () => {
  for (const status of ['FINISHED', 'FT', 'AET', 'PEN', 'FINAL', 'COMPLETED']) {
    assert.equal(isSportApiAiFixtureFinished({ status }), true, status);
  }

  assert.equal(isSportApiAiFixtureFinished({
    status: { short: 'FT', long: 'Match Finished' },
    score: { home: 2, away: 0 },
  }), true);

  assert.equal(isSportApiAiFixtureFinished({
    fixture: { status: { short: 'AET' } },
  }), true);
});

test('SportAPI.ai rejects unknown or malformed fixture records as unfinished', () => {
  assert.equal(isSportApiAiFixtureFinished(null), false);
  assert.equal(isSportApiAiFixtureFinished(undefined), false);
  assert.equal(isSportApiAiFixtureFinished({ status: 'UNKNOWN', home_score: 4, away_score: 1 }), false);
});
