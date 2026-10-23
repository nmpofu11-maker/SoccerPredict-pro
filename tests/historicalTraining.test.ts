import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingSet, type ImportedMatchRow } from '../src/services/historicalImport';
import { buildPredictionTeamMatrices, evaluateHistoricalModelOnHoldout, trainOnHistoricalResults, TRAIN_LIMITS } from '../src/services/historicalTraining';
import { trainMultipleEpochs } from '../src/engine/selfLearningEngine';
import { DEFAULT_ENGINE_WEIGHTS } from '../src/engine/rulesEngine';
import { normalizeTeamKey } from '../src/engine/teamIntelligenceMatrix';

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

test('active imported-history evaluation reports scored holdout matches instead of fake zero metrics', () => {
  const { results } = buildTrainingSet(synthetic(900));
  const report = evaluateHistoricalModelOnHoldout(results, DEFAULT_ENGINE_WEIGHTS);
  assert.equal(report.status, 'ok');
  assert.ok(report.holdoutSize > 0);
  assert.ok(report.evaluatedMatches > 0);
  assert.ok(report.correctCount >= 0 && report.correctCount <= report.evaluatedMatches);
  assert.notEqual(report.accuracyPct, null);
  assert.notEqual(report.brierLoss, null);
  assert.notEqual(report.baselineAccuracyPct, null);
  assert.notEqual(report.baselineBrierLoss, null);
  assert.ok((report.brierLoss ?? 0) > 0 && (report.brierLoss ?? 0) <= 1);
  assert.ok(report.matches.length > 0 && report.matches.length <= 100);
  assert.ok(report.matches.every(match => Boolean(match.fixture.homeTeam.name && match.fixture.awayTeam.name)));
});

test('normalizes common archive/provider team aliases without fuzzy matching', () => {
  assert.equal(normalizeTeamKey('Man City'), 'Manchester City');
  assert.equal(normalizeTeamKey('Manchester City'), 'Manchester City');
  assert.equal(normalizeTeamKey('Paris SG'), 'Paris Saint-Germain');
  assert.equal(normalizeTeamKey('FC Nantes'), 'Nantes');
  assert.equal(normalizeTeamKey('Mamelodi Sundowns'), 'Mamelodi Sundowns');
});

test('synthesizes sample-backed profiles from imported history but does not invent samples for unsupported clubs', () => {
  const { results } = buildTrainingSet(synthetic(900));
  const matrices = buildPredictionTeamMatrices(results);

  assert.ok(matrices.T0.sample_size_matches >= 3, 'a team with sufficient imported matches should receive an observed profile');
  assert.ok(matrices.T0.learned_coefficients.home_advantage_multiplier >= 1.02);
  assert.equal(matrices['Mamelodi Sundowns'].sample_size_matches, 0, 'a club absent from this imported archive must remain a baseline with no sample');
});

test('uses match-point variance for volatility and keeps unsupported fatigue coefficients at baseline', () => {
  const { results } = buildTrainingSet(synthetic(900));
  const stableForT0 = results.map((match) => {
    if (match.fixture.homeTeam.name === 'T0') return { ...match, actualOutcome: 'home' as const };
    if (match.fixture.awayTeam.name === 'T0') return { ...match, actualOutcome: 'away' as const };
    return match;
  });
  const alternatingForT0 = results.map((match, index) => {
    if (match.fixture.homeTeam.name === 'T0') return { ...match, actualOutcome: index % 2 === 0 ? 'home' as const : 'away' as const };
    if (match.fixture.awayTeam.name === 'T0') return { ...match, actualOutcome: index % 2 === 0 ? 'away' as const : 'home' as const };
    return match;
  });

  const stable = buildPredictionTeamMatrices(stableForT0).T0;
  const volatile = buildPredictionTeamMatrices(alternatingForT0).T0;
  assert.ok(stable && volatile);
  assert.equal(stable.fatigue_sample_matches, 0, 'the imported results archive does not contain sourced 72-hour schedule observations');
  assert.equal(stable.learned_coefficients.fatigue_penalty_modifier, 0.15, 'fatigue coefficient must stay at its baseline without supporting samples');
  assert.ok(stable.learned_coefficients.volatility_index < volatile.learned_coefficients.volatility_index,
    'consistent points per appearance should be less volatile than mixed outcomes');
});

test('active imported-history evaluation marks absent holdout evidence unavailable, not zero', () => {
  const report = evaluateHistoricalModelOnHoldout([], DEFAULT_ENGINE_WEIGHTS);
  assert.equal(report.status, 'insufficient_data');
  assert.equal(report.accuracyPct, null);
  assert.equal(report.brierLoss, null);
  assert.equal(report.evaluatedMatches, 0);
  assert.match(report.note, /unavailable, not zero/);
});

test('training loss history retains sub-mill precision for optimizer comparisons', () => {
  const { results } = buildTrainingSet(synthetic(900));
  const out = trainMultipleEpochs(DEFAULT_ENGINE_WEIGHTS, 2, results);
  assert.ok(
    out.lossHistory.some(loss => Math.abs(loss * 1000 - Math.round(loss * 1000)) > 1e-8),
    'loss history must retain more than the three-decimal display precision',
  );
});

test('training weights are invariant to outcome changes confined to the chronological holdout', () => {
  const { results } = buildTrainingSet(synthetic(900));
  const split = Math.max(1, results.length - Math.max(1, Math.floor(results.length * 0.2)));
  assert.ok(split > 1 && split < results.length);

  const changedHoldout = results.map((match, index) => {
    if (index < split) return match;
    const reversed: 'home' | 'draw' | 'away' = match.actualOutcome === 'home'
      ? 'away'
      : match.actualOutcome === 'away'
      ? 'home'
      : 'home';
    return { ...match, actualOutcome: reversed };
  });

  const original = trainMultipleEpochs(DEFAULT_ENGINE_WEIGHTS, 2, results);
  const changed = trainMultipleEpochs(DEFAULT_ENGINE_WEIGHTS, 2, changedHoldout);
  assert.deepEqual(
    changed.finalWeights,
    original.finalWeights,
    'validation-only outcome edits must not affect fitted weights'
  );
});

test('epoch and size caps are enforced', () => {
  const { results } = buildTrainingSet(synthetic(900));
  const out = trainOnHistoricalResults(results, { epochs: 9999, maxMatches: 400 });
  assert.equal(out.ok, true);
  assert.ok(out.epochs <= TRAIN_LIMITS.maxEpochs);
  assert.ok(out.trainedOn + out.holdoutSize <= 400);
});
