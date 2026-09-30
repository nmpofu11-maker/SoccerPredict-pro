import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendPrediction, appendOutcome, verifyLog, readLog, summarize, wilsonInterval,
  computeInputCoverage, outcomeFromScores, type LogLine,
} from '../src/services/predictionLog';

const KICK = Date.parse('2026-10-10T15:00:00Z');
const BEFORE = KICK - 3_600_000;
const AFTER = KICK + 3 * 3_600_000;

function tmpLog(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'predlog-')), 'log.jsonl');
}
function pred(id: string, predicted: 'home' | 'draw' | 'away' = 'home', probs = { home: 60, draw: 25, away: 15 }) {
  return {
    fixtureId: id, kickoffTime: new Date(KICK).toISOString(), league: 'L', homeTeam: 'A', awayTeam: 'B',
    probabilities: probs, predicted, modelVersion: 'test', inputCoverage: 1,
  };
}

test('a prediction is accepted only before kickoff and only once per fixture', () => {
  const f = tmpLog();
  assert.equal(appendPrediction(f, pred('m1'), BEFORE).status, 'appended');
  assert.equal(appendPrediction(f, pred('m1', 'away'), BEFORE + 1000).status, 'duplicate');
  assert.equal(appendPrediction(f, pred('m2'), KICK).status, 'late');
  assert.equal(appendPrediction(f, pred('m3'), AFTER).status, 'late');
  assert.equal(readLog(f).lines.length, 1);
});

test('invalid predictions are rejected', () => {
  const f = tmpLog();
  assert.equal(appendPrediction(f, pred('a', 'home', { home: 50, draw: 10, away: 10 }), BEFORE).status, 'invalid');
  assert.equal(appendPrediction(f, pred('b', 'home', { home: NaN, draw: 50, away: 50 }), BEFORE).status, 'invalid');
  assert.equal(appendPrediction(f, { ...pred('c'), kickoffTime: 'not a date' }, BEFORE).status, 'invalid');
  assert.equal(appendPrediction(f, { ...pred('d'), predicted: 'x' as any }, BEFORE).status, 'invalid');
  assert.equal(readLog(f).lines.length, 0);
});

test('an outcome needs an existing prediction, at/after kickoff, once, with valid scores', () => {
  const f = tmpLog();
  assert.equal(appendOutcome(f, { fixtureId: 'm1', homeScore: 1, awayScore: 0 }, AFTER).status, 'no_prediction');
  appendPrediction(f, pred('m1'), BEFORE);
  assert.equal(appendOutcome(f, { fixtureId: 'm1', homeScore: 1, awayScore: 0 }, BEFORE + 10).status, 'early');
  assert.equal(appendOutcome(f, { fixtureId: 'm1', homeScore: -1, awayScore: 0 }, AFTER).status, 'invalid');
  assert.equal(appendOutcome(f, { fixtureId: 'm1', homeScore: 1.5, awayScore: 0 }, AFTER).status, 'invalid');
  assert.equal(appendOutcome(f, { fixtureId: 'm1', homeScore: 2, awayScore: 2 }, AFTER).status, 'appended');
  assert.equal(appendOutcome(f, { fixtureId: 'm1', homeScore: 0, awayScore: 5 }, AFTER + 1).status, 'duplicate');
  const out = readLog(f).lines.find((l) => l.type === 'outcome') as any;
  assert.equal(out.actual, 'draw'); // derived from the scores, never taken on trust
});

test('the log only grows: earlier bytes are never changed', () => {
  const f = tmpLog();
  appendPrediction(f, pred('m1'), BEFORE);
  const snapshot = fs.readFileSync(f, 'utf8');
  appendPrediction(f, pred('m2'), BEFORE);
  appendOutcome(f, { fixtureId: 'm1', homeScore: 1, awayScore: 0 }, AFTER);
  assert.ok(fs.readFileSync(f, 'utf8').startsWith(snapshot));
  assert.equal(verifyLog(f).ok, true);
});

test('the module contains no code path that rewrites or deletes the log', () => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'services', 'predictionLog.ts'), 'utf8');
  assert.doesNotMatch(src, /writeFileSync|rmSync|unlinkSync|truncate|renameSync|copyFileSync/);
});

test('verifyLog detects edited, deleted and reordered lines', () => {
  const build = () => {
    const f = tmpLog();
    for (const id of ['m1', 'm2', 'm3']) appendPrediction(f, pred(id), BEFORE);
    return f;
  };
  // edit a probability
  let f = build();
  let rows = fs.readFileSync(f, 'utf8').trim().split('\n');
  rows[1] = rows[1].replace('"home":60', '"home":61');
  fs.writeFileSync(f, rows.join('\n') + '\n');
  let v = verifyLog(f);
  assert.equal(v.ok, false); assert.equal(v.brokenAtSeq, 2);
  // delete a line
  f = build();
  rows = fs.readFileSync(f, 'utf8').trim().split('\n');
  fs.writeFileSync(f, [rows[0], rows[2]].join('\n') + '\n');
  assert.equal(verifyLog(f).ok, false);
  // reorder
  f = build();
  rows = fs.readFileSync(f, 'utf8').trim().split('\n');
  fs.writeFileSync(f, [rows[0], rows[2], rows[1]].join('\n') + '\n');
  assert.equal(verifyLog(f).ok, false);
  // garbage line
  f = build();
  fs.appendFileSync(f, 'not json\n');
  assert.equal(verifyLog(f).ok, false);
});

test('summarize: withholds numbers below the minimum sample', () => {
  const f = tmpLog();
  for (let i = 0; i < 5; i++) {
    appendPrediction(f, pred(`m${i}`), BEFORE);
    appendOutcome(f, { fixtureId: `m${i}`, homeScore: 1, awayScore: 0 }, AFTER);
  }
  const s = summarize(readLog(f).lines, 30);
  assert.equal(s.scored, 5);
  assert.equal(s.overall.reportable, false);
  assert.equal(s.overall.accuracyPct, null);
  assert.equal(s.overall.brier, null);
});

test('summarize: exact accuracy, Brier and baselines on a constructed set', () => {
  const f = tmpLog();
  // 40 fixtures: predict home at 60/25/15. 24 home wins, 8 draws, 8 away wins.
  const results: Array<[number, number]> = [
    ...Array(24).fill([1, 0]), ...Array(8).fill([1, 1]), ...Array(8).fill([0, 1]),
  ];
  results.forEach(([h, a], i) => {
    appendPrediction(f, pred(`m${i}`), BEFORE);
    appendOutcome(f, { fixtureId: `m${i}`, homeScore: h, awayScore: a }, AFTER);
  });
  const s = summarize(readLog(f).lines, 30);
  assert.equal(s.overall.reportable, true);
  assert.equal(s.overall.accuracyPct, 60);
  assert.equal(s.overall.alwaysHomeAccuracyPct, 60);
  assert.equal(s.overall.mostCommonOutcomeAccuracyPct, 60);
  // Brier: home win = (.4^2 + .25^2 + .15^2)=0.245 ; draw = (.6^2+.75^2+.15^2)=0.945 ; away = (.6^2+.25^2+.85^2)=1.145
  const expected = (24 * 0.245 + 8 * 0.945 + 8 * 1.145) / 40;
  assert.ok(Math.abs(s.overall.brier! - expected) < 1e-9);
  assert.ok(s.overall.accuracy95CiPct!.low < 60 && s.overall.accuracy95CiPct!.high > 60);
});

test('summarize: a prediction not frozen before kickoff is excluded even if present in the file', () => {
  const f = tmpLog();
  appendPrediction(f, pred('ok'), BEFORE);
  appendOutcome(f, { fixtureId: 'ok', homeScore: 1, awayScore: 0 }, AFTER);
  const lines = readLog(f).lines as any[];
  const cheat: any = {
    ...lines[0], fixtureId: 'late', seq: 3, frozenAt: new Date(AFTER).toISOString(),
  };
  const cheatOut: any = { ...lines[1], fixtureId: 'late', seq: 4 };
  const s = summarize([...lines, cheat, cheatOut] as LogLine[], 1);
  assert.equal(s.excludedNotFrozenBeforeKickoff, 1);
  assert.equal(s.scored, 1);
});

test('summarize: pending predictions are not scored', () => {
  const f = tmpLog();
  appendPrediction(f, pred('p1'), BEFORE);
  const s = summarize(readLog(f).lines, 1);
  assert.equal(s.pending, 1);
  assert.equal(s.scored, 0);
});

test('helpers: wilson interval, outcome from scores, input coverage', () => {
  const w = wilsonInterval(50, 100)!;
  assert.ok(w.low > 0.40 && w.low < 0.41 && w.high > 0.59 && w.high < 0.60);
  assert.equal(wilsonInterval(0, 0), null);
  assert.equal(outcomeFromScores(2, 1), 'home');
  assert.equal(outcomeFromScores(0, 0), 'draw');
  assert.equal(outcomeFromScores(0, 3), 'away');
  const full = { leagueRank: 3, points: 10, avgPossession: 50, avgShotsOnTarget: 4, form: ['W'] };
  assert.equal(computeInputCoverage({ homeTeam: full, awayTeam: full }), 1);
  assert.equal(computeInputCoverage({ homeTeam: full, awayTeam: { ...full, avgPossession: null, form: [] } }), 0.8);
  assert.equal(computeInputCoverage({}), 0);
});
