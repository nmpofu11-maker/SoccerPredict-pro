import test from 'node:test';
import assert from 'node:assert/strict';
import { getSportApiAiScores } from '../src/services/serverSportApiAi';

test('extracts numeric home_score and away_score', () => {
  assert.deepEqual(getSportApiAiScores({ home_score: 2, away_score: 1 }), {
    home: 2, away: 1, outcome: 'home',
  });
});

test('extracts goals with numeric strings and recognizes a draw', () => {
  assert.deepEqual(getSportApiAiScores({ goals: { home: '0', away: '0' } }), {
    home: 0, away: 0, outcome: 'draw',
  });
});

test('extracts fulltime score shape', () => {
  assert.deepEqual(getSportApiAiScores({
    score: { fulltime: { home: 1, away: 3 } },
  }), { home: 1, away: 3, outcome: 'away' });
});

test('extracts camel-case fullTime score shape', () => {
  assert.deepEqual(getSportApiAiScores({
    score: { fullTime: { home: 3, away: 1 } },
  }), { home: 3, away: 1, outcome: 'home' });
});

test('extracts CURRENT participant scores from a scores array', () => {
  assert.deepEqual(getSportApiAiScores({
    scores: [
      { description: 'CURRENT', score: { participant: 'home', goals: 2 } },
      { description: 'CURRENT', score: { participant: 'away', goals: 2 } },
    ],
  }), { home: 2, away: 2, outcome: 'draw' });
});

test('does not mistake missing scores for a 0-0 result', () => {
  assert.deepEqual(getSportApiAiScores({ home_score: null, away_score: null }), {
    home: null, away: null, outcome: null,
  });
});

test('does not invent scores for malformed input', () => {
  assert.deepEqual(getSportApiAiScores(null), {
    home: null, away: null, outcome: null,
  });
});
