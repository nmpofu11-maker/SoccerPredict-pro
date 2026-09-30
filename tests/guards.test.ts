import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBlockedAddress } from '../src/services/manualDataService';
import { HISTORICAL_MATCH_RESULTS } from '../src/data/historical_results';
import { evaluateFixturePrediction } from '../src/engine/rulesEngine';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

test('rules engine source never references odds or bookmaker data', () => {
  const src = read('src/engine/rulesEngine.ts');
  assert.doesNotMatch(src, /odds|implied|bookmaker|overround|hollywoodbets/i);
});

test('predictions are identical with and without odds on the fixture', () => {
  const sample = (HISTORICAL_MATCH_RESULTS as any[]).slice(0, 30);
  for (const r of sample) {
    const base = evaluateFixturePrediction(r.fixture, 'none') as any;
    const withOdds = evaluateFixturePrediction(
      { ...r.fixture, odds: { home: 1.2, draw: 9, away: 15 }, impliedProbabilities: { home: 0.8, draw: 0.1, away: 0.1 } },
      'none'
    ) as any;
    assert.deepEqual(
      [withOdds?.homeWinPct, withOdds?.drawPct, withOdds?.awayWinPct, withOdds?.predictedWinner],
      [base?.homeWinPct, base?.drawPct, base?.awayWinPct, base?.predictedWinner],
      `odds changed the prediction for ${r.id}`
    );
  }
});

test('SSRF filter blocks private, loopback, link-local and mapped addresses', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '[::1]', 'not-an-ip',
  ]) {
    assert.equal(isBlockedAddress(ip), true, `${ip} should be blocked`);
  }
});

test('SSRF filter allows ordinary public addresses', () => {
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) {
    assert.equal(isBlockedAddress(ip), false, `${ip} should be allowed`);
  }
});

test('no hardcoded headline accuracy figure in the UI', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, f.name);
      if (f.isDirectory()) walk(rel);
      else if (/\.(tsx?|ts)$/.test(f.name) && /76\.7/.test(read(rel))) offenders.push(rel);
    }
  };
  walk('src');
  assert.deepEqual(offenders, []);
});

test('committed learning state, if present, is untrained with auto-learning off', () => {
  const p = path.join(root, 'data', 'persisted_learning_state.json');
  if (!fs.existsSync(p)) return;
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(s.totalEpochsTrained ?? 0, 0);
  assert.equal(s.isAutoLearningEnabled ?? false, false);
});
