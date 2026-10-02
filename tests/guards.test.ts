import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBlockedAddress } from '../src/services/manualDataService';
import { HISTORICAL_MATCH_RESULTS } from '../src/data/historical_results';
import { evaluateFixturePrediction } from '../src/engine/rulesEngine';
import { verifyAndSanitizeFixture } from '../src/services/dataIntegrityValidator';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

test('rules engine source never references odds or bookmaker data', () => {
  const src = read('src/engine/rulesEngine.ts');
  assert.doesNotMatch(src, /odds|implied|bookmaker|overround|hollywoodbets/i);
});

test('predictions are identical with and without odds on a real-data-shaped fixture', () => {
  const fixture: any = {
    id: 'odds-independence',
    kickoffTime: '2026-10-10T15:00:00Z',
    league: 'Test League',
    venue: 'Test Ground',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: { id: 'h', name: 'Home FC', shortName: 'HOM', leagueRank: 2, points: 30, form: ['W', 'W', 'D', 'L', 'W'], formSource: 'API_FOOTBALL', avgPossession: null, avgShotsOnTarget: null },
    awayTeam: { id: 'a', name: 'Away FC', shortName: 'AWA', leagueRank: 8, points: 22, form: ['D', 'L', 'W', 'D', 'L'], formSource: 'API_FOOTBALL', avgPossession: null, avgShotsOnTarget: null },
    h2h: null,
  };
  const base = evaluateFixturePrediction(fixture, 'none') as any;
  const withOdds = evaluateFixturePrediction(
    { ...fixture, odds: { home: 1.2, draw: 9, away: 15 }, impliedProbabilities: { home: 0.8, draw: 0.1, away: 0.1 } },
    'none'
  ) as any;
  assert.deepEqual(
    [withOdds?.homeWinPct, withOdds?.drawPct, withOdds?.awayWinPct, withOdds?.predictedWinner],
    [base?.homeWinPct, base?.drawPct, base?.awayWinPct, base?.predictedWinner],
  );
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


test('validator preserves valid observed standings without claiming official verification', () => {
  const fixture: any = {
    id: 'fixture-1',
    kickoffTime: '2026-10-10T15:00:00Z',
    league: 'Test League',
    motivation: 'regular',
    isHighStakes: false,
    homeTeam: { id: 'h', name: 'Home', shortName: 'HOM', leagueRank: 2, points: 30, standingsSource: 'API_FOOTBALL', form: ['W'], formSource: 'API_FOOTBALL', avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    awayTeam: { id: 'a', name: 'Away', shortName: 'AWA', leagueRank: 18, points: 12, standingsSource: 'API_FOOTBALL', form: ['L'], formSource: 'API_FOOTBALL', avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    h2h: null,
  };
  const { fixture: clean, stamp } = verifyAndSanitizeFixture(fixture);
  assert.equal(clean.homeTeam.leagueRank, 2);
  assert.equal(clean.awayTeam.leagueRank, 18);
  assert.equal(clean.homeTeam.points, 30);
  assert.equal(clean.awayTeam.points, 12);
  assert.equal(clean.motivation, 'regular');
  assert.equal(stamp.status, 'UNVERIFIED');
  assert.equal(clean.isStandingsVerified, false);
});


test('validator converts legacy all-zero H2H placeholders to unavailable data', () => {
  const fixture: any = {
    id: 'legacy-h2h-placeholder',
    kickoffTime: '2026-10-10T15:00:00Z',
    league: 'Test League',
    motivation: 'regular',
    isHighStakes: false,
    homeTeam: { id: 'h', name: 'Home', shortName: 'HOM', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    awayTeam: { id: 'a', name: 'Away', shortName: 'AWA', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    h2h: { homeWins: 0, draws: 0, awayWins: 0, totalLast5: 0, scoresLast5: [] },
  };
  const { fixture: clean } = verifyAndSanitizeFixture(fixture);
  assert.equal(clean.h2h, null);
});


test('validator removes legacy standings and advanced metrics without provider provenance', () => {
  const fixture: any = {
    id: 'legacy-unproven-metrics',
    kickoffTime: '2026-10-10T15:00:00Z',
    league: 'Test League',
    motivation: 'regular',
    isHighStakes: false,
    homeTeam: {
      id: 'h', name: 'Home', shortName: 'HOM', leagueRank: 1, points: 40, form: [],
      avgPossession: 72, avgShotsOnTarget: 8, lastSeasonRank: 1,
      totalSquadValueEur: 900, avgMatchRating: 7.2, expectedGoalsAvg: 2.4,
      isHomeDominant: true, hasTopTierAwayForm: false, hasMidweekFatigue72h: true,
    },
    awayTeam: {
      id: 'a', name: 'Away', shortName: 'AWA', leagueRank: 20, points: 8, form: [],
      avgPossession: 28, avgShotsOnTarget: 2, lastSeasonRank: 18,
      totalSquadValueEur: 80, avgMatchRating: 6.1, expectedGoalsAvg: 0.7,
      isHomeDominant: false, hasTopTierAwayForm: true, hasMidweekFatigue72h: false,
    },
    h2h: null,
  };
  const { fixture: clean, stamp } = verifyAndSanitizeFixture(fixture);
  assert.equal(clean.homeTeam.leagueRank, null);
  assert.equal(clean.awayTeam.leagueRank, null);
  assert.equal(clean.homeTeam.avgPossession, null);
  assert.equal(clean.awayTeam.avgShotsOnTarget, null);
  assert.equal(clean.homeTeam.lastSeasonRank, undefined);
  assert.equal(clean.homeTeam.totalSquadValueEur, undefined);
  assert.equal(clean.homeTeam.expectedGoalsAvg, undefined);
  assert.equal(clean.homeTeam.isHomeDominant, false);
  assert.equal(clean.awayTeam.hasTopTierAwayForm, false);
  assert.equal(clean.homeTeam.hasMidweekFatigue72h, false);
  assert.equal(stamp.status, 'AUTO_REPAIRED');
});

test('prediction engine ignores numeric team stats that have no source provenance', () => {
  const fixture: any = {
    id: 'unproven-stats',
    kickoffTime: '2026-10-10T15:00:00Z',
    league: 'Premier League',
    motivation: 'regular',
    isHighStakes: false,
    homeTeam: { id: 'h', name: 'Home', shortName: 'HOM', leagueRank: 1, points: 40, form: [], avgPossession: 80, avgShotsOnTarget: 10, totalSquadValueEur: 1000 },
    awayTeam: { id: 'a', name: 'Away', shortName: 'AWA', leagueRank: 20, points: 8, form: [], avgPossession: 20, avgShotsOnTarget: 1, totalSquadValueEur: 10 },
    h2h: { homeWins: 5, draws: 0, awayWins: 0, totalLast5: 5, scoresLast5: ['5-0', '4-0', '3-0', '2-0', '1-0'] },
  };
  const prediction = evaluateFixturePrediction(fixture, 'none');
  assert.ok(prediction.appliedRules.some((rule) => rule.ruleName === 'Team Data Sufficiency Guard'));
  assert.ok(!prediction.appliedRules.some((rule) => /H2H|Position Gap|Squad Market Value|Shot\/Possession/.test(rule.ruleName)));
  assert.ok(Math.abs(prediction.homeWinPct - prediction.awayWinPct) < 0.01);
});
