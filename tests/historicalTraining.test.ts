import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingSet, type ImportedMatchRow } from '../src/services/historicalImport';
import { trainOnHistoricalResults, TRAIN_LIMITS } from '../src/services/historicalTraining';

function synthetic(n: number): ImportedMatchRow[] {
  let seed = 11;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const rows: ImportedMatchRow[] = [];
  let day = Date.UTC(2020, 7, 1);
  for (let i = 0; i < n; i++) {
    const h = i % 10, a = (i * 3 + 1) % 10;
    if (h === a) continue;
    const d = new Date(day + Math.floor(i / 5) * 86_400_000 * 3).toISOString().slice(0, 10);
    const hg = Math.floor(rnd() * 4), ag = Math.floor(rnd() * 3);
    rows.push({ key: `L|${d}|T${h}|T${a}|${i}`, date: d, league: 'L', home: `T${h}`, away: `T${a}`, hg, ag, src: 's.csv' });
  }
  return rows;
}

test('refuses to train on too little evidence instead of producing meaningless weights', () => {
  const { results } = buildTrainingSet(synthetic(60));
  const out = trainOnHistoricalResults(results);
  assert.equal(out.ok, false);
  assert.match(out.reason || '', /need at least/);
  assert.equal(out.proposedWeights, undefined);
});

test('training reports holdout metrics AND a no-knowledge baseline, and only proposes weights', () => {
  const { results } = buildTrainingSet(synthetic(900));
  const out = trainOnHistoricalResults(results, { epochs: 1 });
  assert.equal(out.ok, true);
  assert.ok(out.holdoutSize > 0 && out.trainedOn > 0);
  assert.ok(out.baselines && ['home', 'draw', 'away'].includes(out.baselines.alwaysMostCommonOutcome.outcome));
  assert.ok(out.proposedWeights);
  assert.match(out.note, /PROPOSED only/);
  // holdout is strictly the most recent matches
  assert.equal(out.trainedOn + out.holdoutSize, out.usableMatches);
});

test('epoch and size caps are enforced', () => {
  const { results } = buildTrainingSet(synthetic(900));
  const out = trainOnHistoricalResults(results, { epochs: 9999, maxMatches: 400 });
  assert.equal(out.ok, true);
  assert.ok(out.epochs <= TRAIN_LIMITS.maxEpochs);
  assert.ok(out.trainedOn + out.holdoutSize <= 400);
});
