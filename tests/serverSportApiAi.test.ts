import test from 'node:test';
import assert from 'node:assert/strict';
import { getSportApiAiScores, isSportApiAiFixtureFinished, isSportApiAiFixtureIdentityMatch } from '../src/services/serverSportApiAi';

test('requires an explicit completed status; scores alone are insufficient', () => {
  assert.equal(isSportApiAiFixtureFinished({ home_score: 2, away_score: 1 }), false);
  assert.equal(isSportApiAiFixtureFinished({ score: { home: 0, away: 0 } }), false);
  assert.equal(isSportApiAiFixtureFinished({ status: 'LIVE', home_score: 2, away_score: 1 }), false);
});

test('recognizes explicit final status variants from provider payloads', () => {
  assert.equal(isSportApiAiFixtureFinished({ status: 'FINISHED' }), true);
  assert.equal(isSportApiAiFixtureFinished({ status: 'full_time' }), true);
  assert.equal(isSportApiAiFixtureFinished({ status: 'PENS' }), true);
  assert.equal(isSportApiAiFixtureFinished({ fixture: { status: { short: 'FT' } } }), true);
  assert.equal(isSportApiAiFixtureFinished({ state: { name: 'Match Finished' } }), true);
  assert.equal(isSportApiAiFixtureFinished({ status: 'SCHEDULED', score: { home: 0, away: 0 } }), false);
});

test('rejects negative and fractional final scores', () => {
  assert.deepEqual(getSportApiAiScores({ status: 'FT', home_score: -1, away_score: 0 }), {
    home: null, away: null, outcome: null,
  });
  assert.deepEqual(getSportApiAiScores({ status: 'FT', score: { home: 1.5, away: 0 } }), {
    home: null, away: null, outcome: null,
  });
});

test('direct fixture lookup requires the exact provider ID and exact home/away identities', () => {
  const expected = { id: 14414684, home_team: 'Palmeiras', away_team: 'Fluminense' };
  assert.equal(isSportApiAiFixtureIdentityMatch(expected, '14414684', 'Palmeiras', 'Fluminense'), true);
  assert.equal(isSportApiAiFixtureIdentityMatch({ ...expected, id: 14414683 }, '14414684', 'Palmeiras', 'Fluminense'), false);
  assert.equal(isSportApiAiFixtureIdentityMatch({ ...expected, away_team: 'Santos' }, '14414684', 'Palmeiras', 'Fluminense'), false);
  assert.equal(isSportApiAiFixtureIdentityMatch({ ...expected, home_team: 'Sporting Palmeiras' }, '14414684', 'Palmeiras', 'Fluminense'), false);
});
