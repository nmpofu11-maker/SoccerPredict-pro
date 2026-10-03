import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFixturePrediction } from '../src/engine/rulesEngine';
import type { MatchFixture } from '../src/types/soccer';

function baseFixture(): MatchFixture {
  return {
    id: 'feature-perturbation',
    kickoffTime: '2026-10-05T18:00:00.000Z',
    league: 'English Premier League',
    competition: 'English Premier League',
    venue: 'Test Stadium',
    round: 'Test',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: {
      id: 'home',
      name: 'Home United',
      shortName: 'HOM',
      leagueRank: 8,
      points: 12,
      standingsSource: 'SPORTAPI_AI',
      form: ['W', 'W', 'D', 'L', 'W'],
      formSource: 'SPORTAPI_AI',
      avgPossession: null,
      avgShotsOnTarget: null,
    },
    awayTeam: {
      id: 'away',
      name: 'Away United',
      shortName: 'AWA',
      leagueRank: 10,
      points: 10,
      standingsSource: 'SPORTAPI_AI',
      form: ['L', 'D', 'W', 'L', 'D'],
      formSource: 'SPORTAPI_AI',
      avgPossession: null,
      avgShotsOnTarget: null,
    },
    h2h: null,
  };
}

function probabilities(fixture: MatchFixture) {
  const p = evaluateFixturePrediction(fixture, 'none');
  return { home: p.homeWinPct, draw: p.drawPct, away: p.awayWinPct };
}

function changed(a: ReturnType<typeof probabilities>, b: ReturnType<typeof probabilities>): boolean {
  return a.home !== b.home || a.draw !== b.draw || a.away !== b.away;
}

test('controlled feature perturbations change prediction output', () => {
  const base = baseFixture();
  const baseP = probabilities(base);

  const form = baseFixture();
  form.homeTeam.form = ['W', 'W', 'W', 'W', 'W'];
  assert.ok(changed(baseP, probabilities(form)), 'form must affect probabilities');

  const standings = baseFixture();
  standings.homeTeam.leagueRank = 1;
  standings.awayTeam.leagueRank = 20;
  assert.ok(changed(baseP, probabilities(standings)), 'standings must affect probabilities');

  const h2h = baseFixture();
  h2h.h2h = {
    homeWins: 5,
    draws: 0,
    awayWins: 0,
    totalLast5: 5,
    scoresLast5: ['2-0', '2-0', '3-1', '1-0', '2-1'],
    source: 'SPORTAPI_AI',
  };
  assert.ok(changed(baseP, probabilities(h2h)), 'H2H must affect probabilities');

  const possession = baseFixture();
  possession.homeTeam.avgPossession = 64;
  possession.awayTeam.avgPossession = 42;
  possession.homeTeam.avgShotsOnTarget = 7;
  possession.awayTeam.avgShotsOnTarget = 3;
  possession.homeTeam.matchStatsSource = 'SPORTAPI_AI';
  possession.awayTeam.matchStatsSource = 'SPORTAPI_AI';
  assert.ok(changed(baseP, probabilities(possession)), 'possession/shots must affect probabilities');

  const xg = baseFixture();
  xg.homeTeam.expectedGoalsAvg = 2.4;
  xg.awayTeam.expectedGoalsAvg = 0.9;
  xg.homeTeam.advancedStatsSource = 'SPORTMONKS';
  xg.awayTeam.advancedStatsSource = 'SPORTMONKS';
  assert.ok(changed(baseP, probabilities(xg)), 'xG must affect probabilities');

  const fatigue = baseFixture();
  fatigue.homeTeam.hasMidweekFatigue72h = true;
  fatigue.homeTeam.scheduleSource = 'SPORTAPI_AI';
  assert.ok(changed(baseP, probabilities(fatigue)), 'fatigue must affect probabilities');

  const squad = baseFixture();
  squad.homeTeam.totalSquadValueEur = 900;
  squad.awayTeam.totalSquadValueEur = 180;
  squad.homeTeam.advancedStatsSource = 'SPORTMONKS';
  squad.awayTeam.advancedStatsSource = 'SPORTMONKS';
  assert.ok(changed(baseP, probabilities(squad)), 'squad value must affect probabilities');

  const rating = baseFixture();
  rating.homeTeam.avgMatchRating = 7.2;
  rating.awayTeam.avgMatchRating = 6.5;
  rating.homeTeam.advancedStatsSource = 'SPORTMONKS';
  rating.awayTeam.advancedStatsSource = 'SPORTMONKS';
  assert.ok(changed(baseP, probabilities(rating)), 'match rating must affect probabilities');
});

test('neutral prior with no observed strength evidence is symmetric', () => {
  const f = baseFixture();
  for (const team of [f.homeTeam, f.awayTeam]) {
    team.leagueRank = null;
    team.points = null;
    team.form = [];
    team.formSource = undefined;
    team.standingsSource = undefined;
    team.matchStatsSource = undefined;
    team.advancedStatsSource = undefined;
    team.avgPossession = null;
    team.avgShotsOnTarget = null;
    team.expectedGoalsAvg = undefined;
    team.avgMatchRating = undefined;
    team.totalSquadValueEur = undefined;
  }
  const p = evaluateFixturePrediction(f, 'none');
  assert.equal(p.homeWinPct, p.awayWinPct);
  assert.ok(p.drawPct > 0);
  assert.ok(p.appliedRules.some((r) => r.ruleNumber === 0 && r.ruleName === 'Team Data Sufficiency Guard'));
});

test('one-sided evidence does not recreate an unconditional home advantage', () => {
  const f = baseFixture();
  f.awayTeam.leagueRank = null;
  f.awayTeam.points = null;
  f.awayTeam.form = [];
  f.awayTeam.formSource = undefined;
  f.awayTeam.standingsSource = undefined;
  const p = evaluateFixturePrediction(f, 'none');
  assert.ok(Number.isFinite(p.homeWinPct) && Number.isFinite(p.awayWinPct));
  assert.ok(p.homeWinPct !== 40.9, 'one-sided evidence must not collapse to the old 40.9% home baseline');
});
