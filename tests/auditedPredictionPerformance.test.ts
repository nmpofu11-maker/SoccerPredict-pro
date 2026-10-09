import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMultiClassBrierScore,
  evaluateAuditedPredictionPerformance,
} from '../src/services/performanceService';
import { PredictionRecord } from '../src/services/predictionLog';
import { HistoricalMatchResult } from '../src/types/soccer';

test('calculateMultiClassBrierScore calculates standard sum and half sum conventions correctly', () => {
  // Hand-calculated example:
  // Probabilities: home: 60% (0.6), draw: 25% (0.25), away: 15% (0.15)
  // Actual outcome: home -> target: yH = 1, yD = 0, yA = 0
  // Squared errors:
  // (0.6 - 1)^2 = (-0.4)^2 = 0.16
  // (0.25 - 0)^2 = 0.0625
  // (0.15 - 0)^2 = 0.0225
  // standardSum = 0.16 + 0.0625 + 0.0225 = 0.245
  // halfSum = 0.245 / 2 = 0.1225
  const result = calculateMultiClassBrierScore(
    { home: 60, draw: 25, away: 15 },
    'home'
  );

  assert.ok(Math.abs(result.standardSum - 0.245) < 1e-9);
  assert.ok(Math.abs(result.halfSum - 0.1225) < 1e-9);
  assert.equal(result.score, result.standardSum);

  const halfResult = calculateMultiClassBrierScore(
    { home: 60, draw: 25, away: 15 },
    'home',
    'half_sum'
  );
  assert.equal(halfResult.score, halfResult.halfSum);
});

test('calculateMultiClassBrierScore evaluates draw and away outcomes correctly', () => {
  // Probabilities: home: 31%, draw: 38%, away: 31%
  // Actual outcome: away -> target: yH = 0, yD = 0, yA = 1
  // Squared errors:
  // (0.31 - 0)^2 = 0.0961
  // (0.38 - 0)^2 = 0.1444
  // (0.31 - 1)^2 = (-0.69)^2 = 0.4761
  // standardSum = 0.0961 + 0.1444 + 0.4761 = 0.7166
  // halfSum = 0.7166 / 2 = 0.3583
  const result = calculateMultiClassBrierScore(
    { home: 31, draw: 38, away: 31 },
    'away'
  );
  assert.ok(Math.abs(result.standardSum - 0.7166) < 1e-9);
  assert.ok(Math.abs(result.halfSum - 0.3583) < 1e-9);
});

test('evaluateAuditedPredictionPerformance excludes predictions created after kickoff', () => {
  const KICKOFF = '2026-10-10T15:00:00.000Z';
  const AFTER_KICKOFF = '2026-10-10T15:01:00.000Z';

  const predictions: PredictionRecord[] = [
    {
      type: 'prediction',
      fixtureId: 'fix_late',
      kickoffTime: KICKOFF,
      league: 'Test League',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      frozenAt: AFTER_KICKOFF,
      probabilities: { home: 50, draw: 30, away: 20 },
      predicted: 'home',
      modelVersion: 'v1',
      inputCoverage: 1,
    },
  ];

  const results: HistoricalMatchResult[] = [
    {
      id: 'fix_late',
      fixture: {} as any,
      homeScore: 2,
      awayScore: 0,
      actualOutcome: 'home',
      date: '2026-10-10',
      notes: 'Settled via SportAPI.ai',
    },
  ];

  const report = evaluateAuditedPredictionPerformance(predictions, results);
  assert.equal(report.evaluatedCount, 0);
  assert.equal(report.excludedCount, 1);
  assert.equal(report.evaluations[0].status, 'excluded');
  assert.match(report.evaluations[0].exclusionReason!, /not strictly before kickoff/);
});

test('evaluateAuditedPredictionPerformance excludes missing immutable predictions and handles unsettled', () => {
  const KICKOFF = '2026-10-10T15:00:00.000Z';
  const BEFORE_KICKOFF = '2026-10-10T14:00:00.000Z';

  const predictions: PredictionRecord[] = [
    {
      type: 'prediction',
      fixtureId: 'fix_pending',
      kickoffTime: KICKOFF,
      league: 'Test League',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      frozenAt: BEFORE_KICKOFF,
      probabilities: { home: 50, draw: 30, away: 20 },
      predicted: 'home',
      modelVersion: 'v1',
      inputCoverage: 1,
    },
  ];

  // No settled result matching fix_pending
  const results: HistoricalMatchResult[] = [
    {
      id: 'fix_unrelated_settled',
      fixture: {} as any,
      homeScore: 1,
      awayScore: 0,
      actualOutcome: 'home',
      date: '2026-10-10',
      notes: 'Settled via SportAPI.ai',
    },
  ];

  const report = evaluateAuditedPredictionPerformance(predictions, results);
  assert.equal(report.evaluatedCount, 0);
  assert.equal(report.pendingCount, 1);
  assert.equal(report.excludedCount, 0);
});

test('evaluateAuditedPredictionPerformance counts valid pre-kickoff predictions exactly once', () => {
  const KICKOFF = '2026-10-10T15:00:00.000Z';
  const BEFORE_KICKOFF = '2026-10-10T14:00:00.000Z';

  const predictions: PredictionRecord[] = [
    {
      type: 'prediction',
      fixtureId: 'fix_1',
      kickoffTime: KICKOFF,
      league: 'Test League',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      frozenAt: BEFORE_KICKOFF,
      probabilities: { home: 60, draw: 25, away: 15 },
      predicted: 'home',
      modelVersion: 'v1',
      inputCoverage: 1,
    },
    // Duplicate entry in the log
    {
      type: 'prediction',
      fixtureId: 'fix_1',
      kickoffTime: KICKOFF,
      league: 'Test League',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      frozenAt: BEFORE_KICKOFF,
      probabilities: { home: 60, draw: 25, away: 15 },
      predicted: 'home',
      modelVersion: 'v1',
      inputCoverage: 1,
    },
  ];

  const results: HistoricalMatchResult[] = [
    {
      id: 'fix_1',
      fixture: {} as any,
      homeScore: 2,
      awayScore: 1,
      actualOutcome: 'home',
      date: '2026-10-10',
      notes: 'Settled via SportAPI.ai',
    },
  ];

  const report = evaluateAuditedPredictionPerformance(predictions, results);
  assert.equal(report.evaluatedCount, 1);
  assert.equal(report.correctCount, 1);
  assert.equal(report.accuracyPct, 100);
  assert.equal(report.excludedCount, 1);
  assert.equal(report.evaluations[1].exclusionReason, 'Duplicate prediction entry in log');
});

test('evaluateAuditedPredictionPerformance rejects invalid probability vectors', () => {
  const KICKOFF = '2026-10-10T15:00:00.000Z';
  const BEFORE_KICKOFF = '2026-10-10T14:00:00.000Z';

  const predictions: PredictionRecord[] = [
    {
      type: 'prediction',
      fixtureId: 'fix_bad_vector',
      kickoffTime: KICKOFF,
      league: 'Test League',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      frozenAt: BEFORE_KICKOFF,
      probabilities: { home: 60, draw: 60, away: 20 }, // sums to 140%
      predicted: 'home',
      modelVersion: 'v1',
      inputCoverage: 1,
    },
  ];

  const results: HistoricalMatchResult[] = [
    {
      id: 'fix_bad_vector',
      fixture: {} as any,
      homeScore: 1,
      awayScore: 0,
      actualOutcome: 'home',
      date: '2026-10-10',
      notes: 'Settled via SportAPI.ai',
    },
  ];

  const report = evaluateAuditedPredictionPerformance(predictions, results);
  assert.equal(report.evaluatedCount, 0);
  assert.equal(report.excludedCount, 1);
  assert.equal(report.evaluations[0].status, 'excluded');
  assert.match(report.evaluations[0].exclusionReason!, /Invalid probability vector/);
});

test('evaluateAuditedPredictionPerformance rejects zero input coverage and enforces 7-point audit checks', () => {
  const KICKOFF = '2026-10-10T15:00:00.000Z';
  const BEFORE_KICKOFF = '2026-10-10T14:00:00.000Z';

  const predictions: PredictionRecord[] = [
    {
      type: 'prediction',
      fixtureId: 'fix_no_coverage',
      kickoffTime: KICKOFF,
      league: 'Test League',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      frozenAt: BEFORE_KICKOFF,
      probabilities: { home: 50, draw: 30, away: 20 },
      predicted: 'home',
      modelVersion: 'v1',
      inputCoverage: 0, // No pre-match features
    },
  ];

  const results: HistoricalMatchResult[] = [
    {
      id: 'fix_no_coverage',
      fixture: {} as any,
      homeScore: 1,
      awayScore: 0,
      actualOutcome: 'home',
      date: '2026-10-10',
      notes: 'Settled via SportAPI.ai',
    },
  ];

  const report = evaluateAuditedPredictionPerformance(predictions, results);
  assert.equal(report.evaluatedCount, 0);
  assert.equal(report.excludedCount, 1);
  assert.equal(report.evaluations[0].status, 'excluded');
  assert.match(report.evaluations[0].exclusionReason!, /lacks verified pre-match feature evidence/);
});

test('evaluateAuditedPredictionPerformance calculates Wilson confidence intervals and respects minSample', () => {
  const KICKOFF = '2026-10-10T15:00:00.000Z';
  const BEFORE_KICKOFF = '2026-10-10T14:00:00.000Z';

  const predictions: PredictionRecord[] = [
    {
      type: 'prediction',
      fixtureId: 'fix_valid_1',
      kickoffTime: KICKOFF,
      league: 'Test League',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      frozenAt: BEFORE_KICKOFF,
      probabilities: { home: 60, draw: 25, away: 15 },
      predicted: 'home',
      modelVersion: 'v1',
      inputCoverage: 0.5,
    },
  ];

  const results: HistoricalMatchResult[] = [
    {
      id: 'fix_valid_1',
      fixture: {} as any,
      homeScore: 2,
      awayScore: 1,
      actualOutcome: 'home',
      date: '2026-10-10',
      notes: 'Settled via SportAPI.ai',
    },
  ];

  const report = evaluateAuditedPredictionPerformance(predictions, results, 30);
  assert.equal(report.evaluatedCount, 1);
  assert.equal(report.correctCount, 1);
  assert.equal(report.accuracyPct, 100);
  assert.equal(report.isSampleSufficient, false); // 1 < 30
  assert.ok(report.accuracy95CiPct !== null);
  assert.ok(report.accuracy95CiPct.low >= 0 && report.accuracy95CiPct.high <= 100);
  assert.equal(report.evaluations[0].status, 'eligible');
  assert.equal(report.evaluations[0].isCorrect, true);
  assert.equal(report.evaluations[0].homeTeam, 'Team A');
  assert.ok(report.evaluations[0].logLoss !== undefined);
  assert.ok(Math.abs(report.evaluations[0].logLoss! - (-Math.log(0.6))) < 1e-9);
  assert.ok(report.meanLogLoss !== null);
  assert.ok(Math.abs(report.meanLogLoss! - (-Math.log(0.6))) < 1e-9);
});



test('audited performance excludes predictions with missing or invalid input coverage', () => {
  const prediction = (fixtureId: string, inputCoverage: number | undefined): PredictionRecord => ({
    type: 'prediction', fixtureId, kickoffTime: '2026-10-10T15:00:00.000Z',
    league: 'Test League', homeTeam: 'Team A', awayTeam: 'Team B',
    frozenAt: '2026-10-10T14:00:00.000Z', probabilities: { home: 60, draw: 25, away: 15 },
    predicted: 'home', modelVersion: 'v1', ...(inputCoverage === undefined ? {} : { inputCoverage }),
  });
  const result = (id: string): HistoricalMatchResult => ({
    id, fixture: {} as any, homeScore: 2, awayScore: 0, actualOutcome: 'home',
    date: '2026-10-10', notes: 'Settled via SportAPI.ai',
  });
  const report = evaluateAuditedPredictionPerformance(
    [prediction('missing_coverage', undefined), prediction('bad_coverage', 1.5)],
    [result('missing_coverage'), result('bad_coverage')],
  );
  assert.equal(report.evaluatedCount, 0);
  assert.equal(report.excludedCount, 2);
  assert.match(report.evaluations[0].exclusionReason || '', /inputCoverage/);
  assert.match(report.evaluations[1].exclusionReason || '', /inputCoverage/);
});

test('audited performance excludes settled results with untrusted provenance, score mismatch, or duplicate IDs', () => {
  const prediction = (fixtureId: string): PredictionRecord => ({
    type: 'prediction', fixtureId, kickoffTime: '2026-10-10T15:00:00.000Z',
    league: 'Test League', homeTeam: 'Team A', awayTeam: 'Team B',
    frozenAt: '2026-10-10T14:00:00.000Z', probabilities: { home: 60, draw: 25, away: 15 },
    predicted: 'home', modelVersion: 'v1', inputCoverage: 0.5,
  });
  const result = (id: string, actualOutcome: 'home' | 'draw' | 'away', notes?: string): HistoricalMatchResult => ({
    id, fixture: {} as any, homeScore: 2, awayScore: 0, actualOutcome,
    date: '2026-10-10', ...(notes ? { notes } : {}),
  });
  const report = evaluateAuditedPredictionPerformance(
    [prediction('no_source'), prediction('score_mismatch'), prediction('duplicate_result')],
    [
      result('no_source', 'home'),
      result('score_mismatch', 'away', 'Settled via SportAPI.ai'),
      result('duplicate_result', 'home', 'Settled via SportAPI.ai'),
      result('duplicate_result', 'home', 'Settled via Sportmonks'),
    ],
  );
  assert.equal(report.evaluatedCount, 0);
  assert.equal(report.excludedCount, 3);
  assert.match(report.evaluations.find((e) => e.fixtureId === 'no_source')?.exclusionReason || '', /provenance/);
  assert.match(report.evaluations.find((e) => e.fixtureId === 'score_mismatch')?.exclusionReason || '', /conflicts with the final score/);
  assert.match(report.evaluations.find((e) => e.fixtureId === 'duplicate_result')?.exclusionReason || '', /Multiple settled result records/);
});
