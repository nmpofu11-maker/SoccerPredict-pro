import test from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayPredictionProbabilities } from '../src/utils/predictionDisplay';

test('withholds neutral-prior percentages when verified evidence is absent', () => {
  assert.deepEqual(getDisplayPredictionProbabilities({
    hasEvidence: false,
    homeWinPct: 34.8,
    drawPct: 30.4,
    awayWinPct: 34.8,
  }), { home: null, draw: null, away: null });
});

test('shows finite fixture probabilities when verified evidence exists', () => {
  assert.deepEqual(getDisplayPredictionProbabilities({
    hasEvidence: true,
    homeWinPct: 51.2,
    drawPct: 26.4,
    awayWinPct: 22.4,
  }), { home: 51.2, draw: 26.4, away: 22.4 });
});

test('does not display non-finite probabilities even when evidence exists', () => {
  assert.deepEqual(getDisplayPredictionProbabilities({
    hasEvidence: true,
    homeWinPct: Number.NaN,
    drawPct: 30,
    awayWinPct: Number.POSITIVE_INFINITY,
  }), { home: null, draw: 30, away: null });
});
